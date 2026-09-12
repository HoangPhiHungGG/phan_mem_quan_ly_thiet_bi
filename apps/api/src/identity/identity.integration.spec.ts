import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Connection, createConnection, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import { AuthService } from "../auth/auth.service";
import type { CurrentActor } from "../auth/auth.types";
import { verifyPassword } from "../auth/password";
import {
  DisplayCodeCounter,
  DisplayCodeCounterSchema,
} from "../display-codes/display-code.schemas";
import { DisplayCodeService } from "../display-codes/display-code.service";
import { Keeper, KeeperSchema } from "../catalog/catalog.schemas";
import { IdentityService } from "./identity.service";
import {
  ALL_PERMISSIONS,
  BootstrapLock,
  BootstrapLockSchema,
  Department,
  DepartmentSchema,
  Role,
  RoleAssignment,
  RoleAssignmentSchema,
  RoleSchema,
  User,
  UserSchema,
  Warehouse,
  WarehouseSchema,
} from "./identity.schemas";

jest.setTimeout(30_000);
const integration = process.env.IDENTITY_TEST_MONGODB_URI
  ? describe
  : describe.skip;

integration("IdentityService account lifecycle", () => {
  let connection: Connection;
  let service: IdentityService;
  let users: Model<User>;
  let roles: Model<Role>;
  let assignments: Model<RoleAssignment>;
  let keepers: Model<Keeper>;
  let auditLogs: Model<AuditLog>;
  const revokeUserSessions = jest.fn().mockResolvedValue(undefined);
  const actor = {
    userId: new Types.ObjectId(),
    sessionId: new Types.ObjectId(),
    employeeCode: "ADMIN-TEST",
    email: "admin-test@example.com",
    displayName: "Admin test",
    status: "ACTIVE",
    roleCodes: ["SYSTEM_ADMIN"],
    permissions: [...ALL_PERMISSIONS],
    scopes: [],
  } satisfies CurrentActor;
  const database = `pmqltb_identity_test_${new Types.ObjectId().toHexString()}`;

  beforeAll(async () => {
    connection = await createConnection(
      process.env.IDENTITY_TEST_MONGODB_URI!,
      { dbName: database, serverSelectionTimeoutMS: 5000 },
    ).asPromise();
    users = connection.model(User.name, UserSchema);
    roles = connection.model(Role.name, RoleSchema);
    assignments = connection.model(RoleAssignment.name, RoleAssignmentSchema);
    const departments = connection.model(Department.name, DepartmentSchema);
    const warehouses = connection.model(Warehouse.name, WarehouseSchema);
    const locks = connection.model(BootstrapLock.name, BootstrapLockSchema);
    keepers = connection.model(Keeper.name, KeeperSchema);
    auditLogs = connection.model(AuditLog.name, AuditLogSchema);
    const audit = new AuditService(auditLogs);
    const displayCodes = new DisplayCodeService(
      connection.model(DisplayCodeCounter.name, DisplayCodeCounterSchema),
    );
    service = new IdentityService(
      users,
      roles,
      assignments,
      departments,
      warehouses,
      locks,
      keepers,
      auditLogs,
      connection,
      { revokeUserSessions } as unknown as AuthService,
      audit,
      displayCodes,
    );
    await Promise.all(
      Object.values(connection.models).map((model) => model.init()),
    );
    await service.onModuleInit();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  async function employee(suffix: string) {
    return keepers.create({
      employeeCode: `NV-${suffix}`,
      displayName: `Nhân viên ${suffix}`,
      email: `nv-${suffix}@example.com`,
      status: "ACTIVE",
      isActive: true,
    });
  }

  async function createAccount(suffix: string, roleCode = "IT_STAFF") {
    const keeper = await employee(suffix);
    const role = await roles.findOne({ code: roleCode }).orFail();
    const result = await service.createUser(
      {
        employeeId: keeper._id.toString(),
        email: keeper.email!,
        password: "MatKhau123456",
        roleId: role._id.toString(),
        status: "ACTIVE",
        mustChangePassword: true,
      },
      actor,
    );
    return users.findById(result.data.id).orFail();
  }

  it("gán vai trò mới, thu hồi vai trò cũ và ghi audit old/new", async () => {
    const user = await createAccount("ROLE");
    const warehouseRole = await roles
      .findOne({ code: "WAREHOUSE_STAFF" })
      .orFail();
    await service.assignUserRole(
      user._id.toString(),
      warehouseRole._id.toString(),
      actor,
    );
    const active = await assignments.find({
      userId: user._id,
      revokedAt: { $exists: false },
    });
    expect(active).toHaveLength(1);
    expect(active[0].roleId.toString()).toBe(warehouseRole._id.toString());
    expect(revokeUserSessions).toHaveBeenCalledWith(
      user._id,
      "PERMISSIONS_CHANGED",
    );
    const audit = await auditLogs
      .findOne({ action: "ROLE_ASSIGNED", entityId: user._id })
      .sort({ createdAt: -1 })
      .lean();
    expect(audit?.metadata?.oldRole).toBeDefined();
    expect(audit?.metadata?.newRole).toEqual({
      code: "WAREHOUSE_STAFF",
      name: "Thủ kho",
    });
  });

  it("khóa, mở khóa, vô hiệu hóa và kích hoạt đúng trạng thái", async () => {
    const user = await createAccount("STATUS");
    await service.updateStatus(user._id.toString(), "LOCKED", actor);
    await service.updateStatus(user._id.toString(), "ACTIVE", actor, "LOCKED");
    await service.updateStatus(user._id.toString(), "INACTIVE", actor);
    expect((await users.findById(user._id))?.status).toBe("INACTIVE");
    await service.updateStatus(
      user._id.toString(),
      "ACTIVE",
      actor,
      "INACTIVE_OR_DISABLED",
    );
    expect((await users.findById(user._id))?.status).toBe("ACTIVE");
  });

  it("không cho tự khóa hoặc tự xóa", async () => {
    await expect(
      service.updateStatus(actor.userId.toString(), "LOCKED", actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.deleteUser(actor.userId.toString(), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("xóa tài khoản chưa phát sinh lịch sử và giữ audit", async () => {
    const user = await createAccount("DELETE");
    await service.deleteUser(user._id.toString(), actor);
    expect(await users.exists({ _id: user._id })).toBeNull();
    expect(await assignments.countDocuments({ userId: user._id })).toBe(0);
    expect(
      await auditLogs.exists({
        action: "USER_DELETED",
        "metadata.targetUserId": user._id.toString(),
      }),
    ).not.toBeNull();
  });

  it("không xóa tài khoản đã phát sinh giao dịch tồn kho", async () => {
    const user = await createAccount("HISTORY");
    await connection
      .collection("inventory_transactions")
      .insertOne({ createdBy: user._id, quantity: 1, type: "OPENING" });
    await expect(
      service.deleteUser(user._id.toString(), actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await users.exists({ _id: user._id })).not.toBeNull();
  });

  it("hai thay đổi đồng thời vẫn giữ ít nhất một admin hoạt động", async () => {
    const first = await createAccount("ADMIN-A", "SYSTEM_ADMIN");
    const second = await createAccount("ADMIN-B", "SYSTEM_ADMIN");
    const itRole = await roles.findOne({ code: "IT_STAFF" }).orFail();
    await Promise.allSettled([
      service.updateStatus(first._id.toString(), "LOCKED", actor),
      service.assignUserRole(
        second._id.toString(),
        itRole._id.toString(),
        actor,
      ),
    ]);
    const adminRole = await roles.findOne({ code: "SYSTEM_ADMIN" }).orFail();
    const adminIds = await assignments.distinct("userId", {
      roleId: adminRole._id,
      revokedAt: { $exists: false },
    });
    expect(
      await users.countDocuments({ _id: { $in: adminIds }, status: "ACTIVE" }),
    ).toBeGreaterThanOrEqual(1);
    await assignments.deleteMany({ userId: { $in: [first._id, second._id] } });
    await users.deleteMany({ _id: { $in: [first._id, second._id] } });
  });

  it("bảo vệ quản trị viên hoạt động cuối cùng", async () => {
    const admin = await createAccount("LAST-ADMIN", "SYSTEM_ADMIN");
    await expect(
      service.updateStatus(admin._id.toString(), "LOCKED", actor),
    ).rejects.toBeInstanceOf(ConflictException);
    const itRole = await roles.findOne({ code: "IT_STAFF" }).orFail();
    await expect(
      service.assignUserRole(
        admin._id.toString(),
        itRole._id.toString(),
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.deleteUser(admin._id.toString(), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("từ chối gán vai trò và xóa khi actor thiếu permission", async () => {
    const user = await createAccount("NO-PERMISSION");
    const role = await roles.findOne({ code: "VIEWER" }).orFail();
    const restricted = {
      ...actor,
      permissions: ["users.view"],
    } as CurrentActor;
    await expect(
      service.assignUserRole(
        user._id.toString(),
        role._id.toString(),
        restricted,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.deleteUser(user._id.toString(), restricted),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("reset mật khẩu bằng hash và bắt đổi ở lần đăng nhập tiếp theo", async () => {
    const user = await createAccount("RESET");
    await service.resetPassword(
      user._id.toString(),
      { password: "MatKhauMoi123", mustChangePassword: true },
      actor,
    );
    const stored = await users
      .findById(user._id)
      .select("+passwordHash")
      .orFail();
    expect(stored.passwordHash).not.toBe("MatKhauMoi123");
    expect(await verifyPassword("MatKhauMoi123", stored.passwordHash)).toBe(
      true,
    );
    expect(stored.mustChangePassword).toBe(true);
  });
});
