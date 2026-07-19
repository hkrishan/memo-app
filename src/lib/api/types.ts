/**
 * HTTP Methods
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Request configuration options
 */
export interface RequestConfig {
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts for failed requests */
  retries?: number;
  /** Skip authentication header */
  skipAuth?: boolean;
  /** Custom signal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Full request options including body
 */
export interface RequestOptions<TBody = unknown> extends RequestConfig {
  method: HttpMethod;
  endpoint: string;
  body?: TBody;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
  };
}

/**
 * Standard API error response from server
 */
export interface ApiErrorResponse {
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

/**
 * Request interceptor function type
 */
export type RequestInterceptor = (
  config: RequestOptions,
) => RequestOptions | Promise<RequestOptions>;

/**
 * Response interceptor function type
 */
export type ResponseInterceptor = <T>(
  response: ApiResponse<T>,
) => ApiResponse<T> | Promise<ApiResponse<T>>;

/**
 * Error interceptor function type
 */
export type ErrorInterceptor = (error: Error) => Error | Promise<Error>;

/**
 * HTTP Client configuration
 */
export interface HttpClientConfig {
  /** Base URL for all requests */
  baseUrl: string;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Default headers for all requests */
  defaultHeaders?: Record<string, string>;
  /** Default number of retries */
  retries?: number;
  /** Enable request/response logging in development */
  enableLogging?: boolean;
}

/**
 * Token pair for authentication
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Token refresh function type
 */
export type TokenRefreshFn = () => Promise<AuthTokens | null>;
