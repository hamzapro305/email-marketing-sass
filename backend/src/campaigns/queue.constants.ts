/** The BullMQ queue that fans campaign sends out across every backend replica. */
export const SEND_QUEUE = 'campaign-send';

/** Shape of one queued job — a single lead to email. */
export interface SendJobData {
  campaignId: string;
  leadId: string;
}
