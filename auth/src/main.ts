import 'reflect-metadata';
import * as fs from 'fs';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/**
 * Bootstraps the Identity Service. TLS is opt-in via TLS_KEYSTORE: the architecture
 * branch's nginx configs proxy_pass plaintext HTTP to this service internally
 * (TLS terminates elsewhere in that topology), so plaintext is the default here.
 */
async function bootstrap(): Promise<void> {
  // Matches docker-compose.yml's auth secret mount; "file:" prefix optional.
  const rawKeystorePath = process.env.TLS_KEYSTORE;
  const keystorePath = rawKeystorePath?.startsWith('file:') ? rawKeystorePath.slice('file:'.length) : rawKeystorePath;

  let app: NestExpressApplication;
  if (keystorePath) {
    if (!fs.existsSync(keystorePath)) {
      throw new Error(`TLS_KEYSTORE set to ${keystorePath} but no keystore found there; refusing to start on plaintext HTTP.`);
    }
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      httpsOptions: {
        pfx: fs.readFileSync(keystorePath),
        passphrase: process.env.TLS_KEYSTORE_PASSWORD ?? '',
      },
    });
  } else {
    app = await NestFactory.create<NestExpressApplication>(AppModule);
  }

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
