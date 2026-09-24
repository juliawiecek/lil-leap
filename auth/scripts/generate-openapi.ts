import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { configureApp } from '../src/app.setup';
import { buildOpenApiDocument } from '../src/docs/openapi';
import { OpenApiDocsModule } from '../src/docs/openapi-docs.module';

/** Path of the committed spec, readable on GitHub without running the service. */
export const OPENAPI_FILE = path.join(__dirname, '..', 'openapi.json');

/** The spec exactly as it is committed: pretty-printed with a trailing newline. */
export async function renderOpenApiJson(): Promise<string> {
  const app = await NestFactory.create(OpenApiDocsModule, { logger: false });
  configureApp(app);
  try {
    return JSON.stringify(buildOpenApiDocument(app), null, 2) + '\n';
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  renderOpenApiJson().then((json) => {
    fs.writeFileSync(OPENAPI_FILE, json);
    console.log(`Wrote ${OPENAPI_FILE}`);
  });
}
