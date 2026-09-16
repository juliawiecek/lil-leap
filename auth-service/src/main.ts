import 'reflect-metadata';
import * as fs from 'fs';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/** Bootstraps the Identity Service. Direct TLS only -- a missing keystore fails startup closed, never falls back to plaintext HTTP. */
async function bootstrap(): Promise<void> {
  // Matches docker-compose.yml's auth-service secret mount; "file:" prefix optional.
  const rawKeystorePath = process.env.TLS_KEYSTORE ?? 'file:./certs/auth-service.p12';
  const keystorePath = rawKeystorePath.startsWith('file:') ? rawKeystorePath.slice('file:'.length) : rawKeystorePath;
  const keystorePassword = process.env.TLS_KEYSTORE_PASSWORD ?? '';

  if (!fs.existsSync(keystorePath)) {
    throw new Error(`TLS keystore not found at ${keystorePath}; refusing to start on plaintext HTTP.`);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions: {
      pfx: fs.readFileSync(keystorePath),
      passphrase: keystorePassword,
    },
  });

  // Health stays unprefixed so it's a fixed, predictable probe path.
  app.setGlobalPrefix('auth', { exclude: ['health'] });

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

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
