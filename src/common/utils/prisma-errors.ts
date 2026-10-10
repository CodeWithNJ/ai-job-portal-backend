import { Prisma } from '@prisma/client';

/**
 * True when Prisma rejected a write because it would duplicate a unique
 * column (P2002). Services catch this to turn a lost check-then-insert race
 * into a 409 instead of a generic 500.
 */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
