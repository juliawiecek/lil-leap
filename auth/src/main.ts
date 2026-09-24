import 'reflect-metadata';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { tlsKeystorePath } from './security/tls';

/**
 * Bootstraps the Identity Service. TLS is opt-in via TLS_KEYSTORE: the architecture
 * branch's nginx configs proxy_pass plaintext HTTP to this service internally
 * (TLS terminates elsewhere in that topology), so plaintext is the default here.
 */
async function bootstrap(): Promise<void> {
  const keystorePath = tlsKeystorePath();

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

  configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
