import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const path = (req.originalUrl ?? req.url).split('?')[0];
    if (path === '/api/auth/login' || path.startsWith('/api/unsubscribe') || path.startsWith('/api/health')) return true;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!this.auth.verify(token)) throw new UnauthorizedException('Please sign in');
    req.sessionId = 'admin';
    return true;
  }
}
