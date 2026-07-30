/**
 * Base API Error class
 * All API errors extend from this class
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code: string = "API_ERROR",
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    this.requestId = requestId;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId,
    };
  }
}

/**
 * Network error - no internet connection or request failed to send
 */
export class NetworkError extends ApiError {
  constructor(message = "Network request failed. Please check your connection.") {
    super(message, 0, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}

/**
 * Timeout error - request took too long
 */
export class TimeoutError extends ApiError {
  constructor(message = "Request timed out. Please try again.") {
    super(message, 408, "TIMEOUT_ERROR");
    this.name = "TimeoutError";
  }
}

/**
 * Authentication error - 401
 */
export class UnauthorizedError extends ApiError {
  constructor(
    message = "You are not authorized. Please log in again.",
    details?: Record<string, unknown>,
  ) {
    super(message, 401, "UNAUTHORIZED", details);
    this.name = "UnauthorizedError";
  }
}

/**
 * Forbidden error - 403
 */
export class ForbiddenError extends ApiError {
  constructor(
    message = "You do not have permission to access this resource.",
    details?: Record<string, unknown>,
  ) {
    super(message, 403, "FORBIDDEN", details);
    this.name = "ForbiddenError";
  }
}

/**
 * Not found error - 404
 */
export class NotFoundError extends ApiError {
  constructor(
    message = "The requested resource was not found.",
    details?: Record<string, unknown>,
  ) {
    super(message, 404, "NOT_FOUND", details);
    this.name = "NotFoundError";
  }
}

/**
 * Validation error - 400/422
 */
export class ValidationError extends ApiError {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(
    message = "Validation failed. Please check your input.",
    fieldErrors: Record<string, string[]> = {},
    details?: Record<string, unknown>,
  ) {
    super(message, 422, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }

  getFieldError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }

  hasFieldError(field: string): boolean {
    return field in this.fieldErrors;
  }
}

/**
 * Rate limit error - 429
 */
export class RateLimitError extends ApiError {
  public readonly retryAfter?: number;

  constructor(
    message = "Too many requests. Please wait before trying again.",
    retryAfter?: number,
  ) {
    super(message, 429, "RATE_LIMIT", { retryAfter });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Server error - 5xx
 */
export class ServerError extends ApiError {
  constructor(
    message = "An unexpected server error occurred. Please try again later.",
    status = 500,
    details?: Record<string, unknown>,
  ) {
    super(message, status, "SERVER_ERROR", details);
    this.name = "ServerError";
  }
}

/**
 * Parse error - response parsing failed
 */
export class ParseError extends ApiError {
  constructor(message = "Failed to parse server response.") {
    super(message, 0, "PARSE_ERROR");
    this.name = "ParseError";
  }
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard for specific error types
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

/**
 * True when the request never really completed — offline (status 0), timed
 * out (408), or the server fell over (5xx). Such a failure says NOTHING
 * about the resource itself, so screens should show a connection problem
 * with a retry — never "this thing doesn't exist".
 */
export function isTransientError(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.status === 0 || error.status === 408 || error.status >= 500)
  );
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}
