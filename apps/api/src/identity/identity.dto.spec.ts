import { validate } from "class-validator";
import { CreateUserDto, ResetPasswordDto } from "./identity.dto";

describe("Identity DTO security", () => {
  it("từ chối mật khẩu không có chữ", async () => {
    const input = Object.assign(new CreateUserDto(), {
      employeeId: "507f1f77bcf86cd799439011",
      email: "nv@example.com",
      roleId: "507f1f77bcf86cd799439012",
      password: "123456789012",
    });
    expect(await validate(input)).not.toHaveLength(0);
  });

  it("chấp nhận mật khẩu 12 ký tự có chữ và số", async () => {
    const input = Object.assign(new CreateUserDto(), {
      employeeId: "507f1f77bcf86cd799439011",
      email: "nv@example.com",
      roleId: "507f1f77bcf86cd799439012",
      password: "MatKhau123456",
    });
    expect(await validate(input)).toHaveLength(0);
  });

  it("áp dụng cùng policy khi quản trị viên reset mật khẩu", async () => {
    const input = Object.assign(new ResetPasswordDto(), {
      password: "abcdefghijkz",
    });
    expect(await validate(input)).not.toHaveLength(0);
  });
});
