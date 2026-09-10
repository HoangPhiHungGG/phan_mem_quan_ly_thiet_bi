import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

export const LIQUIDATION_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;
export const LIQUIDATION_METHODS = [
  "SALE",
  "DESTROY",
  "DONATE",
  "TRANSFER",
  "OTHER",
] as const;
export const LIQUIDATION_LINE_KINDS = [
  "DEVICE",
  "PART",
  "PART_SERIAL",
] as const;

export class LiquidationLine {
  @Prop({ required: true, type: String, enum: LIQUIDATION_LINE_KINDS })
  kind!: (typeof LIQUIDATION_LINE_KINDS)[number];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Device" })
  deviceId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part" })
  partId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "PartSerial" })
  partSerialId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "RepairDocument" })
  repairId?: Types.ObjectId;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ trim: true }) assetCode?: string;
  @Prop({ trim: true }) serial?: string;
  @Prop({ trim: true }) model?: string;
  @Prop({ trim: true }) condition?: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ min: 0, default: 0 }) originalValue!: number;
  @Prop({ min: 0, default: 0 }) liquidationValue!: number;
  @Prop({ trim: true, maxlength: 1000 }) reason?: string;
  @Prop({ trim: true, maxlength: 1000 }) note?: string;
}

export class LiquidationStatusEvent {
  @Prop({ required: true, type: String, enum: LIQUIDATION_STATUSES })
  status!: (typeof LIQUIDATION_STATUSES)[number];
  @Prop({ required: true }) at!: Date;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: "User" })
  by!: Types.ObjectId;
  @Prop({ trim: true, maxlength: 500 }) note?: string;
}

@Schema({
  collection: "liquidations",
  timestamps: true,
  optimisticConcurrency: true,
})
export class LiquidationDocument {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;
  @Prop({ required: true }) documentDate!: Date;
  @Prop() liquidationDate?: Date;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
  })
  warehouseId!: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 2000 }) reason!: string;
  @Prop({ required: true, type: String, enum: LIQUIDATION_METHODS })
  method!: (typeof LIQUIDATION_METHODS)[number];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  requestedBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  requestedDepartmentId?: Types.ObjectId;
  @Prop({ trim: true, maxlength: 150 }) responsiblePerson?: string;
  @Prop({ trim: true, maxlength: 1000 }) note?: string;
  @Prop({ type: [LiquidationLine], default: [] }) lines!: LiquidationLine[];
  @Prop({ min: 0, default: 0 }) totalValue!: number;
  @Prop({
    required: true,
    type: String,
    enum: LIQUIDATION_STATUSES,
    default: "DRAFT",
  })
  status!: (typeof LIQUIDATION_STATUSES)[number];
  @Prop({ type: [LiquidationStatusEvent], default: [] })
  statusHistory!: LiquidationStatusEvent[];
  @Prop({ type: [String], default: undefined }) activeAssetKeys?: string[];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  updatedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  submittedBy?: Types.ObjectId;
  @Prop() submittedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  approvedBy?: Types.ObjectId;
  @Prop() approvedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  completedBy?: Types.ObjectId;
  @Prop() completedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  rejectedBy?: Types.ObjectId;
  @Prop() rejectedAt?: Date;
  @Prop({ trim: true, maxlength: 500 }) rejectionReason?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  cancelledBy?: Types.ObjectId;
  @Prop() cancelledAt?: Date;
  @Prop({ trim: true, maxlength: 500 }) cancelReason?: string;
}
export const LiquidationDocumentSchema =
  SchemaFactory.createForClass(LiquidationDocument);
LiquidationDocumentSchema.index({ status: 1, documentDate: -1 });
LiquidationDocumentSchema.index({ "lines.deviceId": 1, status: 1 });
LiquidationDocumentSchema.index({ "lines.partSerialId": 1, status: 1 });
LiquidationDocumentSchema.index(
  { activeAssetKeys: 1 },
  { unique: true, sparse: true },
);
