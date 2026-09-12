import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type DeviceDocument = HydratedDocument<Device>;
export type PartDocument = HydratedDocument<Part>;
export type PartSerialDocument = HydratedDocument<PartSerial>;

export const TECH_CONDITIONS = ["GOOD", "DEGRADED", "BROKEN"] as const;
export const USAGE_STATUSES = [
  "NOT_RECEIVED",
  "IN_STOCK",
  "IN_USE",
  "REPAIRING",
  "LENT",
  "IN_TRANSIT",
  "DISPOSED",
  "LOST",
] as const;
export const PART_TRACKING_MODES = ["QUANTITY", "SERIAL"] as const;
export const PART_SERIAL_STATUSES = [
  "IN_STOCK",
  "RESERVED",
  "ISSUED",
  "REPAIRING",
  "BROKEN",
  "DISPOSED",
] as const;

export class Attachment {
  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  url?: string;

  @Prop({ trim: true, maxlength: 300 })
  note?: string;
}

// Hồ sơ thiết bị
@Schema({ collection: "devices", timestamps: true })
export class Device {
  @Prop({ trim: true, maxlength: 150 })
  name?: string;

  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  assetCode!: string;

  @Prop({ trim: true, uppercase: true, maxlength: 120 })
  serial?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ItemModel" })
  modelId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "DeviceType" })
  deviceTypeId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Supplier" })
  supplierId?: Types.ObjectId;

  @Prop()
  purchasedAt?: Date;

  @Prop()
  receivedAt?: Date;

  @Prop({ min: 0 })
  purchasePrice?: number;

  @Prop()
  warrantyUntil?: Date;

  @Prop({
    required: true,
    type: String,
    enum: TECH_CONDITIONS,
    default: "GOOD",
  })
  techCondition!: (typeof TECH_CONDITIONS)[number];

  // Trạng thái sử dụng chỉ thay đổi qua nghiệp vụ (cấp phát/thu hồi/điều chuyển...)
  @Prop({
    required: true,
    type: String,
    enum: USAGE_STATUSES,
    default: "IN_STOCK",
  })
  usageStatus!: (typeof USAGE_STATUSES)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  warehouseId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  locationId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  departmentId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "OperationDocument" })
  loanId?: Types.ObjectId;
  @Prop() borrowedAt?: Date;
  @Prop() loanDueDate?: Date;

  // Người giữ chỉ thay đổi qua nghiệp vụ cấp phát/thu hồi
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  keeperId?: Types.ObjectId;

  @Prop({ type: [Attachment], default: [] })
  attachments!: Attachment[];

  @Prop({ trim: true, maxlength: 1000 })
  notes?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
DeviceSchema.index({ assetCode: 1 }, { unique: true });
DeviceSchema.index({ serial: 1 }, { unique: true, sparse: true });
DeviceSchema.index({ usageStatus: 1, techCondition: 1 });
DeviceSchema.index({ deviceTypeId: 1 });
DeviceSchema.index({ departmentId: 1 });
DeviceSchema.index({ keeperId: 1 });
DeviceSchema.index({ locationId: 1 });
DeviceSchema.index({ modelId: 1 });
DeviceSchema.index({ warehouseId: 1, isActive: 1 });

// Linh kiện - quản lý theo số lượng hoặc theo từng chiếc có serial
@Schema({ collection: "parts", timestamps: true })
export class Part {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ required: true, type: String, enum: PART_TRACKING_MODES })
  trackingMode!: (typeof PART_TRACKING_MODES)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Unit", required: true })
  unitId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ComponentType" })
  componentTypeId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ItemModel" })
  modelId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Supplier" })
  supplierId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  spec?: string;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  @Prop({ required: true, min: 0, default: 0 })
  minQty!: number;

  // Tồn kho chỉ thay đổi qua nghiệp vụ nhập/xuất (số dư đầu kỳ, cấp phát...)
  @Prop({ required: true, min: 0, default: 0 })
  stockQty!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export const PartSchema = SchemaFactory.createForClass(Part);
PartSchema.index({ code: 1 }, { unique: true });
PartSchema.index({ name: 1 });
PartSchema.index({ trackingMode: 1, isActive: 1 });
PartSchema.index({ componentTypeId: 1 });
PartSchema.index({ modelId: 1 });

// Từng chiếc linh kiện có serial (chỉ tạo qua nghiệp vụ nhập kho ở bước sau)
@Schema({ collection: "part_serials", timestamps: true })
export class PartSerial {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Part",
    required: true,
  })
  partId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true, maxlength: 120 })
  serial!: string;

  @Prop({
    required: true,
    type: String,
    enum: PART_SERIAL_STATUSES,
    default: "IN_STOCK",
  })
  status!: (typeof PART_SERIAL_STATUSES)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  warehouseId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  locationId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  note?: string;
}

export const PartSerialSchema = SchemaFactory.createForClass(PartSerial);
PartSerialSchema.index({ partId: 1, serial: 1 }, { unique: true });
PartSerialSchema.index({ partId: 1, status: 1 });
