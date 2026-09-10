import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type RepairDocumentType = HydratedDocument<RepairDocument>;

// Trạng thái phiếu sửa chữa (state machine)
export const REPAIR_STATUSES = [
  "DRAFT",
  "RECEIVED",
  "REPAIRING",
  "COMPLETED",
  "CANCELLED",
  "UNREPAIRABLE",
] as const;

// Trạng thái "đang chạy" của phiếu
export const REPAIR_ACTIVE_STATUSES = [
  "DRAFT",
  "RECEIVED",
  "REPAIRING",
] as const;

// Mức độ lỗi
export const REPAIR_SEVERITIES = [
  "MINOR",
  "MODERATE",
  "SEVERE",
  "BEYOND_REPAIR",
] as const;

// Hình thức sửa chữa
export const REPAIR_TYPES = ["INTERNAL", "WARRANTY", "EXTERNAL"] as const;

// Hướng xử lý sau sửa
export const REPAIR_OUTCOMES = [
  "RETURN_TO_KEEPER",
  "RETURN_TO_WAREHOUSE",
  "PENDING",
  "PENDING_DISPOSAL",
] as const;

// Đối tượng sửa chữa
export const REPAIR_TARGET_KINDS = ["DEVICE", "PART_SERIAL"] as const;

export class RepairPartLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part", required: true })
  partId!: Types.ObjectId;

  // Bắt buộc khi linh kiện quản lý theo serial
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "PartSerial" })
  partSerialId?: Types.ObjectId;

  @Prop({ trim: true, uppercase: true, maxlength: 120 })
  serial?: string;

  @Prop({ required: true, min: 1, default: 1 })
  quantity!: number;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;
}

export class RepairStatusEvent {
  @Prop({ required: true, type: String, enum: REPAIR_STATUSES })
  status!: (typeof REPAIR_STATUSES)[number];

  @Prop({ required: true })
  at!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  by!: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;
}
// Phiếu sửa chữa thiết bị / linh kiện serial
@Schema({
  collection: "repairs",
  timestamps: true,
  optimisticConcurrency: true,
})
export class RepairDocument {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  code!: string;

  @Prop({ required: true })
  repairDate!: Date;

  @Prop({
    required: true,
    type: String,
    enum: REPAIR_TARGET_KINDS,
    default: "DEVICE",
  })
  targetKind!: (typeof REPAIR_TARGET_KINDS)[number];

  // Bắt buộc khi targetKind = DEVICE
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Device" })
  deviceId?: Types.ObjectId;

  // Bắt buộc khi targetKind = PART_SERIAL
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "PartSerial" })
  partSerialId?: Types.ObjectId;

  // Snapshot thông tin đối tượng tại thời điểm lập phiếu
  @Prop({ trim: true, uppercase: true, maxlength: 80 })
  assetCode?: string;

  @Prop({ trim: true, uppercase: true, maxlength: 120 })
  serial?: string;

  @Prop({ trim: true, maxlength: 150 })
  targetName?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  fromKeeperId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  fromDepartmentId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  fromWarehouseId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  fromLocationId?: Types.ObjectId;

  @Prop({ trim: true })
  fromUsageStatus?: string;

  @Prop({ trim: true })
  fromPartSerialStatus?: string;

  // Khóa duy nhất cho phiếu chưa kết thúc, chống tạo trùng cả khi đồng thời.
  @Prop({ trim: true })
  activeTargetKey?: string;

  // Thông tin lỗi
  @Prop({ required: true, type: String, enum: ["GOOD", "DEGRADED", "BROKEN"] })
  conditionBefore!: "GOOD" | "DEGRADED" | "BROKEN";

  @Prop({ required: true, trim: true, maxlength: 2000 })
  issueDescription!: string;

  @Prop({ required: true, type: String, enum: REPAIR_SEVERITIES })
  severity!: (typeof REPAIR_SEVERITIES)[number];

  // Tiếp nhận
  @Prop()
  receivedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  receivedBy?: Types.ObjectId;

  // Quá trình sửa chữa
  @Prop({ required: true, type: String, enum: REPAIR_TYPES })
  repairType!: (typeof REPAIR_TYPES)[number];

  @Prop({ trim: true, maxlength: 200 })
  vendor?: string;

  @Prop({ trim: true, maxlength: 150 })
  vendorContact?: string;

  @Prop({ trim: true, maxlength: 150 })
  responsiblePerson?: string;

  @Prop()
  sentAt?: Date;

  // Chi phí
  @Prop({ min: 0, default: 0 })
  inspectionCost!: number;

  @Prop({ min: 0, default: 0 })
  repairCost!: number;

  @Prop({ min: 0, default: 0 })
  partsCost!: number;

  @Prop({ min: 0, default: 0 })
  otherCost!: number;

  @Prop({ min: 0, default: 0 })
  totalCost!: number;

  // Kết quả
  @Prop({ trim: true, maxlength: 2000 })
  repairContent?: string;

  @Prop({ type: [RepairPartLine], default: [] })
  parts!: RepairPartLine[];

  // Kho lấy linh kiện thay thế (bắt buộc khi có parts)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  partsWarehouseId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 2000 })
  result?: string;

  @Prop({ type: String, enum: ["GOOD", "DEGRADED", "BROKEN"] })
  conditionAfter?: "GOOD" | "DEGRADED" | "BROKEN";

  @Prop({ type: String, enum: REPAIR_OUTCOMES })
  outcome?: (typeof REPAIR_OUTCOMES)[number];

  // Kho nhập lại khi outcome = RETURN_TO_WAREHOUSE
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  destinationWarehouseId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  destinationLocationId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 1000 })
  note?: string;

  @Prop({
    required: true,
    type: String,
    enum: REPAIR_STATUSES,
    default: "DRAFT",
  })
  status!: (typeof REPAIR_STATUSES)[number];

  @Prop({ type: [RepairStatusEvent], default: [] })
  statusHistory!: RepairStatusEvent[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  completedBy?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  cancelledBy?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  updatedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  cancelReason?: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  expectedCompletionAt?: Date;
}

export const RepairDocumentSchema =
  SchemaFactory.createForClass(RepairDocument);
RepairDocumentSchema.index({ code: 1 }, { unique: true });
RepairDocumentSchema.index({ status: 1, repairDate: -1 });
RepairDocumentSchema.index({ deviceId: 1, status: 1 });
RepairDocumentSchema.index({ partSerialId: 1, status: 1 });
RepairDocumentSchema.index({ assetCode: 1 });
RepairDocumentSchema.index(
  { activeTargetKey: 1 },
  { unique: true, sparse: true },
);
