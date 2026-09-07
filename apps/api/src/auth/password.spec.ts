import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("băm có salt và xác minh đúng mật khẩu", async () => {
    const first = await hashPassword("A-Strong-Test-Password-2026!");
    const second = await hashPassword("A-Strong-Test-Password-2026!");
    expect(first).not.toBe(second);
    await expect(
      verifyPassword("A-Strong-Test-Password-2026!", first),
    ).resolves.toBe(true);
  });

  it("từ chối mật khẩu sai và hash không hợp lệ", async () => {
    const hash = await hashPassword("A-Strong-Test-Password-2026!");
    await expect(verifyPassword("Wrong-Password-2026!", hash)).resolves.toBe(
      false,
    );
    await expect(verifyPassword("anything", "invalid")).resolves.toBe(false);
  });
});
