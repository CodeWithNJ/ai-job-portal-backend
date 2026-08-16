import { Logger } from '@nestjs/common';

const logger = new Logger('parseExpiryToSeconds');

/**
 * Parses values like `15m`, `7d`, `3600s`, or a bare number of seconds and
 * returns the equivalent number of seconds.
 */
export function parseExpiryToSeconds(
  expression: string,
  fallbackSeconds = 900,
): number {
  const trimmed = expression.trim();
  const match = /^(\d+)\s*([smhd])?$/i.exec(trimmed);

  if (!match) {
    logger.warn(
      `Unable to parse expiry expression "${expression}"; defaulting to ${fallbackSeconds}s`,
    );
    return fallbackSeconds;
  }

  const value = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();

  const unitToSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return value * unitToSeconds[unit];
}
