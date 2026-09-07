import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type UserDocument = HydratedDocument<User>;
export type RoleDocument = HydratedDocument<Role>;
export type RoleAssignmentDocument = HydratedDocument<RoleAssignment>;
export type DepartmentDocument = HydratedDocument<Department>;
export type WarehouseDocument = HydratedDocument<Warehouse>;
export type BootstrapLockDocument = HydratedDocument<BootstrapLock>;

export const ALL_PERMISSIONS = [
  "account.read.self",
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
  "roles.assign",
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
  "purchases.read",
  "purchases.manage",
  "reports.read",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

@Schema({ collection: "users", timestamps: true, optimisticConcurrency: true })
export class User {
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
    enum: ["INVITED", "ACTIVE", "LOCKED", "DISABLED"],
    default: "ACTIVE",
  })
  status!: "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  primaryDepartmentId?: Types.ObjectId;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ employeeCodeNormalized: 1 }, { unique: true });
UserSchema.index({ emailNormalized: 1 }, { unique: true });
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
