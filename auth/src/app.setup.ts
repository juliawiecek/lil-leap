import helmet from 'helmet';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/** Routing, security headers, validation, and error mapping -- shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  // Health stays unprefixed so it's a fixed, predictable probe path; /rules is its own API surface.
  app.setGlobalPrefix('auth', { exclude: ['health', 'rules/tier-eligibility'] });

  app.use(
    helmet({
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: 'deny' },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
}
