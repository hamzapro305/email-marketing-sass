import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const SESSION_HEADER = 'x-session-id';

/**
 * Extracts the caller's upload-session id from the `x-session-id` header.
 *
 * There is no auth in this demo, so a "session" is simply an opaque id the
 * frontend generates once and stores locally. It scopes a user's uploaded
 * files and staged leads so they can be reviewed/deleted before a campaign.
 */
export const SessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const raw = req.headers[SESSION_HEADER];
    const sessionId = (raw ?? '').toString().trim();
    if (!sessionId) {
      throw new BadRequestException(
        `Missing "${SESSION_HEADER}" header — the client must send a session id.`,
      );
    }
    return sessionId;
  },
);
