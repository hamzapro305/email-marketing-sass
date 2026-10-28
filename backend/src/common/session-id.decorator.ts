import { UnauthorizedException, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const SESSION_HEADER = 'x-session-id';

/**
 * All authenticated browsers share the one configured administrator workspace.
 */
export const SessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ sessionId?: string }>();
    if (!req.sessionId) throw new UnauthorizedException('Please sign in');
    return req.sessionId;
  },
);
