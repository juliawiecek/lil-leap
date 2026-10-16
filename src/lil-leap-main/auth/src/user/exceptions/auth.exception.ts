import { HttpStatus } from '@nestjs/common';

/**
 * Base for the service's expected failures. Each subclass fixes its HTTP status,
 * error code, and generic message, so GlobalExceptionFilter maps them all in one branch.
 */
export abstract class AuthException extends Error {
  abstract readonly status: HttpStatus;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
