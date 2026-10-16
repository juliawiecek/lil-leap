import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/** Applied only when TLS_KEYSTORE is set. Rejects plaintext outright -- never redirects a credential-bearing request. `X-Forwarded-*` is ignored; TLS terminates here. */
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
