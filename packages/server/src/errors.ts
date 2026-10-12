export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}
