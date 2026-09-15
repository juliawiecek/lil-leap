import { ErrorHandler, Injectable } from '@angular/core';
import { reportApplicationError } from './security';

/** Errors can contain HTTP bodies, headers and form values. Log only a fixed event. */
@Injectable()
export class SafeErrorHandler implements ErrorHandler {
  handleError(_error: unknown): void {
    reportApplicationError(_error);
  }
}
