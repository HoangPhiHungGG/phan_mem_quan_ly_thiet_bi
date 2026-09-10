import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type UserDocument = HydratedDocument<User>;
export type RoleDocument = HydratedDocument<Role>;
export type RoleAssignmentDocument = HydratedDocument<RoleAssignment>;
export type DepartmentDocument = HydratedDocument<Department>;
export type WarehouseDocument = HydratedDocument<Warehouse>;
export type BootstrapLockDocument = HydratedDocument<BootstrapLock>;

export const PERMISSION_GROUPS = [
  {
    module: "Tổng quan",
    permissions: [{ code: "dashboard.view", label: "Xem" }],
  },
  {
    module: "Thiết bị",
    permissions: [
      { code: "devices.read", label: "Xem" },
      { code: "devices.manage", label: "Tạo, sửa và xóa" },
    ],
  },
  {
    module: "Linh kiện",
    permissions: [
      { code: "parts.read", label: "Xem" },
      { code: "parts.manage", label: "Tạo, sửa và xóa" },
    ],
  },
  {
    module: "Danh mục & nhân sự",
    permissions: [
      { code: "catalog.read", label: "Xem" },
      { code: "catalog.manage", label: "Quản lý" },
    ],
  },
  {
    module: "Bộ phận",
    permissions: [
      { code: "departments.read", label: "Xem" },
      { code: "departments.manage", label: "Quản lý" },
    ],
  },
  {
    module: "Kho",
    permissions: [
      { code: "warehouses.read", label: "Xem" },
      { code: "warehouses.manage", label: "Quản lý" },
      { code: "opening-balance.manage", label: "Nhập số dư đầu kỳ" },
    ],
  },
  {
    module: "Nhập kho",
    permissions: [
      { code: "receipts.read", label: "Xem" },
      { code: "receipts.manage", label: "Quản lý và hoàn tất" },
    ],
  },
  {
    module: "Cấp phát, mượn/trả, điều chuyển, thu hồi",
    permissions: [
      { code: "operations.read", label: "Xem" },
      { code: "operations.manage", label: "Tạo, sửa, hoàn tất và hủy" },
    ],
  },
  {
    module: "Sửa chữa",
    permissions: [
      { code: "repair.view", label: "Xem" },
      { code: "repair.create", label: "Tạo" },
      { code: "repair.edit", label: "Sửa" },
      { code: "repair.receive", label: "Tiếp nhận" },
      { code: "repair.complete", label: "Hoàn tất" },
      { code: "repair.cancel", label: "Hủy" },
    ],
  },
  {
    module: "Kiểm kê",
    permissions: [
      { code: "inventory.view", label: "Xem" },
      { code: "inventory.create", label: "Tạo" },
      { code: "inventory.edit", label: "Sửa" },
      { code: "inventory.perform", label: "Thực hiện" },
      { code: "inventory.reconcile", label: "Xử lý chênh lệch" },
      { code: "inventory.complete", label: "Hoàn tất" },
      { code: "inventory.cancel", label: "Hủy" },
    ],
  },
  {
    module: "Thanh lý",
    permissions: [
      { code: "liquidation.view", label: "Xem" },
      { code: "liquidation.create", label: "Tạo" },
      { code: "liquidation.edit", label: "Sửa" },
      { code: "liquidation.submit", label: "Gửi duyệt" },
      { code: "liquidation.approve", label: "Duyệt/từ chối" },
      { code: "liquidation.complete", label: "Hoàn tất" },
      { code: "liquidation.cancel", label: "Hủy" },
    ],
  },
  {
    module: "Mua sắm",
    permissions: [
      { code: "purchases.read", label: "Xem" },
      { code: "purchases.manage", label: "Quản lý" },
    ],
  },
  {
    module: "Báo cáo",
    permissions: [{ code: "reports.read", label: "Xem và xuất báo cáo" }],
  },
  {
    module: "Quản trị",
    permissions: [
      { code: "users.view", label: "Xem tài khoản" },
      { code: "users.create", label: "Tạo tài khoản" },
      { code: "users.update", label: "Sửa tài khoản" },
      { code: "users.assign_role", label: "Sửa vai trò" },
      { code: "users.lock", label: "Khóa/mở khóa" },
      { code: "users.activate", label: "Vô hiệu hóa/kích hoạt" },
      { code: "users.reset_password", label: "Đặt lại mật khẩu" },
      { code: "users.delete", label: "Xóa tài khoản chưa sử dụng" },
      { code: "roles.view", label: "Xem vai trò" },
      { code: "roles.manage", label: "Quản lý vai trò và quyền" },
      { code: "roles.assign", label: "Gán vai trò" },
      { code: "audit.view", label: "Xem nhật ký quản trị" },
    ],
  },
] as const;

export const LEGACY_PERMISSIONS = [
  "account.read.self",
  "users.read",
  "users.manage",
  "roles.read",
  "departments.read",
  "departments.manage",
  "warehouses.read",
  "warehouses.manage",
  "catalog.read",
  "catalog.manage",
  "devices.read",
  "devices.manage",
  "parts.read",
  "parts.manage",
  "receipts.read",
  "receipts.manage",
  "opening-balance.manage",
  "operations.read",
  "operations.manage",
  "repair.view",
  "repair.create",
  "repair.edit",
  "repair.receive",
  "repair.complete",
  "repair.cancel",
  "liquidation.view",
  "liquidation.create",
  "liquidation.edit",
  "liquidation.submit",
  "liquidation.approve",
  "liquidation.complete",
  "liquidation.cancel",
  "inventory.view",
  "inventory.create",
  "inventory.edit",
  "inventory.perform",
  "inventory.reconcile",
  "inventory.complete",
  "inventory.cancel",
  "purchases.read",
  "purchases.manage",
] as const;

export const ALL_PERMISSIONS = [
  ...new Set([
    ...LEGACY_PERMISSIONS,
    ...PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.map((item) => item.code),
    ),
  ]),
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

@Schema({ collection: "users", timestamps: true, optimisticConcurrency: true })
export class User {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  employeeId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 50 })
  employeeCode!: string;

  @Prop({ required: true, trim: true, uppercase: true })
  employeeCodeNormalized!: string;

  @Prop({ required: true, trim: true, maxlength: 254 })
  email!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  emailNormalized!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  displayName!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({
    required: true,
    enum: ["INVITED", "ACTIVE", "LOCKED", "INACTIVE", "DISABLED"],
    default: "ACTIVE",
  })
  status!: "INVITED" | "ACTIVE" | "LOCKED" | "INACTIVE" | "DISABLED";

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  primaryDepartmentId?: Types.ObjectId;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ default: false })
  mustChangePassword!: boolean;

  @Prop()
  passwordChangedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ employeeCodeNormalized: 1 }, { unique: true });
UserSchema.index({ emailNormalized: 1 }, { unique: true });
UserSchema.index({ employeeId: 1 }, { unique: true, sparse: true });
UserSchema.index({ primaryDepartmentId: 1, status: 1, displayName: 1 });

@Schema({ collection: "roles", timestamps: true, optimisticConcurrency: true })
export class Role {
  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: [String], enum: ALL_PERMISSIONS, default: [] })
  permissions!: Permission[];

  @Prop({ default: false })
  system!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ code: 1 }, { unique: true });

@Schema({ _id: false })
export class AssignmentScope {
  @Prop({
    required: true,
    enum: [
      "SELF",
      "OWN_DEPARTMENT",
      "DEPARTMENT_TREE",
      "SELECTED_DEPARTMENTS",
      "ALL_DEPARTMENTS",
    ],
    default: "SELF",
  })
  departmentMode!: string;

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: "Department",
    default: [],
  })
  departmentIds!: Types.ObjectId[];

  @Prop({
    required: true,
    enum: ["NONE", "ASSIGNED_WAREHOUSES", "ALL_WAREHOUSES"],
    default: "NONE",
  })
  warehouseMode!: string;

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: "Warehouse",
    default: [],
  })
  warehouseIds!: Types.ObjectId[];
}

@Schema({
  collection: "user_role_assignments",
  timestamps: true,
  optimisticConcurrency: true,
})
export class RoleAssignment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  userId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Role", required: true })
  roleId!: Types.ObjectId;

  @Prop({ type: AssignmentScope, required: true })
  scope!: AssignmentScope;

  @Prop({ required: true, default: Date.now })
  validFrom!: Date;

  @Prop()
  validUntil?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  grantedBy?: Types.ObjectId;

  @Prop()
  revokedAt?: Date;
}

export const RoleAssignmentSchema =
  SchemaFactory.createForClass(RoleAssignment);
RoleAssignmentSchema.index({
  userId: 1,
  revokedAt: 1,
  validFrom: 1,
  validUntil: 1,
});
RoleAssignmentSchema.index({ userId: 1, roleId: 1, revokedAt: 1 });

@Schema({
  collection: "departments",
  timestamps: true,
  optimisticConcurrency: true,
})
export class Department {
  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  parentId?: Types.ObjectId;

  @Prop({
    type: [MongooseSchema.Types.ObjectId],
    ref: "Department",
    default: [],
  })
  ancestorIds!: Types.ObjectId[];

  // Người phụ trách bộ phận (tham chiếu tới nhân viên - Keeper)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  managerKeeperId?: Types.ObjectId;

  @Prop({ default: true })
  isActive!: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
DepartmentSchema.index({ code: 1 }, { unique: true });
DepartmentSchema.index({ parentId: 1, isActive: 1 });

@Schema({
  collection: "warehouses",
  timestamps: true,
  optimisticConcurrency: true,
})
export class Warehouse {
  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  departmentId?: Types.ObjectId;

  @Prop({ default: true })
  isActive!: boolean;
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);
WarehouseSchema.index({ code: 1 }, { unique: true });
WarehouseSchema.index({ departmentId: 1, isActive: 1 });

@Schema({ collection: "system_locks", timestamps: true })
export class BootstrapLock {
  @Prop({ required: true })
  _id!: string;

  @Prop({ required: true })
  owner!: string;

  @Prop({ required: true, enum: ["RUNNING", "COMPLETED"] })
  status!: "RUNNING" | "COMPLETED";
}

export const BootstrapLockSchema = SchemaFactory.createForClass(BootstrapLock);
