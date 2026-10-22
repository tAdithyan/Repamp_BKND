import 'dotenv/config';
import nodemailer from 'nodemailer';

let transporter;
let transporterSignature;

function readGmailConfig() {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  const missing = [
    ['EMAIL_USER', user],
    ['EMAIL_APP_PASSWORD', pass],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Email is not configured. Set ${missing.join(' and ')} in the backend environment.`);
  }
  if (!/^[^\s@]+@gmail\.com$/i.test(user)) {
    throw new Error('EMAIL_USER must be a Gmail address for the Gmail mailer.');
  }

  return { user, pass };
}

function getTransporter({ user, pass }) {
  const signature = `${user}\u0000${pass}`;
  if (!transporter || signature !== transporterSignature) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    transporterSignature = signature;
  }
  return transporter;
}

/** Send an email through Gmail using the shared Nodemailer transport. */
export async function sendEmail(message = {}) {
  const { to, subject, text, html, ...messageOptions } = message || {};
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new TypeError('An email recipient is required.');
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    throw new TypeError('A non-empty email subject is required.');
  }
  if (!(typeof text === 'string' && text.trim()) && !(typeof html === 'string' && html.trim())) {
    throw new TypeError('Email content is required in text or html form.');
  }

  const config = readGmailConfig();
  return getTransporter(config).sendMail({
    ...messageOptions,
    from: config.user,
    to,
    subject: subject.trim(),
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
  });
}

/** Verify Gmail authentication/connectivity. This does not send a message. */
export async function verifyEmailConfiguration() {
  const config = readGmailConfig();
  return getTransporter(config).verify();
}
