import * as fs from 'fs';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OpenAPIObject } from '@nestjs/swagger';
import { configureApp } from '../app.setup';
import { buildOpenApiDocument } from './openapi';
import { OpenApiDocsModule } from './openapi-docs.module';
import { OPENAPI_FILE, renderOpenApiJson } from '../../scripts/generate-openapi';

/** The real controllers and app setup (OpenApiDocsModule), with services stubbed so no database is needed. */
describe('OpenAPI docs (NEXT-152)', () => {
  let app: INestApplication;
  let spec: OpenAPIObject;

  const schema = (name: string) => spec.components!.schemas![name] as { properties: Record<string, unknown>; required?: string[] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [OpenApiDocsModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    spec = buildOpenApiDocument(app);
  });

  afterAll(() => app?.close());

  it('committed openapi.json matches the code -- run `npm run docs:openapi` if this fails', async () => {
    expect(fs.readFileSync(OPENAPI_FILE, 'utf-8').replace(/\r\n/g, '\n')).toBe(await renderOpenApiJson());
  });

  it('covers every endpoint at the path it is actually served on', () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/auth/login',
      '/auth/logout',
      '/auth/refresh',
      '/auth/register',
      '/health',
      '/rules/tier-eligibility',
    ]);
  });

  it('documents the register body in its snake_case wire format, without trader_level', () => {
    const register = schema('RegisterRequestDto');

    expect(register.properties).toHaveProperty('user_role');
    expect(register.properties).toHaveProperty('net_worth_bracket');
    expect(register.properties).toHaveProperty('annual_income');
    expect(register.properties).not.toHaveProperty('trader_level'); // assigned by the server (TS-06.4)
    expect(register.properties).not.toHaveProperty('firstName');
    expect(register.properties).not.toHaveProperty('_businessRules');
    expect(register.required?.sort()).toEqual(['email', 'password', 'user_role']);
  });

  it('documents every error status each endpoint can return', () => {
    const statuses = (path: string, method: 'get' | 'post') => Object.keys(spec.paths[path][method]!.responses).sort();

    expect(statuses('/auth/register', 'post')).toEqual(['201', '400', '409', '422']);
    expect(statuses('/auth/login', 'post')).toEqual(['200', '400', '401']);
    expect(statuses('/auth/refresh', 'post')).toEqual(['200', '400', '401']);
    expect(statuses('/auth/logout', 'post')).toEqual(['204', '400']);
    expect(statuses('/rules/tier-eligibility', 'get')).toEqual(['200', '401', '404']);
  });

  it('marks tier-eligibility as needing a Bearer token and documents its nullable next-tier fields', () => {
    expect(spec.paths['/rules/tier-eligibility'].get!.security).toEqual([{ bearer: [] }]);
    expect(schema('TierEligibilityResponseDto').properties).toMatchObject({
      next_tier: { nullable: true },
      gap_to_next_tier: { nullable: true },
    });
  });

  it('serves Swagger UI and the JSON spec', async () => {
    const ui = await request(app.getHttpServer()).get('/auth/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
    expect(ui.headers['content-security-policy']).toContain("script-src 'self'");

    const json = await request(app.getHttpServer()).get('/auth/docs-json').expect(200);
    expect(json.body.info.title).toBe('NextTrade Identity Service');
  });

  it('keeps the strict security policy on the API itself', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
