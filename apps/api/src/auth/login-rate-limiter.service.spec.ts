import { LoginRateLimiter } from "./login-rate-limiter.service";

describe("LoginRateLimiter", () => {
  it("chặn lần thử tiếp theo sau năm lần thất bại", () => {
    const limiter = new LoginRateLimiter();
    for (let index = 0; index < 5; index += 1) {
      limiter.assertAllowed("ip:email");
      limiter.recordFailure("ip:email");
    }
    expect(() => limiter.assertAllowed("ip:email")).toThrow();
  });

  it("xóa bộ đếm sau đăng nhập thành công", () => {
    const limiter = new LoginRateLimiter();
    limiter.recordFailure("ip:email");
    limiter.reset("ip:email");
    expect(() => limiter.assertAllowed("ip:email")).not.toThrow();
  });
});
