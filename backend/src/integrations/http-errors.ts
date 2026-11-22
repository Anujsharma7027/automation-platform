import {
  ConflictException, HttpException, ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuthRequiredError, IntegrationError, PermanentIntegrationError, RateLimitError,
} from '../engine/core/errors';

/** Maps engine errors to HTTP responses for interactive (builder) calls. */
export function toHttpError(error: unknown): unknown {
  if (error instanceof HttpException) return error;
  if (error instanceof AuthRequiredError) return new ConflictException({ message: error.message, code: 'AUTH_REQUIRED' });
  if (error instanceof PermanentIntegrationError) return new UnprocessableEntityException({ message: error.message, code: 'INVALID_REQUEST' });
  if (error instanceof RateLimitError) return new ServiceUnavailableException({ message: 'The app is rate limiting requests. Try again shortly.', code: 'RATE_LIMITED' });
  if (error instanceof IntegrationError) return new ServiceUnavailableException({ message: error.message, code: 'UNAVAILABLE' });
  return new ServiceUnavailableException({ message: 'The app could not be reached. Try again.', code: 'UNAVAILABLE' });
}

export async function interactive<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw toHttpError(error);
  }
}
