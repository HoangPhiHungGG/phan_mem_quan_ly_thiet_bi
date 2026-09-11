import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type PurchaseRequestDocument = HydratedDocument<PurchaseRequest>;

export const PURCHASE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const PURCHASE_ITEM_KINDS = ["DEVICE", "PART"] as const;

export const PURCHASE_ACTIONS = [
  "CREATED",
  "UPDATED",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "ORDERED",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED",
] as const;

// Dòng hàng chứng từ mua sắm
@Schema({ _id: false })
export class PurchaseItem {
  @Prop({ required: true, type: String, enum: PURCHASE_ITEM_KINDS })
  kind!: (typeof PURCHASE_ITEM_KINDS)[number];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "DeviceType" })
  deviceTypeId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ComponentType" })
  componentTypeId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part" })
  partId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "ItemModel" })
  modelId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Unit" })
  unitId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 }) name!: string;
  @Prop({ trim: true, maxlength: 80 }) modelCode?: string;
  @Prop({ trim: true, maxlength: 500 }) spec?: string;
  @Prop({ trim: true, maxlength: 50 }) unitName?: string;

  @Prop({ required: true, min: 1 }) requestedQty!: number;
  @Prop({ required: true, min: 0, default: 0 }) approvedQty!: number;
  @Prop({ required: true, min: 0, default: 0 }) orderedQty!: number;
  @Prop({ required: true, min: 0, default: 0 }) receivedQty!: number;
  @Prop({ required: true, min: 0 }) unitPrice!: number;
  @Prop({ required: true, min: 0 }) amount!: number;

  @Prop({ trim: true, maxlength: 500 }) note?: string;
}

@Schema({ _id: false })
export class PurchaseHistoryEntry {
  @Prop({ required: true, type: String, enum: PURCHASE_ACTIONS })
  action!: (typeof PURCHASE_ACTIONS)[number];
  @Prop({ type: String, enum: PURCHASE_STATUSES }) from?: string;
  @Prop({ type: String, enum: PURCHASE_STATUSES }) to?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  actorUserId!: Types.ObjectId;
  @Prop({ required: true }) at!: Date;
  @Prop({ trim: true, maxlength: 1000 }) note?: string;
  // Idempotency key dành nhận hàng nhiều lượt
  @Prop({ trim: true, maxlength: 120 }) receiveKey?: string;
}

@Schema({
  collection: "purchase_requests",
  timestamps: true,
  optimisticConcurrency: true,
})
export class PurchaseRequest {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  code!: string;

  @Prop({
    required: true,
    type: String,
    enum: PURCHASE_STATUSES,
    default: "DRAFT",
  })
  status!: (typeof PURCHASE_STATUSES)[number];

  @Prop({ required: true, default: Date.now }) requestDate!: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  requestedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  requestDepartmentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Supplier" })
  supplierId?: Types.ObjectId;
  @Prop() expectedDeliveryDate?: Date;
  @Prop({ required: true, trim: true, maxlength: 1000 }) reason!: string;
  @Prop({ trim: true, maxlength: 1000 }) note?: string;

  @Prop({ type: [PurchaseItem], required: true }) items!: PurchaseItem[];

  @Prop({ required: true, min: 0, default: 0 }) subtotal!: number;
  @Prop({ required: true, min: 0, default: 0 }) discount!: number;
  @Prop({ required: true, min: 0, default: 0 }) tax!: number;
  @Prop({ required: true, min: 0, default: 0 }) otherCost!: number;
  @Prop({ required: true, min: 0 }) totalAmount!: number;

  @Prop({ type: [PurchaseHistoryEntry], default: [] })
  history!: PurchaseHistoryEntry[];

  // Phiếu nhập kho liên quan (dành nhận hàng sau)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "InboundReceipt" })
  receiptId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  updatedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  completedBy?: Types.ObjectId;
  @Prop() completedAt?: Date;
  @Prop({ trim: true, maxlength: 500 }) rejectionReason?: string;
  @Prop() cancelledAt?: Date;
  @Prop({ trim: true, maxlength: 500 }) cancelReason?: string;
}

export const PurchaseRequestSchema =
  SchemaFactory.createForClass(PurchaseRequest);
PurchaseRequestSchema.index({ code: 1 }, { unique: true });
PurchaseRequestSchema.index({ status: 1, requestDate: -1 });
PurchaseRequestSchema.index({ requestDepartmentId: 1 });
PurchaseRequestSchema.index({ requestedBy: 1 });
PurchaseRequestSchema.index({ supplierId: 1 });
