import { PERMISSIONS_KEY } from "../auth/auth.constants";
import { Reflector } from "@nestjs/core";
import { IdentityController } from "./identity.controller";

function permissions(method: keyof IdentityController): string[] {
  // Chỉ đọc metadata gắn trên function, không gọi method tách khỏi controller.
  return (
    new Reflector().get<string[]>(
      PERMISSIONS_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      IdentityController.prototype[method],
    ) ?? []
  );
}

describe("IdentityController permissions", () => {
  it("tách quyền gán vai trò khỏi quyền sửa thông tin", () => {
    expect(permissions("assignUserRole")).toEqual(["users.assign_role"]);
    expect(permissions("updateUser")).toEqual(["users.update"]);
  });

  it("bảo vệ độc lập các thao tác trạng thái", () => {
    expect(permissions("lock")).toEqual(["users.lock"]);
    expect(permissions("unlock")).toEqual(["users.lock"]);
    expect(permissions("deactivate")).toEqual(["users.activate"]);
    expect(permissions("activate")).toEqual(["users.activate"]);
  });

  it("yêu cầu users.delete tại API hard delete", () => {
    expect(permissions("deleteUser")).toEqual(["users.delete"]);
  });
});
