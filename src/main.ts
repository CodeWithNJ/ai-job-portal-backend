import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { raw } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
    }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
