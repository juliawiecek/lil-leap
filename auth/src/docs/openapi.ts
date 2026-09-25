import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Swagger UI path. Under /auth/ so nginx already proxies it; the raw spec is at `${API_DOCS_PATH}-json`. */
export const API_DOCS_PATH = 'auth/docs';

/** OpenAPI 3 document generated from the controllers' and DTOs' decorators -- the spec can't drift from the code. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('NextTrade Identity Service')
    .setDescription(
      'Registration, login, token refresh/logout, and trader-tier eligibility. ' +
        'Request bodies for /auth/register use snake_case; every error body is { error, message }.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token from /auth/login.' })
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Serves Swagger UI at /auth/docs and the JSON spec at /auth/docs-json. */
export function setupApiDocs(app: INestApplication): void {
  SwaggerModule.setup(API_DOCS_PATH, app, buildOpenApiDocument(app));
}
