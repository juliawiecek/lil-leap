import helmet from 'helmet';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { API_DOCS_PATH, setupApiDocs } from './docs/openapi';

const securityHeaders = (scriptAndStyleSources: string[] | null) =>
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: scriptAndStyleSources
        ? {
            // Swagger UI loads its own bundled JS/CSS and injects inline styles.
            defaultSrc: ["'self'"],
            scriptSrc: scriptAndStyleSources,
            styleSrc: [...scriptAndStyleSources, "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            frameAncestors: ["'none'"],
          }
        : { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });

/** Routing, security headers, validation, and error mapping -- shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  // Health stays unprefixed so it's a fixed, predictable probe path; /rules is its own API surface.
  app.setGlobalPrefix('auth', { exclude: ['health', 'rules/tier-eligibility'] });

  // The API itself serves no documents, so it gets the strictest policy; only the docs pages load assets.
  const apiHeaders = securityHeaders(null);
  const docsHeaders = securityHeaders(["'self'"]);
  const docsPrefix = `/${API_DOCS_PATH}`;
  app.use((req: { path: string }, res: unknown, next: () => void) =>
    (req.path.startsWith(docsPrefix) ? docsHeaders : apiHeaders)(req as never, res as never, next),
  );
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  setupApiDocs(app);
}
