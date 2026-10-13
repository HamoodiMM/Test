import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// The built-in ThrottlerGuard counts requests per IP address.
// We extend it (inheritance) to count per logged-in USER instead: fairer when several
// people share one IP (a university network), and harder to dodge by switching networks.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.userId ?? req.ip;
  }
}
