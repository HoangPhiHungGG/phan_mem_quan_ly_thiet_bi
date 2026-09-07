import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

export const RECEIPT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "COMPLETED",
  "REVERSED",
  "CANCELLED",
] as const;
export const RECEIPT_SOURCES = [
  "OPENING",
  "PURCHASE",
  "RETURN",
  "OTHER",
] as const;
export const RECEIPT_LINE_TYPES = ["DEVICE", "PART"] as const;

@Schema({ _id: false })
export class ReceiptAttachment {
  @Prop({ required: true, trim: true, maxlength: 150 }) name!: string;
  @Prop({ trim: true, maxlength: 500 }) url?: string;
}

@Schema({ _id: false })
export class ReceiptDeviceLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Device" })
  deviceId?: Types.ObjectId;
  @Prop({ trim: true, uppercase: true, maxlength: 80 }) assetCode?: string;
  @Prop({ trim: true, uppercase: true, maxlength: 120 }) serial?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ItemModel" })
  modelId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "DeviceType" })
  deviceTypeId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Supplier" })
  supplierId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  locationId?: Types.ObjectId;
  @Prop({ min: 0 }) purchasePrice?: number;
  @Prop() warrantyUntil?: Date;
  @Prop({ enum: ["GOOD", "DEGRADED", "BROKEN"], default: "GOOD" })
  techCondition!: string;
  @Prop({ trim: true, maxlength: 1000 }) notes?: string;
}

@Schema({ _id: false })
export class ReceiptPartLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part", required: true })
  partId!: Types.ObjectId;
  @Prop({ type: [String], default: [] }) serials!: string[];
}

@Schema({ _id: false })
export class ReceiptLine {
  @Prop({ required: true, enum: RECEIPT_LINE_TYPES }) type!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ type: ReceiptDeviceLine }) device?: ReceiptDeviceLine;
  @Prop({ type: ReceiptPartLine }) part?: ReceiptPartLine;
  @Prop({ trim: true, maxlength: 500 }) note?: string;
}

@Schema({
  collection: "inbound_receipts",
  timestamps: true,
  optimisticConcurrency: true,
})
export class InboundReceipt {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  code!: string;
  @Prop({ required: true }) receiptDate!: Date;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
    required: true,
  })
  warehouseId!: Types.ObjectId;
  @Prop({ required: true, enum: RECEIPT_SOURCES }) source!: string;
  @Prop({ required: true, enum: RECEIPT_STATUSES, default: "DRAFT" })
  status!: string;
  @Prop({ default: false }) requiresApproval!: boolean;
  @Prop({
    type: [ReceiptLine],
    required: true,
    validate: [(v: unknown[]) => v.length > 0, "RECEIPT_LINES_REQUIRED"],
  })
  lines!: ReceiptLine[];
  @Prop({ type: [ReceiptAttachment], default: [] })
  attachments!: ReceiptAttachment[];
  @Prop({ trim: true, maxlength: 500 }) openingSource?: string;
  @Prop({ trim: true, maxlength: 1000 }) openingReason?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  submittedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  approvedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  completedBy?: Types.ObjectId;
  @Prop() completedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "InboundReceipt" })
  reversedReceiptId?: Types.ObjectId;
  @Prop() reversedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  reversedBy?: Types.ObjectId;
}
export const InboundReceiptSchema =
  SchemaFactory.createForClass(InboundReceipt);
InboundReceiptSchema.index({ code: 1 }, { unique: true });
InboundReceiptSchema.index({ warehouseId: 1, status: 1, receiptDate: -1 });
InboundReceiptSchema.index({ source: 1, receiptDate: -1 });

@Schema({ collection: "idempotency_keys", timestamps: true })
export class IdempotencyKey {
  @Prop({ required: true, trim: true, maxlength: 120 }) key!: string;
  @Prop({ required: true }) requestHash!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  actorUserId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "InboundReceipt" })
  receiptId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "OperationDocument" })
  operationId?: Types.ObjectId;
}
export const IdempotencyKeySchema =
  SchemaFactory.createForClass(IdempotencyKey);
IdempotencyKeySchema.index({ key: 1, actorUserId: 1 }, { unique: true });
