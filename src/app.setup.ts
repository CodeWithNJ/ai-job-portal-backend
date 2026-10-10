import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { raw } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { formatValidationErrors } from './common/utils/format-validation-errors';

/**
 * Applies the app-wide middleware, pipes, interceptors and filters. Shared by
 * `main.ts` and the e2e tests so tests exercise the same request pipeline as
 * the running server.
 */
export function configureApp(app: INestApplication): void {
  // Security headers on every response, including errors. Registered first so
  // nothing can respond before it runs.
  app.use(
    helmet({
      // Default is `same-origin`, which would stop the frontend from loading
      // API-served files (e.g. a resume preview) in no-cors contexts like
      // <iframe>/<embed>. `same-site` still blocks other sites: localhost
      // ports, and app.example.com vs api.example.com, count as same-site.
      // CORS fetch/XHR calls are unaffected either way.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(cookieParser());

  // Signed-URL resume uploads PUT the raw file bytes (PDF/DOCX), which the
  // default JSON body parser ignores — capture them as a Buffer instead.
  const maxResumeSizeMb = Number(process.env.MAX_RESUME_SIZE_MB) || 10;
  app.use(
    '/uploads/resumes',
    raw({ type: () => true, limit: `${maxResumeSizeMb}mb` }),
  );

  // The frontend (Vite dev server) is served from a different origin and
  // relies on HttpOnly auth cookies, so we must allow credentialed CORS.
  // CORS_ORIGIN supports a comma-separated list; falls back to common Vite
  // dev origins for local development.
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const corsOrigin = corsOriginEnv
    ? corsOriginEnv
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // Collapse each failing property to its single most explanatory message
      // instead of every constraint it tripped. Kept in sync with the
      // runtime-DTO path in `validateBody`, which uses the same formatter.
      exceptionFactory: (errors) =>
        new BadRequestException(formatValidationErrors(errors)),
    }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new AllExceptionsFilter());
}
