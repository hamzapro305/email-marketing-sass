import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SuppressionsService } from './suppressions.service';

const page = (title: string, message: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8f9fb;color:#1a1a2e}
main{max-width:26rem;padding:2.5rem;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.06);text-align:center}
h1{font-size:1.2rem;margin:0 0 .5rem}p{margin:0;color:#555;font-size:.95rem;line-height:1.5}</style>
</head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;

/**
 * Public unsubscribe endpoint — intentionally session-header-free, because it
 * is opened from a recipient's mail client. GET serves humans clicking the
 * footer link; POST serves RFC 8058 one-click unsubscribe (the
 * List-Unsubscribe-Post header Gmail/Yahoo require for bulk senders).
 */
@Controller('unsubscribe')
export class SuppressionsController {
  constructor(private readonly suppressions: SuppressionsService) {}

  @Get()
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    const payload = this.suppressions.verify(token ?? '');
    if (!payload) {
      res
        .status(400)
        .send(page('Invalid link', 'This unsubscribe link is invalid or expired.'));
      return;
    }
    await this.suppressions.suppress(payload.sessionId, payload.email);
    res.send(
      page(
        'You are unsubscribed',
        `${payload.email} will not receive any further emails from this sender.`,
      ),
    );
  }

  /** RFC 8058 one-click unsubscribe (mail providers POST here automatically). */
  @Post()
  async oneClick(@Query('token') token: string, @Res() res: Response) {
    const payload = this.suppressions.verify(token ?? '');
    if (!payload) {
      res.status(400).json({ ok: false });
      return;
    }
    await this.suppressions.suppress(payload.sessionId, payload.email);
    res.json({ ok: true });
  }
}
