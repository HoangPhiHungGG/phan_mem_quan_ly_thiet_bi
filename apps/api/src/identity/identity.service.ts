import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model, Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { OnModuleInit } from "@nestjs/common";
import { AuditService } from "../auth/audit.service";
import { AuthService } from "../auth/auth.service";
import type { CurrentActor } from "../auth/auth.types";
import { hashPassword } from "../auth/password";
import { AuditLog } from "../auth/auth.schemas";
import { Keeper } from "../catalog/catalog.schemas";
import type {
  AssignRoleDto,
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  CreateWarehouseDto,
  ListQueryDto,
  ResetPasswordDto,
  UpdateRoleDto,
  UpdateUserDto,
  UpdateWarehouseDto,
} from "./identity.dto";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  BootstrapLock,
  Department,
  Role,
  RoleAssignment,
  User,
  Warehouse,
  type Permission,
} from "./identity.schemas";
import { DisplayCodeService } from "../display-codes/display-code.service";

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
    @InjectModel(Keeper.name) private readonly keepers: Model<Keeper>,
    @InjectModel(AuditLog.name) private readonly auditLogs: Model<AuditLog>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly displayCodes: DisplayCodeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const defaults = [
      {
        code: "SYSTEM_ADMIN",
        name: "Quản trị viên",
        description: "Toàn quyền hệ thống",
        permissions: ALL_PERMISSIONS,
      },
      {
        code: "IT_STAFF",
        name: "Nhân viên IT",
        description: "Quản lý tài sản và nghiệp vụ IT",
        permissions: ALL_PERMISSIONS.filter(
          (p) =>
            !p.startsWith("users.") &&
            !p.startsWith("roles.") &&
            p !== "audit.view",
        ),
      },
      {
        code: "WAREHOUSE_STAFF",
        name: "Thủ kho",
        description: "Quản lý kho, nhập xuất và kiểm kê",
        permissions: [
          "warehouses.read",
          "catalog.read",
          "devices.read",
          "parts.read",
          "parts.manage",
          "receipts.read",
          "receipts.manage",
          "operations.read",
          "operations.manage",
          "inventory.view",
          "inventory.create",
          "inventory.perform",
          "inventory.reconcile",
        ],
      },
      {
        code: "BUSINESS_USER",
        name: "Người dùng nghiệp vụ",
        description: "Thực hiện các nghiệp vụ được giao",
        permissions: [
          "devices.read",
          "parts.read",
          "operations.read",
          "operations.manage",
          "repair.view",
          "repair.create",
        ],
      },
      {
        code: "VIEWER",
        name: "Người xem",
        description: "Chỉ xem dữ liệu và báo cáo",
        permissions: [
          "dashboard.view",
          "catalog.read",
          "devices.read",
          "parts.read",
          "receipts.read",
          "operations.read",
          "repair.view",
          "inventory.view",
          "liquidation.view",
          "reports.read",
        ],
      },
    ];
    for (const role of defaults) {
      await this.roles.updateOne(
        { code: role.code },
        { $setOnInsert: { ...role, system: true, isActive: true } },
        { upsert: true },
      );
    }
    await this.roles.updateOne(
      { code: "SYSTEM_ADMIN" },
      {
        $set: { system: true, isActive: true },
        $addToSet: { permissions: { $each: ALL_PERMISSIONS } },
      },
    );
  }

  async listUsers(query: ListQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.departmentId) filter.primaryDepartmentId = query.departmentId;
    if (query.q?.trim()) {
      const value = new RegExp(this.escapeRegex(query.q.trim()), "i");
      filter.$or = [
        { employeeCode: value },
        { displayName: value },
        { email: value },
      ];
    }
    if (query.roleId) {
      const userIds = await this.assignments.distinct("userId", {
        roleId: query.roleId,
        revokedAt: { $exists: false },
      });
      filter._id = { $in: userIds };
    }
    const [users, total] = await Promise.all([
      this.users
        .find(filter)
        .populate("primaryDepartmentId", "code name")
        .sort({ displayName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.users.countDocuments(filter),
    ]);
    const userIds = users.map((user) => user._id);
    const assignments = await this.assignments
      .find({ userId: { $in: userIds }, revokedAt: { $exists: false } })
      .populate("roleId", "code name permissions")
      .lean()
      .exec();
    const byUser = new Map<string, unknown[]>();
    for (const assignment of assignments) {
      const key = String(assignment.userId);
      byUser.set(key, [...(byUser.get(key) ?? []), assignment]);
    }
    return {
      data: users.map((user) => {
        const department = user.primaryDepartmentId as unknown as
          { _id: Types.ObjectId; code?: string; name?: string } | undefined;
        return {
          ...this.publicUser(user),
          primaryDepartmentId: department
            ? {
                _id: String(department._id),
                code: department.code,
                name: department.name,
              }
            : undefined,
          assignments: byUser.get(String(user._id)) ?? [],
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUser(id: string, actor: CurrentActor) {
    const canReadAll =
      actor.permissions.includes("users.read") ||
      actor.permissions.includes("users.view");
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

  async eligibleEmployees(q?: string) {
    const linked = await this.users.distinct("employeeId", {
      employeeId: { $exists: true },
    });
    const filter: Record<string, unknown> = {
      _id: { $nin: linked },
      isActive: true,
      status: { $ne: "RESIGNED" },
    };
    if (q?.trim()) {
      const value = new RegExp(this.escapeRegex(q.trim()), "i");
      filter.$or = [
        { employeeCode: value },
        { displayName: value },
        { email: value },
      ];
    }
    const data = await this.keepers
      .find(filter)
      .populate("departmentId", "code name")
      .populate("positionId", "code name")
      .sort({ displayName: 1 })
      .limit(100)
      .lean()
      .exec();
    return { data };
  }

  async createUser(input: CreateUserDto, actor: CurrentActor) {
    const [employee, role] = await Promise.all([
      this.keepers
        .findOne({
          _id: input.employeeId,
          isActive: true,
          status: { $ne: "RESIGNED" },
        })
        .populate("departmentId", "code name")
        .exec(),
      this.roles.findOne({ _id: input.roleId, isActive: true }).exec(),
    ]);
    if (!employee)
      throw new BadRequestException({ code: "EMPLOYEE_REFERENCE_INVALID" });
    if (!role)
      throw new BadRequestException({ code: "ROLE_REFERENCE_INVALID" });
    if (!employee.employeeCode)
      throw new BadRequestException({ code: "EMPLOYEE_CODE_REQUIRED" });
    if (await this.users.exists({ employeeId: employee._id }))
      throw new ConflictException({ code: "EMPLOYEE_ALREADY_HAS_ACCOUNT" });
    try {
      const user = await this.users.create({
        employeeId: employee._id,
        employeeCode: employee.employeeCode.trim(),
        employeeCodeNormalized: employee.employeeCode.trim().toUpperCase(),
        email: input.email.trim(),
        emailNormalized: input.email.trim().toLowerCase(),
        displayName: employee.displayName.trim(),
        passwordHash: await hashPassword(input.password),
        primaryDepartmentId: employee.departmentId,
        status: input.status ?? "ACTIVE",
        mustChangePassword: input.mustChangePassword ?? true,
      });
      try {
        await this.assignments.create({
          userId: user._id,
          roleId: role._id,
          scope: {
            departmentMode: employee.departmentId ? "OWN_DEPARTMENT" : "SELF",
            departmentIds: [],
            warehouseMode: "NONE",
            warehouseIds: [],
          },
          grantedBy: actor.userId,
        });
      } catch (error) {
        await this.users.deleteOne({ _id: user._id });
        throw error;
      }
      await this.audit.write({
        actorUserId: actor.userId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user._id,
        outcome: "SUCCESS",
        metadata: { employeeId: input.employeeId, roleCode: role.code },
      });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "ROLE_ASSIGNED",
        entityType: "User",
        entityId: user._id,
        outcome: "SUCCESS",
        metadata: {
          targetUserId: user._id.toString(),
          oldRole: [],
          newRole: { code: role.code, name: role.name },
          changedBy: actor.userId.toString(),
          changedAt: new Date().toISOString(),
        },
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
    status: "ACTIVE" | "LOCKED" | "INACTIVE",
    actor: CurrentActor,
    expectedCurrent?: "LOCKED" | "INACTIVE" | "INACTIVE_OR_DISABLED",
  ) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    if (actor.userId.toString() === id && status !== "ACTIVE") {
      throw new BadRequestException({ code: "CANNOT_LOCK_SELF" });
    }
    return this.withAdminSafety(async () => {
      const user = await this.users.findById(id).exec();
      if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      const oldStatus = user.status;
      if (oldStatus === status)
        throw new ConflictException({ code: "USER_STATUS_TRANSITION_INVALID" });
      if (
        expectedCurrent &&
        (expectedCurrent === "INACTIVE_OR_DISABLED"
          ? !["INACTIVE", "DISABLED"].includes(oldStatus)
          : oldStatus !== expectedCurrent)
      ) {
        throw new ConflictException({ code: "USER_STATUS_TRANSITION_INVALID" });
      }
      const permission =
        status === "INACTIVE" || ["INACTIVE", "DISABLED"].includes(oldStatus)
          ? "users.activate"
          : "users.lock";
      if (!this.actorHas(actor, permission)) {
        throw new ForbiddenException({ code: "PERMISSION_DENIED" });
      }
      if (status === "LOCKED" && oldStatus !== "ACTIVE") {
        throw new ConflictException({ code: "USER_STATUS_TRANSITION_INVALID" });
      }
      if (status !== "ACTIVE") await this.assertNotLastAdmin(id);
      user.status = status;
      await user.save();
      if (status !== "ACTIVE") {
        await this.auth.revokeUserSessions(user._id, `USER_${status}`);
      }
      const action =
        status === "INACTIVE"
          ? "USER_DEACTIVATED"
          : status === "LOCKED"
            ? "USER_LOCKED"
            : ["INACTIVE", "DISABLED"].includes(oldStatus)
              ? "USER_ACTIVATED"
              : "USER_UNLOCKED";
      await this.audit.write({
        actorUserId: actor.userId,
        action,
        entityType: "User",
        entityId: user._id,
        outcome: "SUCCESS",
        metadata: {
          targetUserId: id,
          oldStatus,
          newStatus: status,
          changedBy: actor.userId.toString(),
          changedAt: new Date().toISOString(),
        },
      });
      return { data: this.publicUser(user.toObject()) };
    });
  }

  async updateUser(id: string, input: UpdateUserDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const user = await this.users.findById(id).exec();
    if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    try {
      if (input.email) {
        user.email = input.email.trim();
        user.emailNormalized = input.email.trim().toLowerCase();
        await user.save();
      }
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "USER_ALREADY_EXISTS" });
      throw error;
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: user._id,
      outcome: "SUCCESS",
      metadata: {
        emailChanged: Boolean(input.email),
      },
    });
    return this.getUser(id, actor);
  }

  async resetPassword(
    id: string,
    input: ResetPasswordDto,
    actor: CurrentActor,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const user = await this.users
      .findByIdAndUpdate(
        id,
        {
          $set: {
            passwordHash: await hashPassword(input.password),
            mustChangePassword: input.mustChangePassword ?? true,
            passwordChangedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.auth.revokeUserSessions(user._id, "PASSWORD_RESET");
    await this.audit.write({
      actorUserId: actor.userId,
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: user._id,
      outcome: "SUCCESS",
    });
    return { data: { success: true } };
  }

  async assignUserRole(userId: string, roleId: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(userId))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!this.actorHas(actor, "users.assign_role"))
      throw new ForbiddenException({ code: "PERMISSION_DENIED" });
    await this.withAdminSafety(() => this.replaceRole(userId, roleId, actor));
    return this.getUser(userId, actor);
  }

  async deleteUser(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!this.actorHas(actor, "users.delete"))
      throw new ForbiddenException({ code: "PERMISSION_DENIED" });
    if (actor.userId.toString() === id)
      throw new BadRequestException({ code: "CANNOT_DELETE_SELF" });
    return this.withAdminSafety(async () => {
      const user = await this.users.findById(id).exec();
      if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      await this.assertNotLastAdmin(id);
      if (await this.hasBusinessHistory(user._id)) {
        throw new ConflictException({ code: "USER_HAS_BUSINESS_HISTORY" });
      }
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          await this.assignments.deleteMany({ userId: user._id }, { session });
          await this.connection
            .collection("auth_sessions")
            .deleteMany({ userId: user._id }, { session });
          await this.users.deleteOne({ _id: user._id }, { session });
        });
      } finally {
        await session.endSession();
      }
      await this.audit.write({
        actorUserId: actor.userId,
        action: "USER_DELETED",
        entityType: "User",
        outcome: "SUCCESS",
        metadata: {
          targetUserId: id,
          employeeCode: user.employeeCode,
          displayName: user.displayName,
          deletedBy: actor.userId.toString(),
          deletedAt: new Date().toISOString(),
        },
      });
      return { data: { success: true } };
    });
  }

  async listRoles() {
    const roles = await this.roles
      .find()
      .sort({ system: -1, name: 1 })
      .lean()
      .exec();
    const counts = await this.assignments.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { revokedAt: { $exists: false } } },
      { $group: { _id: "$roleId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      counts.map((item) => [String(item._id), item.count]),
    );
    return {
      data: roles.map((role) => ({
        ...role,
        id: String(role._id),
        userCount: countMap.get(String(role._id)) ?? 0,
      })),
    };
  }

  permissions() {
    return { data: PERMISSION_GROUPS };
  }

  async createRole(input: CreateRoleDto, actor: CurrentActor) {
    this.assertPermissionDependencies(input.permissions);
    try {
      const role = await this.roles.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim(),
        permissions: [...new Set(input.permissions)],
        isActive: input.isActive ?? true,
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

  async updateRole(id: string, input: UpdateRoleDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const role = await this.roles.findById(id).exec();
    if (!role) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (input.permissions) this.assertPermissionDependencies(input.permissions);
    if (
      role.code === "SYSTEM_ADMIN" &&
      (input.isActive === false ||
        (input.permissions &&
          !ALL_PERMISSIONS.every((permission) =>
            input.permissions!.includes(permission),
          )))
    ) {
      throw new BadRequestException({ code: "SYSTEM_ADMIN_ROLE_PROTECTED" });
    }
    if (input.name !== undefined) role.name = input.name.trim();
    if (input.description !== undefined)
      role.description = input.description.trim();
    if (input.permissions !== undefined)
      role.permissions = [...new Set(input.permissions)];
    if (input.isActive !== undefined) role.isActive = input.isActive;
    await role.save();
    const affected = await this.assignments.distinct("userId", {
      roleId: role._id,
      revokedAt: { $exists: false },
    });
    await Promise.all(
      affected.map((userId) =>
        this.auth.revokeUserSessions(userId, "PERMISSIONS_CHANGED"),
      ),
    );
    await this.audit.write({
      actorUserId: actor.userId,
      action: input.permissions ? "PERMISSIONS_UPDATED" : "ROLE_UPDATED",
      entityType: "Role",
      entityId: role._id,
      outcome: "SUCCESS",
      metadata: { permissionCount: role.permissions.length },
    });
    return { data: role.toObject() };
  }

  async listAudit(query: ListQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1),
      limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.actorUserId) filter.actorUserId = query.actorUserId;
    if (query.q?.trim())
      filter.$or = [
        { action: new RegExp(this.escapeRegex(query.q.trim()), "i") },
        { entityType: new RegExp(this.escapeRegex(query.q.trim()), "i") },
      ];
    const [data, total] = await Promise.all([
      this.auditLogs
        .find(filter)
        .populate("actorUserId", "displayName employeeCode email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.auditLogs.countDocuments(filter),
    ]);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
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
    return this.withAdminSafety(async () => {
      const assignment = await this.assignments.findOne({
        _id: id,
        revokedAt: { $exists: false },
      });
      if (!assignment)
        throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      await this.assertNotLastAdmin(
        String(assignment.userId),
        String(assignment.roleId),
      );
      assignment.revokedAt = new Date();
      await assignment.save();
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
    });
  }

  private async replaceRole(
    userId: string,
    roleId: string,
    actor: CurrentActor,
  ) {
    const [user, role, oldAssignments] = await Promise.all([
      this.users.findById(userId).exec(),
      this.roles.findOne({ _id: roleId, isActive: true }).exec(),
      this.assignments
        .find({ userId, revokedAt: { $exists: false } })
        .populate("roleId", "code name")
        .lean()
        .exec(),
    ]);
    if (!user) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!role)
      throw new BadRequestException({ code: "ROLE_REFERENCE_INVALID" });
    await this.assertNotLastAdmin(userId, undefined, role.code);
    const now = new Date();
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.assignments.updateMany(
          { userId, revokedAt: { $exists: false } },
          { $set: { revokedAt: now } },
          { session },
        );
        await this.assignments.create(
          [
            {
              userId,
              roleId: role._id,
              scope: {
                departmentMode: user.primaryDepartmentId
                  ? "OWN_DEPARTMENT"
                  : "SELF",
                departmentIds: [],
                warehouseMode: "NONE",
                warehouseIds: [],
              },
              grantedBy: actor.userId,
            },
          ],
          { session },
        );
        await this.users.updateOne(
          { _id: user._id },
          { $set: { updatedAt: now } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    await this.auth.revokeUserSessions(
      new Types.ObjectId(userId),
      "PERMISSIONS_CHANGED",
    );
    await this.audit.write({
      actorUserId: actor.userId,
      action: "ROLE_ASSIGNED",
      entityType: "User",
      entityId: new Types.ObjectId(userId),
      outcome: "SUCCESS",
      metadata: {
        targetUserId: userId,
        oldRole: oldAssignments.map((assignment) => {
          const oldRole = assignment.roleId as unknown as {
            code: string;
            name: string;
          };
          return { code: oldRole.code, name: oldRole.name };
        }),
        newRole: { code: role.code, name: role.name },
        changedBy: actor.userId.toString(),
        changedAt: now.toISOString(),
      },
    });
  }

  private async assertNotLastAdmin(
    userId: string,
    assignmentRoleId?: string,
    replacementRoleCode?: string,
  ) {
    const adminRole = await this.roles
      .findOne({ code: "SYSTEM_ADMIN" })
      .select("_id")
      .lean()
      .exec();
    if (!adminRole || replacementRoleCode === "SYSTEM_ADMIN") return;
    if (assignmentRoleId && assignmentRoleId !== String(adminRole._id)) return;
    const isAdmin = await this.assignments.exists({
      userId,
      roleId: adminRole._id,
      revokedAt: { $exists: false },
    });
    if (!isAdmin) return;
    const target = await this.users
      .findById(userId)
      .select("status")
      .lean()
      .exec();
    if (!target || target.status !== "ACTIVE") return;
    const activeAdminAssignments = await this.assignments.distinct("userId", {
      roleId: adminRole._id,
      revokedAt: { $exists: false },
    });
    const activeAdmins = await this.users.countDocuments({
      _id: { $in: activeAdminAssignments },
      status: "ACTIVE",
    });
    if (activeAdmins <= 1)
      throw new ConflictException({ code: "LAST_ADMIN_PROTECTED" });
  }

  private async hasBusinessHistory(userId: Types.ObjectId): Promise<boolean> {
    const references: Array<{ collection: string; fields: string[] }> = [
      {
        collection: "inbound_receipts",
        fields: [
          "createdBy",
          "submittedBy",
          "approvedBy",
          "completedBy",
          "reversedBy",
        ],
      },
      {
        collection: "operations",
        fields: [
          "createdBy",
          "updatedBy",
          "completedBy",
          "dispatchedBy",
          "receivedBy",
          "closedBy",
          "returnHistory.receivedBy",
          "lines.returnReceivedBy",
        ],
      },
      {
        collection: "repairs",
        fields: [
          "createdBy",
          "updatedBy",
          "receivedBy",
          "completedBy",
          "cancelledBy",
          "statusHistory.by",
        ],
      },
      {
        collection: "inventory_counts",
        fields: [
          "createdBy",
          "completedBy",
          "cancelledBy",
          "deviceItems.checkedBy",
          "partItems.checkedBy",
          "discrepancies.resolvedBy",
          "unexpectedItems.recordedBy",
          "statusHistory.by",
        ],
      },
      {
        collection: "liquidations",
        fields: [
          "requestedBy",
          "createdBy",
          "updatedBy",
          "submittedBy",
          "approvedBy",
          "completedBy",
          "rejectedBy",
          "cancelledBy",
          "statusHistory.by",
        ],
      },
      { collection: "inventory_transactions", fields: ["createdBy"] },
      {
        collection: "purchase_requests",
        fields: [
          "requestedBy",
          "createdBy",
          "updatedBy",
          "completedBy",
          "history.actorUserId",
        ],
      },
      { collection: "idempotency_keys", fields: ["actorUserId"] },
      { collection: "audit_logs", fields: ["actorUserId"] },
      { collection: "user_role_assignments", fields: ["grantedBy"] },
    ];
    const results = await Promise.all(
      references.map(({ collection, fields }) =>
        this.connection
          .collection(collection)
          .countDocuments(
            { $or: fields.map((field) => ({ [field]: userId })) },
            { limit: 1 },
          ),
      ),
    );
    return results.some((count) => count > 0);
  }

  private actorHas(actor: CurrentActor, permission: Permission): boolean {
    if (actor.permissions.includes(permission)) return true;
    if (permission === "users.assign_role")
      return actor.permissions.includes("roles.assign");
    return permission.startsWith("users.")
      ? actor.permissions.includes("users.manage")
      : false;
  }

  private async withAdminSafety<T>(action: () => Promise<T>): Promise<T> {
    const owner = randomUUID();
    const staleAt = new Date(Date.now() - 30_000);
    try {
      const lock = await this.bootstrapLocks.findOneAndUpdate(
        {
          _id: "admin-account-mutation",
          $or: [{ updatedAt: { $lt: staleAt } }, { owner }],
        },
        { $set: { owner, status: "RUNNING" } },
        { upsert: true, new: true },
      );
      if (lock.owner !== owner)
        throw new ConflictException({ code: "ADMIN_CHANGE_IN_PROGRESS" });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "ADMIN_CHANGE_IN_PROGRESS" });
      throw error;
    }
    try {
      return await action();
    } finally {
      await this.bootstrapLocks.deleteOne({
        _id: "admin-account-mutation",
        owner,
      });
    }
  }

  async listDepartments() {
    return {
      data: await this.departments.find().sort({ name: 1 }).lean().exec(),
    };
  }

  async createDepartment(input: CreateDepartmentDto) {
    if (input.parentId) await this.assertActiveDepartment(input.parentId);
    const code =
      input.code?.trim().toUpperCase() ??
      (await this.displayCodes.nextCode(
        "DEPARTMENT",
        input.name,
        async (candidate) =>
          Boolean(await this.departments.exists({ code: candidate })),
      ));
    return {
      data: await this.departments.create({
        code,
        name: input.name.trim(),
        parentId: input.parentId,
      }),
    };
  }

  async listWarehouses() {
    return {
      data: await this.warehouses
        .find()
        .populate("managerKeeperId", "displayName employeeCode")
        .sort({ name: 1 })
        .lean()
        .exec(),
    };
  }

  async createWarehouse(input: CreateWarehouseDto) {
    if (input.departmentId)
      await this.assertActiveDepartment(input.departmentId);
    const code =
      input.code?.trim().toUpperCase() ??
      (await this.displayCodes.nextCode(
        "WAREHOUSE",
        input.name,
        async (candidate) =>
          Boolean(await this.warehouses.exists({ code: candidate })),
      ));
    return {
      data: await this.warehouses.create({
        code,
        name: input.name.trim(),
        departmentId: input.departmentId,
        address: input.address?.trim(),
        description: input.description?.trim(),
        managerKeeperId: input.managerKeeperId,
      }),
    };
  }

  async updateWarehouse(id: string, input: UpdateWarehouseDto) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "WAREHOUSE_NOT_FOUND" });
    if (input.departmentId)
      await this.assertActiveDepartment(input.departmentId);
    if (
      input.managerKeeperId &&
      !(await this.keepers.exists({
        _id: input.managerKeeperId,
        isActive: true,
      }))
    )
      throw new BadRequestException({ code: "KEEPER_REFERENCE_INVALID" });
    const update: Record<string, unknown> = {
      name: input.name.trim(),
      address: input.address?.trim() || undefined,
      description: input.description?.trim() || undefined,
      managerKeeperId: input.managerKeeperId || undefined,
      departmentId: input.departmentId || undefined,
    };
    if (input.code?.trim()) update.code = input.code.trim().toUpperCase();
    const item = await this.warehouses
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .populate("managerKeeperId", "displayName employeeCode")
      .lean()
      .exec();
    if (!item) throw new NotFoundException({ code: "WAREHOUSE_NOT_FOUND" });
    return { data: item };
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
        mustChangePassword: false,
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
      employeeId: user.employeeId?.toString(),
      employeeCode: user.employeeCode,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      primaryDepartmentId: user.primaryDepartmentId?.toString(),
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      createdAt: (user as User & { createdAt?: Date }).createdAt,
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private assertPermissionDependencies(permissions: readonly string[]): void {
    for (const group of PERMISSION_GROUPS) {
      const codes = group.permissions.map((item) => item.code);
      if (group.module === "Quản trị") continue;
      if (
        codes.slice(1).some((permission) => permissions.includes(permission)) &&
        !permissions.includes(codes[0])
      ) {
        throw new BadRequestException({
          code: "PERMISSION_DEPENDENCY_REQUIRED",
          module: group.module,
          requiredPermission: codes[0],
        });
      }
    }
    const dependencies: Record<string, string> = {
      "users.create": "users.view",
      "users.update": "users.view",
      "users.assign_role": "users.view",
      "users.lock": "users.view",
      "users.activate": "users.view",
      "users.reset_password": "users.view",
      "users.delete": "users.view",
      "roles.manage": "roles.view",
      "roles.assign": "roles.view",
    };
    for (const [permission, parent] of Object.entries(dependencies)) {
      if (permissions.includes(permission) && !permissions.includes(parent)) {
        throw new BadRequestException({
          code: "PERMISSION_DEPENDENCY_REQUIRED",
          requiredPermission: parent,
        });
      }
    }
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
