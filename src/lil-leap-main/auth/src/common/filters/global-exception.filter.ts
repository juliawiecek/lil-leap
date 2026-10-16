import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AuthException } from '../../user/exceptions/auth.exception';

/** Maps exceptions to HTTP responses. Validation/unexpected-error messages stay generic -- raw messages can carry passwords or SSNs. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AuthException) {
      response.status(exception.status).json({ error: exception.code, message: exception.message });
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
