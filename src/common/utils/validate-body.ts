import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

/**
 * Validates an untyped request body against a DTO class and returns the typed
 * instance. Exists for routes whose DTO is chosen at runtime (e.g.
 * `PATCH /profiles/me` validates against a job-seeker or recruiter DTO
 * depending on the caller's role), which the global ValidationPipe cannot do.
 *
 * Mirrors the global pipe's behaviour: unknown properties are rejected.
 */
export async function validateBody<T extends object>(
  cls: ClassConstructor<T>,
  body: unknown,
): Promise<T> {
  const instance = plainToInstance(cls, body ?? {});
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    throw new BadRequestException(flattenValidationErrors(errors));
  }

  return instance;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) =>
      parentPath ? `${path}: ${message}` : message,
    );
    const nested = error.children?.length
      ? flattenValidationErrors(error.children, path)
      : [];
    return [...own, ...nested];
  });
}
