/**
 * Mail templates: pure functions, no I/O and no DI, so they can be tested
 * without booting Nest. Mail clients strip <style> blocks and external
 * stylesheets, so every rule is inline and no asset is remote.
 */

export interface MailTemplate {
  subject: string;
  html: string;
  /** Never omit: HTML-only messages score badly with spam filters. */
  text: string;
}

export interface TemplateInput {
  /** May be null — `User.fullName` is optional. */
  name: string | null;
  /** Absolute SPA URL carrying the token. */
  link: string;
  /** TTL as configured, e.g. "24h". */
  expiresIn: string;
}

/** `fullName` is user-supplied and lands in the message body, so escape it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function greeting(name: string | null): string {
  return escapeHtml(name?.trim() || 'there');
}

const BODY =
  'font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2933;';
const BUTTON =
  'display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;';
const MUTED = 'font-size:13px;color:#52606d;word-break:break-all;';

export function emailVerificationTemplate(input: TemplateInput): MailTemplate {
  const url = escapeHtml(input.link);

  return {
    subject: 'Confirm your email address',
    html: `<div style="${BODY}">
  <p>Hi ${greeting(input.name)},</p>
  <p>Thanks for creating an AI Job Portal account. Confirm this email address to finish setting it up.</p>
  <p><a href="${url}" style="${BUTTON}">Verify email address</a></p>
  <p style="${MUTED}">This link expires in ${escapeHtml(input.expiresIn)}. If the button doesn't work, paste this into your browser:<br /><a href="${url}">${url}</a></p>
  <p style="${MUTED}">If you didn't create this account, you can safely ignore this email.</p>
</div>`,
    text: `Hi ${input.name?.trim() || 'there'},

Thanks for creating an AI Job Portal account. Confirm this email address to finish setting it up:

${input.link}

This link expires in ${input.expiresIn}.

If you didn't create this account, you can safely ignore this email.`,
  };
}

export function passwordResetTemplate(input: TemplateInput): MailTemplate {
  const url = escapeHtml(input.link);

  return {
    subject: 'Reset your password',
    html: `<div style="${BODY}">
  <p>Hi ${greeting(input.name)},</p>
  <p>We received a request to reset the password on your AI Job Portal account.</p>
  <p><a href="${url}" style="${BUTTON}">Choose a new password</a></p>
  <p style="${MUTED}">This link expires in ${escapeHtml(input.expiresIn)} and can be used once. If the button doesn't work, paste this into your browser:<br /><a href="${url}">${url}</a></p>
  <p style="${MUTED}">If you didn't request this, ignore this email — your password will not change.</p>
</div>`,
    text: `Hi ${input.name?.trim() || 'there'},

We received a request to reset the password on your AI Job Portal account. Choose a new one here:

${input.link}

This link expires in ${input.expiresIn} and can be used once.

If you didn't request this, ignore this email — your password will not change.`,
  };
}
