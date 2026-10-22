import 'dotenv/config';
import { sendEmail, verifyEmailConfiguration } from '../src/services/email.service.js';

const testRecipient = process.argv[2]?.trim();

try {
  await verifyEmailConfiguration();
  console.info('Gmail authentication and connection verified.');

  if (testRecipient) {
    const result = await sendEmail({
      to: testRecipient,
      subject: 'REPAMP email delivery test',
      text: 'This is a test email from the REPAMP backend.',
      html: '<p>This is a test email from the REPAMP backend.</p>',
    });
    console.info(`Test email sent. Message ID: ${result.messageId}`);
  } else {
    console.info('No test email sent. Pass a recipient address to send one.');
  }
} catch (error) {
  console.error('Gmail email check failed:', error?.code || error?.name || 'Error', error?.message || 'Unknown error');
  process.exitCode = 1;
}
