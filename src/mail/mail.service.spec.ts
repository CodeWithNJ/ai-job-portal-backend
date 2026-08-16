import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const configStub = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  }) as unknown as ConfigService;

const buildService = (values: Record<string, string>): MailService => {
  const service = new MailService(configStub(values));
  service.onModuleInit();
  return service;
};

describe('MailService', () => {
  const LINK = 'http://localhost:5173/verify-email?token=abc123';
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  const loggedText = (): string =>
    (logSpy.mock.calls as unknown[][])
      .map((call) => String(call[0]))
      .join('\n');

  it('renders the message to the logger without opening a connection', async () => {
    const service = buildService({
      MAIL_TRANSPORT: 'log',
      EMAIL_VERIFICATION_TOKEN_TTL: '24h',
    });

    await service.sendEmailVerification('asha@example.com', 'Asha', LINK);

    const output = loggedText();
    expect(output).toContain('transport=log');
    expect(output).toContain('Confirm your email address');
    expect(output).toContain('expires in 24h');
    expect(output).toContain(LINK);
  });

  it('falls back to a greeting when the user has no full name', async () => {
    const service = buildService({ MAIL_TRANSPORT: 'log' });

    await service.sendPasswordReset('asha@example.com', null, LINK);

    expect(loggedText()).toContain('Hi there,');
  });

  it('defaults to the log transport and warns on an unknown value', async () => {
    const service = buildService({ MAIL_TRANSPORT: 'carrier-pigeon' });

    await service.sendEmailVerification('asha@example.com', 'Asha', LINK);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown MAIL_TRANSPORT'),
    );
    expect(loggedText()).toContain('transport=log');
  });

  it('requires MAIL_FROM and SMTP_HOST under the smtp transport', () => {
    expect(() => buildService({ MAIL_TRANSPORT: 'smtp' })).toThrow(
      /MAIL_FROM is required/,
    );

    expect(() =>
      buildService({
        MAIL_TRANSPORT: 'smtp',
        MAIL_FROM: 'no-reply@example.com',
      }),
    ).toThrow(/SMTP_HOST is required/);
  });
});
