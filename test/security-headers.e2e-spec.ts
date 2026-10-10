import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/**
 * Helmet headers and credentialed CORS, checked through the same pipeline
 * main.ts uses. Read-only: creates no data.
 */
describe('Security headers (e2e)', () => {
  const FRONTEND_ORIGIN = 'http://localhost:5173';
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Pin the allowed origin so the CORS checks don't depend on local .env.
    process.env.CORS_ORIGIN = FRONTEND_ORIGIN;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const expectHelmetHeaders = (res: Response) => {
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['x-powered-by']).toBeUndefined();
  };

  it('sets security headers on successful responses', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expectHelmetHeaders(res);
  });

  it('sets security headers on error responses too', async () => {
    const res = await request(app.getHttpServer())
      .get('/does-not-exist')
      .expect(404);
    expectHelmetHeaders(res);
  });

  it('still allows credentialed CORS preflight from the frontend', async () => {
    const res = await request(app.getHttpServer())
      .options('/users/signin')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS to other origins', async () => {
    const res = await request(app.getHttpServer())
      .options('/users/signin')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
