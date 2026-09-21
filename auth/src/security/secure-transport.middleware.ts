import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/** Rejects plaintext requests outright -- never redirects a credential-bearing one. `X-Forwarded-*` is ignored; TLS terminates here. */
@Injectable()
export class SecureTransportMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!req.secure) {
      res.status(403).type('application/json').send({ error: 'HTTPS_REQUIRED', message: 'HTTPS is required.' });
      return;
    }
    next();
  }
}
