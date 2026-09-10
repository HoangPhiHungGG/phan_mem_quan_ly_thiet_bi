import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Types } from "mongoose";
import { PermissionsGuard } from "./auth.guards";
import type { AuthenticatedRequest, CurrentActor } from "./auth.types";

function context(permissions: CurrentActor["permissions"]): ExecutionContext {
  const request = {
    actor: {
      userId: new Types.ObjectId(),
      sessionId: new Types.ObjectId(),
      employeeCode: "NV001",
      email: "user@example.com",
      displayName: "User",
      status: "ACTIVE",
      roleCodes: [],
      permissions,
      scopes: [],
    },
  } as unknown as AuthenticatedRequest;
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  it("cho phép quyền quản trị chi tiết", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["users.lock"]);
    expect(guard.canActivate(context(["users.lock"]))).toBe(true);
  });

  it("giữ tương thích quyền users.manage cũ", () => {
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue(["users.reset_password"]);
    expect(guard.canActivate(context(["users.manage"]))).toBe(true);
  });

  it("từ chối khi thiếu quyền", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["audit.view"]);
    expect(() => guard.canActivate(context(["users.view"]))).toThrow(
      ForbiddenException,
    );
  });
});
