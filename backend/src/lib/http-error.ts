/**
 * An error that maps directly to an HTTP response.
 *
 * Services throw it for expected failures (not found, conflict, invalid input); the central
 * error handler turns it into `{ error: { code, message, details? } }` with the given status.
 * Any other thrown value is treated as an unexpected bug and answered with a generic 500,
 * so internal details never leak to clients.
 *
 * `message` is written for end users (Vietnamese) because the site shows it as-is;
 * `code` is stable and meant for programs.
 */
export interface FieldIssue {
  /** Dotted path of the offending field, e.g. "customer.email". */
  path: string;
  message: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: FieldIssue[],
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static validation(details: FieldIssue[]): HttpError {
    return new HttpError(400, 'VALIDATION_ERROR', 'Thông tin chưa hợp lệ, vui lòng kiểm tra lại.', details);
  }

  static unauthorized(message = 'Vui lòng đăng nhập.'): HttpError {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Bạn không có quyền truy cập.'): HttpError {
    return new HttpError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Không tìm thấy dữ liệu.'): HttpError {
    return new HttpError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string): HttpError {
    return new HttpError(409, code, message);
  }

  /** The request is well-formed but breaks a business rule (e.g. too many guests). */
  static unprocessable(code: string, message: string): HttpError {
    return new HttpError(422, code, message);
  }

  /** An upstream service (payment provider) failed; the client may retry. */
  static badGateway(message: string): HttpError {
    return new HttpError(502, 'UPSTREAM_ERROR', message);
  }
}
