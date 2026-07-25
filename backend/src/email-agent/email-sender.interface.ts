/** The outcome of attempting to send one email over SMTP. */
export interface SendResult {
  success: boolean;
  error?: string;
}
