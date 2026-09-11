import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type KeeperDocument = HydratedDocument<Keeper>;
export type PositionDocument = HydratedDocument<Position>;
export type SupplierDocument = HydratedDocument<Supplier>;
export type DeviceTypeDocument = HydratedDocument<DeviceType>;
export type ComponentTypeDocument = HydratedDocument<ComponentType>;
export type UnitDocument = HydratedDocument<Unit>;
export type ItemModelDocument = HydratedDocument<ItemModel>;
export type LocationDocument = HydratedDocument<Location>;

// Người giữ thiết bị (cũng là Nhân viên) - không bắt buộc có tài khoản đăng nhập.
// Đây là nguồn dữ liệu nhân sự dùng chung cho Cấp phát / Mượn / Điều chuyển / Thu hồi.
export const KEEPER_STATUSES = ["ACTIVE", "ON_LEAVE", "RESIGNED"] as const;

@Schema({ collection: "keepers", timestamps: true })
export class Keeper {
  @Prop({ trim: true, uppercase: true, maxlength: 50 })
  code?: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  displayName!: string;

  // Mã nhân viên (NV001, IT001...) - unique
  @Prop({ trim: true, uppercase: true, maxlength: 50 })
  employeeCode?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  departmentId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Position" })
  positionId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 50 })
  phone?: string;

  @Prop({ trim: true, lowercase: true, maxlength: 254 })
  email?: string;

  @Prop()
  joinedAt?: Date;

  // ACTIVE: Đang làm việc · ON_LEAVE: Tạm nghỉ · RESIGNED: Đã nghỉ việc
  @Prop({
    required: true,
    type: String,
    enum: KEEPER_STATUSES,
    default: "ACTIVE",
  })
  status!: (typeof KEEPER_STATUSES)[number];

  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const KeeperSchema = SchemaFactory.createForClass(Keeper);
KeeperSchema.index({ code: 1 }, { unique: true, sparse: true });
KeeperSchema.index({ employeeCode: 1 }, { unique: true, sparse: true });
KeeperSchema.index({ displayName: 1 });
KeeperSchema.index({ departmentId: 1, status: 1 });
KeeperSchema.index({ positionId: 1, status: 1 });
KeeperSchema.index({ status: 1, isActive: 1 });

// Chức vụ nhân viên
@Schema({ collection: "positions", timestamps: true })
export class Position {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 50 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const PositionSchema = SchemaFactory.createForClass(Position);
PositionSchema.index({ code: 1 }, { unique: true });

@Schema({ collection: "suppliers", timestamps: true })
export class Supplier {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 50 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 50 })
  phone?: string;

  @Prop({ trim: true, lowercase: true, maxlength: 254 })
  email?: string;

  @Prop({ trim: true, maxlength: 300 })
  address?: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index({ code: 1 }, { unique: true });
SupplierSchema.index({ name: 1 });

@Schema({ collection: "device_types", timestamps: true })
export class DeviceType {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 50 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const DeviceTypeSchema = SchemaFactory.createForClass(DeviceType);
DeviceTypeSchema.index({ code: 1 }, { unique: true });

// Danh mục riêng cho linh kiện. Không dùng DeviceType để tránh trộn Laptop/PC
// với RAM/SSD/Cáp trong form và báo cáo linh kiện.
@Schema({ collection: "component_types", timestamps: true })
export class ComponentType {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 50 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const ComponentTypeSchema = SchemaFactory.createForClass(ComponentType);
ComponentTypeSchema.index({ code: 1 }, { unique: true });

@Schema({ collection: "units", timestamps: true })
export class Unit {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 20 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 50 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const UnitSchema = SchemaFactory.createForClass(Unit);
UnitSchema.index({ code: 1 }, { unique: true });

export const ITEM_MODEL_ENTITY_TYPES = ["DEVICE", "COMPONENT"] as const;

// Một collection dùng chung về mặt kỹ thuật, nhưng mỗi bản ghi luôn thuộc đúng
// một ngữ cảnh. Nhờ vậy dữ liệu cũ không cần bị xóa hay chuyển collection.
@Schema({ collection: "item_models", timestamps: true })
export class ItemModel {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ type: String, enum: ITEM_MODEL_ENTITY_TYPES })
  entityType?: (typeof ITEM_MODEL_ENTITY_TYPES)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "DeviceType" })
  deviceTypeId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ComponentType" })
  componentTypeId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Unit" })
  unitId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 150 })
  manufacturer?: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const ItemModelSchema = SchemaFactory.createForClass(ItemModel);
ItemModelSchema.index({ code: 1 }, { unique: true });
ItemModelSchema.index({ name: 1 });
ItemModelSchema.index({ deviceTypeId: 1, isActive: 1 });
ItemModelSchema.index({ componentTypeId: 1, isActive: 1 });
ItemModelSchema.index({ entityType: 1, isActive: 1 });

// Vị trí lưu trữ trong kho
@Schema({ collection: "locations", timestamps: true })
export class Location {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 50 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
    required: true,
  })
  warehouseId!: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const LocationSchema = SchemaFactory.createForClass(Location);
LocationSchema.index({ code: 1 }, { unique: true });
LocationSchema.index({ warehouseId: 1, isActive: 1 });
