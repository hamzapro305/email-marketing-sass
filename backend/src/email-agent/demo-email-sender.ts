import { Logger } from '@nestjs/common';
import { LeadDocument } from '../leads/lead.schema';
import { IEmailSender, SendResult } from './email-sender.interface';

const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 10000;
const FAILURE_RATE = 0.05; // ~5% simulated failures so error UI can be shown.

const SIMULATED_ERRORS = [
  'Mailbox full (simulated)',
  'Recipient address rejected (simulated)',
  'Greylisted, try again later (simulated)',
  'Connection timed out (simulated)',
];

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Demo email agent. Simulates the "writing + sending" work with a realistic
 * random delay and NEVER makes a network/API/SMTP call — zero resources spent.
 * Fails a small random share of sends so the error states are demonstrable.
 */
export class DemoEmailSender implements IEmailSender {
  private readonly logger = new Logger('DemoEmailSender');

  async sendToLead(lead: LeadDocument): Promise<SendResult> {
    const delay = randomBetween(MIN_DELAY_MS, MAX_DELAY_MS);
    this.logger.log(
      `✍️  Composing email for ${lead.email} — simulating ${delay}ms of work…`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (Math.random() < FAILURE_RATE) {
      const error =
        SIMULATED_ERRORS[randomBetween(0, SIMULATED_ERRORS.length - 1)];
      this.logger.warn(`✗ Simulated send FAILED for ${lead.email}: ${error}`);
      return { success: false, error };
    }

    this.logger.log(`✓ Simulated send OK for ${lead.email}`);
    return { success: true };
  }
}
