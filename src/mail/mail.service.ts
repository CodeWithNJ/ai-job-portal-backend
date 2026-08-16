import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import {
  emailVerificationTemplate,
  passwordResetTemplate,
  type MailTemplate,
} from './templates';

type MailTransportKind = 'log' | 'smtp';

interface OutboundMail extends MailTemplate {
  to: string;
}

/**
 * Outbound transactional email.
 *
 * `MAIL_TRANSPORT=log` builds a nodemailer JSON transport, which satisfies the
 * full `sendMail` contract without opening a socket — the message is written to
 * the logger instead, so the whole verification and reset flow can be built
 * with no SMTP account. `smtp` swaps in a real connection. The choice is made
 * once, at construction, so the send path below is transport-agnostic.
 *
 * Callers pass a fully-formed link; this service never builds URLs. Failures
 * are thrown, not swallowed.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  private transporter!: Transporter;
  private transportKind!: MailTransportKind;
  private fromAddress!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.transportKind = this.resolveTransportKind();
    this.fromAddress = this.resolveFromAddress();
    this.transporter =
      this.transportKind === 'smtp'
        ? this.createSmtpTransporter()
        : createTransport({ jsonTransport: true });

    this.logger.log(
      `Mail transport ready: ${this.transportKind} (from: ${this.fromAddress})`,
    );
  }

  async sendEmailVerification(
    to: string,
    name: string | null,
    link: string,
  ): Promise<void> {
    const expiresIn = this.configService.get<string>(
      'EMAIL_VERIFICATION_TOKEN_TTL',
      '24h',
    );
    await this.send({
      to,
      ...emailVerificationTemplate({ name, link, expiresIn }),
    });
  }

  async sendPasswordReset(
    to: string,
    name: string | null,
    link: string,
  ): Promise<void> {
    const expiresIn = this.configService.get<string>(
      'PASSWORD_RESET_TOKEN_TTL',
      '30m',
    );
    await this.send({
      to,
      ...passwordResetTemplate({ name, link, expiresIn }),
    });
  }

  /** The single delivery path: sender, logging, and error behaviour live here. */
  private async send(mail: OutboundMail): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    if (this.transportKind === 'log') {
      // Nothing left the process — print the text part so the link inside it
      // can be clicked straight out of the terminal.
      this.logger.log(
        `Mail not sent (transport=log)\n  to: ${mail.to}\n  subject: ${mail.subject}\n---\n${mail.text}\n---`,
      );
      return;
    }

    this.logger.log(`Mail sent to ${mail.to} (subject: ${mail.subject})`);
  }

  /** Unset or unrecognised falls back to `log`: never towards sending real mail. */
  private resolveTransportKind(): MailTransportKind {
    const configured = this.configService
      .get<string>('MAIL_TRANSPORT', 'log')
      .trim()
      .toLowerCase();

    if (configured === 'smtp' || configured === 'log') {
      return configured;
    }

    this.logger.warn(
      `Unknown MAIL_TRANSPORT "${configured}"; falling back to "log"`,
    );
    return 'log';
  }

  private resolveFromAddress(): string {
    // Under `log` nothing reaches a provider, so a placeholder is fine. Under
    // `smtp` an empty sender is rejected by every relay, so require it.
    const address =
      this.transportKind === 'smtp'
        ? this.requireEnv('MAIL_FROM')
        : this.configService.get<string>('MAIL_FROM')?.trim() ||
          'no-reply@localhost';

    const displayName = this.configService
      .get<string>('MAIL_FROM_NAME')
      ?.trim();

    return displayName ? `"${displayName}" <${address}>` : address;
  }

  private createSmtpTransporter(): Transporter {
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const password = this.configService.get<string>('SMTP_PASSWORD')?.trim();

    return createTransport({
      host: this.requireEnv('SMTP_HOST'),
      // get<number>() would be an assertion, not a conversion — env is strings.
      port: Number(this.configService.get<string>('SMTP_PORT')) || 587,
      // true = implicit TLS (465); false = STARTTLS upgrade (587).
      secure:
        this.configService.get<string>('SMTP_SECURE', 'false').toLowerCase() ===
        'true',
      // Some relays accept unauthenticated submission from trusted networks.
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
  }

  private requireEnv(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new InternalServerErrorException(
        `${key} is required when MAIL_TRANSPORT=smtp`,
      );
    }

    return value;
  }
}
