import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

type Attempt = { count: number; resetAt: number };

@Injectable()
export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000;

  assertAllowed(key: string): void {
    const attempt = this.attempts.get(key);
    if (!attempt || attempt.resetAt <= Date.now()) {
      this.attempts.delete(key);
      return;
    }
    if (attempt.count >= this.maxAttempts) {
      throw new HttpException(
        {
          code: "LOGIN_RATE_LIMITED",
          message: "Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    current.count += 1;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
