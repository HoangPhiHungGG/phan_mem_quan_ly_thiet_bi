import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { OnModuleInit } from "@nestjs/common";
import { AuditService } from "../auth/audit.service";
import { AuthService } from "../auth/auth.service";
import type { CurrentActor } from "../auth/auth.types";
import { hashPassword } from "../auth/password";
import type {
  AssignRoleDto,
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  CreateWarehouseDto,
} from "./identity.dto";
import {
  ALL_PERMISSIONS,
  BootstrapLock,
  Department,
  Role,
  RoleAssignment,
  User,
  Warehouse,
} from "./identity.schemas";

@Injectable()
export class IdentityService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Role.name) private readonly roles: Model<Role>,
    @InjectModel(RoleAssignment.name)
    private readonly assignments: Model<RoleAssignment>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(Warehouse.name)
    private readonly warehouses: Model<Warehouse>,
    @InjectModel(BootstrapLock.name)
    private readonly bootstrapLocks: Model<BootstrapLock>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  // Migration an toàn cho vai trò hệ thống: chỉ bổ sung quyền mới, không thay đổi
  // quyền của các vai trò do người dùng tự tạo.
  async onModuleInit(): Promise<void> {
    await this.roles.updateOne(
      { code: "SYSTEM_ADMIN", system: true },
      { $addToSet: { permissions: { $each: ALL_PERMISSIONS } } },
    );
  }

  async listUsers() {
    const users = await this.users
      .find()
      .sort({ displayName: 1 })
      .limit(100)
      .lean()
      .exec();
    return { data: users.map((user) => this.publicUser(user)) };
  }

  async getUser(id: string, actor: CurrentActor) {
    const canReadAll = actor.permissions.includes("users.read");
    if (!canReadAll && actor.userId.toString() !== id) {
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    }
    const user = await this.users.findById(id).lean().exec();
    if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const assignments = await this.assignments
      .find({ userId: user._id, revokedAt: { $exists: false } })
      .populate("roleId", "code name permissions")
      .lean()
      .exec();
    return { data: { ...this.publicUser(user), assignments } };
  }

  async createUser(input: CreateUserDto, actor: CurrentActor) {
    if (input.primaryDepartmentId)
      await this.assertActiveDepartment(input.primaryDepartmentId);
    try {
      const user = await this.users.create({
        employeeCode: input.employeeCode.trim(),
        employeeCodeNormalized: input.employeeCode.trim().toUpperCase(),
        email: input.email.trim(),
        emailNormalized: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        passwordHash: await hashPassword(input.password),
        primaryDepartmentId: input.primaryDepartmentId,
        status: "ACTIVE",
      });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user._id,
        outcome: "SUCCESS",
      });
      return { data: this.publicUser(user.toObject()) };
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException({ code: "USER_ALREADY_EXISTS" });
      }
      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: "ACTIVE" | "LOCKED" | "DISABLED",
    actor: CurrentActor,
  ) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    if (actor.userId.toString() === id && status !== "ACTIVE") {
      throw new BadRequestException({ code: "CANNOT_LOCK_SELF" });
    }
    const user = await this.users.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true },
    );
    if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (status !== "ACTIVE") {
      await this.auth.revokeUserSessions(user._id, `USER_${status}`);
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "USER_STATUS_CHANGED",
      entityType: "User",
      entityId: user._id,
      outcome: "SUCCESS",
      metadata: { status },
    });
    return { data: this.publicUser(user.toObject()) };
  }

  async listRoles() {
    return { data: await this.roles.find().sort({ code: 1 }).lean().exec() };
  }

  async createRole(input: CreateRoleDto, actor: CurrentActor) {
    try {
      const role = await this.roles.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim(),
        permissions: [...new Set(input.permissions)],
      });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "ROLE_CREATED",
        entityType: "Role",
        entityId: role._id,
        outcome: "SUCCESS",
      });
      return { data: role.toObject() };
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "ROLE_EXISTS" });
      throw error;
    }
  }

  async assignRole(userId: string, input: AssignRoleDto, actor: CurrentActor) {
    const [user, role] = await Promise.all([
      this.users.findById(userId).exec(),
      this.roles.findOne({ _id: input.roleId, isActive: true }).exec(),
    ]);
    if (!user || !role)
      throw new NotFoundException({ code: "REFERENCE_NOT_FOUND" });
    await Promise.all(
      input.scope.departmentIds.map((id) => this.assertActiveDepartment(id)),
    );
    const warehouseCount = await this.warehouses.countDocuments({
      _id: { $in: input.scope.warehouseIds },
      isActive: true,
    });
    if (warehouseCount !== input.scope.warehouseIds.length) {
      throw new BadRequestException({ code: "WAREHOUSE_REFERENCE_INVALID" });
    }
    const assignment = await this.assignments.create({
      userId: user._id,
      roleId: role._id,
      scope: input.scope,
      validUntil: input.validUntil,
      grantedBy: actor.userId,
    });
    await this.auth.revokeUserSessions(user._id, "PERMISSIONS_CHANGED");
    await this.audit.write({
      actorUserId: actor.userId,
      action: "ROLE_ASSIGNED",
      entityType: "RoleAssignment",
      entityId: assignment._id,
      outcome: "SUCCESS",
      metadata: { targetUserId: userId, roleCode: role.code },
    });
    return { data: assignment.toObject() };
  }

  async revokeAssignment(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const assignment = await this.assignments.findOneAndUpdate(
      { _id: id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
      { new: true },
    );
    if (!assignment)
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.auth.revokeUserSessions(
      assignment.userId,
      "PERMISSIONS_CHANGED",
    );
    await this.audit.write({
      actorUserId: actor.userId,
      action: "ROLE_REVOKED",
      entityType: "RoleAssignment",
      entityId: assignment._id,
      outcome: "SUCCESS",
    });
  }

  async listDepartments() {
    return {
      data: await this.departments.find().sort({ name: 1 }).lean().exec(),
    };
  }

  async createDepartment(input: CreateDepartmentDto) {
    if (input.parentId) await this.assertActiveDepartment(input.parentId);
    return {
      data: await this.departments.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        parentId: input.parentId,
      }),
    };
  }

  async listWarehouses() {
    return {
      data: await this.warehouses.find().sort({ name: 1 }).lean().exec(),
    };
  }

  async createWarehouse(input: CreateWarehouseDto) {
    if (input.departmentId)
      await this.assertActiveDepartment(input.departmentId);
    return {
      data: await this.warehouses.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        departmentId: input.departmentId,
      }),
    };
  }

  async bootstrapAdmin(input: {
    email: string;
    password: string;
    displayName: string;
    employeeCode: string;
  }): Promise<string> {
    const owner = randomUUID();
    try {
      await this.bootstrapLocks.create({
        _id: "initial-admin",
        owner,
        status: "RUNNING",
      });
    } catch (error) {
      console.error("BOOTSTRAP_LOCK_ERROR", error);
      if (this.isDuplicate(error)) {
        throw new ForbiddenException(
          "Bootstrap quản trị viên đã được chạy hoặc đang chạy.",
        );
      }
      throw error;
    }

    try {
      if ((await this.users.countDocuments()) > 0) {
        throw new ForbiddenException(
          "Bootstrap chỉ chạy khi chưa có tài khoản nào.",
        );
      }
      const role = await this.roles.findOneAndUpdate(
        { code: "SYSTEM_ADMIN" },
        {
          $setOnInsert: {
            code: "SYSTEM_ADMIN",
            name: "Quản trị hệ thống",
            permissions: ALL_PERMISSIONS,
            system: true,
            isActive: true,
          },
        },
        { upsert: true, new: true },
      );
      const user = await this.users.create({
        employeeCode: input.employeeCode.trim(),
        employeeCodeNormalized: input.employeeCode.trim().toUpperCase(),
        email: input.email.trim(),
        emailNormalized: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        passwordHash: await hashPassword(input.password),
        status: "ACTIVE",
      });
      await this.assignments.create({
        userId: user._id,
        roleId: role._id,
        scope: {
          departmentMode: "ALL_DEPARTMENTS",
          departmentIds: [],
          warehouseMode: "ALL_WAREHOUSES",
          warehouseIds: [],
        },
        grantedBy: user._id,
      });
      await this.audit.write({
        actorUserId: user._id,
        action: "BOOTSTRAP_ADMIN_CREATED",
        entityType: "User",
        entityId: user._id,
        outcome: "SUCCESS",
      });
      await this.bootstrapLocks.updateOne(
        { _id: "initial-admin", owner },
        { $set: { status: "COMPLETED" } },
      );
      return user.email;
    } catch (error) {
      await this.bootstrapLocks.deleteOne({ _id: "initial-admin", owner });
      throw error;
    }
  }

  private async assertActiveDepartment(id: string): Promise<void> {
    if (
      !Types.ObjectId.isValid(id) ||
      !(await this.departments.exists({ _id: id, isActive: true }))
    ) {
      throw new BadRequestException({ code: "DEPARTMENT_REFERENCE_INVALID" });
    }
  }

  private publicUser(user: User & { _id: Types.ObjectId }) {
    return {
      id: user._id.toString(),
      employeeCode: user.employeeCode,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      primaryDepartmentId: user.primaryDepartmentId?.toString(),
      lastLoginAt: user.lastLoginAt,
    };
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    );
  }
}
