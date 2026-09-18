import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { UserAlreadyExistsException } from '../../user/exceptions/user-already-exists.exception';
import { InvalidCredentialsException } from '../../user/exceptions/invalid-credentials.exception';
import { InvalidRefreshTokenException } from '../../user/exceptions/invalid-refresh-token.exception';

/** Maps exceptions to HTTP responses. Validation/unexpected-error messages stay generic -- raw messages can carry passwords or SSNs. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof UserAlreadyExistsException) {
      response.status(409).json({ error: 'USER_ALREADY_EXISTS', message: exception.message });
      return;
    }

    if (exception instanceof InvalidCredentialsException) {
      response.status(401).json({ error: 'INVALID_CREDENTIALS', message: exception.message });
      return;
    }

    if (exception instanceof InvalidRefreshTokenException) {
      response.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: exception.message });
      return;
    }

    if (exception instanceof BadRequestException) {
      response.status(400).json({ error: 'INVALID_REQUEST', message: 'The request contains invalid or missing fields.' });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({ error: 'REQUEST_FAILED', message: 'The request could not be completed.' });
      return;
    }

    const err = exception as Error;
    this.logger.error(`Request failed exceptionType=${err?.constructor?.name ?? 'Unknown'}`);
    response.status(500).json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' });
  }
}
