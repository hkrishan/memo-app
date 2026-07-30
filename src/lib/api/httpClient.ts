import { env } from "@/lib/env";
import {
  ApiError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  ParseError,
  RateLimitError,
  ServerError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { tokenStorage } from "./tokenStorage";
import {
  ApiErrorResponse,
  ApiResponse,
  ErrorInterceptor,
  HttpClientConfig,
  HttpMethod,
  RequestConfig,
  RequestInterceptor,
  RequestOptions,
  ResponseInterceptor,
  TokenRefreshFn,
} from "./types";

// A JSON API call that hasn't answered in 15s isn't going to — failing
// fast is what lets screens fall back to cached content instead of
// spinning. Uploads are different: a photo on a slow cell link can
// legitimately take minutes, so they get their own budget.
const DEFAULT_TIMEOUT = 15000;
const DEFAULT_UPLOAD_TIMEOUT = 120000;
const DEFAULT_RETRIES = 2;

/**
 * HTTP Client with interceptors, retry logic, and comprehensive error handling
 */
class HttpClient {
  private config: HttpClientConfig;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private tokenRefreshFn: TokenRefreshFn | null = null;
  private onSessionExpired: (() => void) | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: DEFAULT_TIMEOUT,
      retries: DEFAULT_RETRIES,
      enableLogging: env.isDevelopment,
      ...config,
    };
  }

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Set token refresh function for automatic token refresh
   */
  setTokenRefreshFn(fn: TokenRefreshFn): void {
    this.tokenRefreshFn = fn;
  }

  /**
   * Called when a session can no longer be refreshed, so the app can log the
   * user out instead of leaving them stranded with endless 401s.
   */
  setOnSessionExpired(fn: () => void): void {
    this.onSessionExpired = fn;
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    // Ensure baseUrl ends with / and endpoint doesn't start with /
    const base = this.config.baseUrl.endsWith("/")
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;
    const path = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

    const url = new URL(path, base);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Apply request interceptors
   */
  private async applyRequestInterceptors(
    config: RequestOptions,
  ): Promise<RequestOptions> {
    let result = config;
    for (const interceptor of this.requestInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Apply response interceptors
   */
  private async applyResponseInterceptors<T>(
    response: ApiResponse<T>,
  ): Promise<ApiResponse<T>> {
    let result = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Apply error interceptors
   */
  private async applyErrorInterceptors(error: Error): Promise<Error> {
    let result = error;
    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Log request/response in development. Never log credentials or tokens.
   */
  private log(
    type: "request" | "response" | "error",
    method: string,
    url: string,
    data?: unknown,
  ): void {
    if (!this.config.enableLogging) return;

    const emoji = type === "request" ? "➡️" : type === "response" ? "✅" : "❌";
    // Responses log a size summary, not the body: serializing a 400KB
    // photo-list payload into the Metro console blocked the JS thread and
    // dominated any dev profiling
    if (type === "response") {
      let size = "";
      try {
        size = data ? ` (${JSON.stringify(data).length} bytes)` : "";
      } catch {
        // Unserializable body — the size is cosmetic
      }
      console.log(`${emoji} [${method}] ${url}${size}`);
      return;
    }
    console.log(`${emoji} [${method}] ${url}`, this.sanitizeForLog(data) ?? "");
  }

  private sanitizeForLog(data: unknown): unknown {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;

    const SENSITIVE = /password|token|secret|authorization/i;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = SENSITIVE.test(key) ? "[REDACTED]" : value;
    }
    return result;
  }

  /**
   * Parse error response from server
   */
  private async parseErrorResponse(
    response: Response,
  ): Promise<ApiErrorResponse> {
    try {
      const data = await response.json();
      return {
        message: data.message || data.error || "An error occurred",
        code: data.code,
        errors: data.errors,
        details: data,
      };
    } catch {
      return {
        message: response.statusText || "An error occurred",
      };
    }
  }

  /**
   * Create appropriate error based on status code
   */
  private async createError(response: Response): Promise<ApiError> {
    const errorData = await this.parseErrorResponse(response);
    const requestId = response.headers.get("x-request-id") ?? undefined;

    switch (response.status) {
      case 401:
        return new UnauthorizedError(errorData.message, errorData.details);

      case 403:
        return new ForbiddenError(errorData.message, errorData.details);

      case 404:
        return new NotFoundError(errorData.message, errorData.details);

      case 422:
      case 400:
        return new ValidationError(
          errorData.message,
          errorData.errors ?? {},
          errorData.details,
        );

      case 429:
        const retryAfter = response.headers.get("retry-after");
        return new RateLimitError(
          errorData.message,
          retryAfter ? parseInt(retryAfter, 10) : undefined,
        );

      default:
        if (response.status >= 500) {
          return new ServerError(
            errorData.message,
            response.status,
            errorData.details,
          );
        }
        return new ApiError(
          errorData.message,
          response.status,
          errorData.code ?? "UNKNOWN_ERROR",
          errorData.details,
          requestId,
        );
    }
  }

  /**
   * Handle token refresh
   */
  private async handleTokenRefresh(): Promise<boolean> {
    if (!this.tokenRefreshFn) {
      return false;
    }

    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing) {
      return this.refreshPromise ?? Promise.resolve(false);
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      const hadTokens = !!(await tokenStorage.getTokens());
      let refreshed = false;
      // A refresh that THROWS failed in transit (offline, timeout, server
      // down) — that is not a verdict on the session, so the tokens stay
      // and the caller's request just fails; a later request will refresh
      // again. Only a `null` RETURN (the server rejected the refresh
      // token) may end the session.
      let sessionRejected = false;
      try {
        const tokens = await this.tokenRefreshFn!();
        if (tokens) {
          await tokenStorage.setTokens(tokens);
          refreshed = true;
        } else {
          sessionRejected = true;
        }
      } catch {
        refreshed = false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }

      if (sessionRejected && hadTokens) {
        // The session is dead — clear it and let the app route to login
        await tokenStorage.clearTokens();
        this.onSessionExpired?.();
      }

      return refreshed;
    })();

    return this.refreshPromise;
  }

  /**
   * Execute a request with retry logic
   */
  private async executeWithRetry<T>(
    options: RequestOptions,
    retriesLeft: number,
    hasRefreshed = false,
  ): Promise<ApiResponse<T>> {
    const {
      method,
      endpoint,
      body,
      params,
      headers,
      timeout,
      skipAuth,
      signal,
    } = options;

    const url = this.buildUrl(endpoint, params);

    // Build headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.config.defaultHeaders,
      ...headers,
    };

    // Add auth token if not skipped
    if (!skipAuth) {
      const token = await tokenStorage.getAccessToken();
      if (token) {
        requestHeaders["Authorization"] = `Bearer ${token}`;
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => {
        controller.abort();
      },
      timeout ?? this.config.timeout ?? DEFAULT_TIMEOUT,
    );

    // Combine with external signal if provided
    const onExternalAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    this.log("request", method, url, body);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle successful response
      if (response.ok) {
        let data: T;
        const contentType = response.headers.get("content-type");

        if (contentType?.includes("application/json")) {
          try {
            data = await response.json();
          } catch {
            throw new ParseError();
          }
        } else {
          // Handle empty or non-JSON responses
          data = null as T;
        }

        this.log("response", method, url, data);

        return this.applyResponseInterceptors({
          data,
          status: response.status,
          headers: response.headers,
        });
      }

      // Handle 401 with token refresh — retry at most once so a server that
      // keeps returning 401 can't cause an unbounded refresh/retry loop
      if (response.status === 401 && !skipAuth && !hasRefreshed) {
        const refreshed = await this.handleTokenRefresh();
        if (refreshed) {
          // Retry the request with new token
          return this.executeWithRetry(options, retriesLeft, true);
        }
      }

      // Create and throw appropriate error
      const error = await this.createError(response);
      throw error;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError();
      }

      // Handle network errors — RN's fetch throws TypeError("Network
      // request failed") on any transport failure (offline, DNS, TLS)
      if (error instanceof TypeError) {
        throw new NetworkError();
      }

      // Handle API errors
      if (error instanceof ApiError) {
        // Retry on server errors
        if (
          error instanceof ServerError &&
          retriesLeft > 0 &&
          method === "GET"
        ) {
          await this.delay(1000 * (DEFAULT_RETRIES - retriesLeft + 1));
          return this.executeWithRetry(options, retriesLeft - 1, hasRefreshed);
        }

        // Retry on rate limit with backoff
        if (error instanceof RateLimitError && retriesLeft > 0) {
          const waitTime = (error.retryAfter ?? 5) * 1000;
          await this.delay(waitTime);
          return this.executeWithRetry(options, retriesLeft - 1, hasRefreshed);
        }

        this.log("error", method, url, error);
        const processedError = await this.applyErrorInterceptors(error);
        throw processedError;
      }

      // Handle unknown errors
      this.log("error", method, url, error);
      throw new NetworkError(
        error instanceof Error ? error.message : "Unknown error occurred",
      );
    } finally {
      if (signal) {
        signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make a request
   */
  async request<TResponse, TBody = unknown>(
    options: RequestOptions<TBody>,
  ): Promise<ApiResponse<TResponse>> {
    // Apply request interceptors
    const processedOptions = await this.applyRequestInterceptors(
      options as RequestOptions,
    );

    return this.executeWithRetry<TResponse>(
      processedOptions,
      options.retries ?? this.config.retries ?? DEFAULT_RETRIES,
    );
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const response = await this.request<T>({
      method: "GET",
      endpoint,
      ...config,
    });
    return response.data;
  }

  /**
   * POST request
   */
  async post<T, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    config?: RequestConfig,
  ): Promise<T> {
    const response = await this.request<T, TBody>({
      method: "POST",
      endpoint,
      body,
      ...config,
    });
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    config?: RequestConfig,
  ): Promise<T> {
    const response = await this.request<T, TBody>({
      method: "PUT",
      endpoint,
      body,
      ...config,
    });
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    config?: RequestConfig,
  ): Promise<T> {
    const response = await this.request<T, TBody>({
      method: "PATCH",
      endpoint,
      body,
      ...config,
    });
    return response.data;
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const response = await this.request<T>({
      method: "DELETE",
      endpoint,
      ...config,
    });
    return response.data;
  }

  /**
   * Upload file with FormData (multipart/form-data)
   */
  async upload<T>(
    endpoint: string,
    formData: FormData,
    config?: Omit<RequestConfig, "body">,
    hasRefreshed = false,
  ): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);

    // Build headers without Content-Type (let fetch set it with boundary)
    const requestHeaders: Record<string, string> = {
      Accept: "application/json",
      ...this.config.defaultHeaders,
      ...config?.headers,
    };

    // Add auth token if not skipped
    if (!config?.skipAuth) {
      const token = await tokenStorage.getAccessToken();
      if (token) {
        requestHeaders["Authorization"] = `Bearer ${token}`;
      }
    }

    // Create abort controller for timeout (uploads get the long budget —
    // a multipart body on a slow link is not a hung request)
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config?.timeout ?? DEFAULT_UPLOAD_TIMEOUT,
    );

    const onExternalAbort = () => controller.abort();
    if (config?.signal) {
      config.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    this.log("request", "UPLOAD", url, "[FormData]");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        this.log("response", "UPLOAD", url, data);
        return data;
      }

      // Handle 401 with token refresh — retry at most once
      if (response.status === 401 && !config?.skipAuth && !hasRefreshed) {
        const refreshed = await this.handleTokenRefresh();
        if (refreshed) {
          return this.upload(endpoint, formData, config, true);
        }
      }

      const error = await this.createError(response);
      throw error;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError();
      }

      if (error instanceof TypeError) {
        throw new NetworkError();
      }

      if (error instanceof ApiError) {
        this.log("error", "UPLOAD", url, error);
        throw error;
      }

      throw new NetworkError(
        error instanceof Error ? error.message : "Upload failed",
      );
    } finally {
      if (config?.signal) {
        config.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}

// Create and export the default client instance
export const httpClient = new HttpClient({
  baseUrl: env.apiUrl,
  enableLogging: env.isDevelopment,
});

// Export the class for custom instances
export { HttpClient };
