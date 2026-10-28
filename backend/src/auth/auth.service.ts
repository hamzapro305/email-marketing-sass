import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(username: string, password: string) {
    const expectedUser = this.config.get<string>('app.adminUsername')!;
    const expectedPass = this.config.get<string>('app.adminPassword')!;
    if (!this.equal(username, expectedUser) || !this.equal(password, expectedPass)) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const now = Math.floor(Date.now() / 1000);
    const header = this.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = this.encode(JSON.stringify({ sub: 'admin', iat: now, exp: now + 86400 * 7 }));
    const body = `${header}.${payload}`;
    return { accessToken: `${body}.${this.sign(body)}`, tokenType: 'Bearer', expiresIn: 604800 };
  }

  verify(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3 || !this.equal(parts[2], this.sign(`${parts[0]}.${parts[1]}`))) return false;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return payload.sub === 'admin' && payload.exp > Date.now() / 1000;
    } catch { return false; }
  }

  private sign(value: string) {
    return createHmac('sha256', this.config.get<string>('app.jwtSecret')!).update(value).digest('base64url');
  }
  private encode(value: string) { return Buffer.from(value).toString('base64url'); }
  private equal(a: string, b: string) {
    const x = Buffer.from(a); const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
}
