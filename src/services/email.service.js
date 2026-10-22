import nodemailer from 'nodemailer';

let transporter;
let transporterSignature;

function readSmtpConfig() {
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER)?.trim();
  const pass = process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD;
  const isGmail = user?.toLowerCase().endsWith('@gmail.com');
  const host = (process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : ''))?.trim();
  const port = Number(process.env.SMTP_PORT || (isGmail ? 465 : 587));

  const missing = [
    ['SMTP_HOST', host],
    ['SMTP_USER', user],
    ['SMTP_PASS', pass],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) {
    throw new Error(`Email is not configured. Set ${missing.join(', ')} in the backend environment.`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port between 1 and 65535.');
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === undefined
      ? port === 465
      : process.env.SMTP_SECURE.toLowerCase() === 'true',
    user,
    pass,
    from: process.env.SMTP_FROM?.trim() || process.env.EMAIL_USER?.trim() || user,
  };
}

function getTransporter(config) {
  const signature = JSON.stringify([config.host, config.port, config.secure, config.user, config.pass]);
  if (!transporter || signature !== transporterSignature) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    transporterSignature = signature;
  }
  return transporter;
}

/** Send email through the backend's shared SMTP transporter. */
export async function sendEmail({ to, subject, text, html, ...options }) {
  if (!to) throw new TypeError('An email recipient is required.');
  if (!subject) throw new TypeError('An email subject is required.');
  if (!text && !html) throw new TypeError('Email content is required in text or html form.');

  const config = readSmtpConfig();
  return getTransporter(config).sendMail({
    ...options,
    from: config.from,
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
  });
}

/** Check SMTP credentials and connectivity without sending a message. */
export async function verifyEmailConfiguration() {
  const config = readSmtpConfig();
  return getTransporter(config).verify();
}
