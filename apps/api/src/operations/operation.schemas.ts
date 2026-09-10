import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

import { LOAN_OUT_CONDITIONS, LOAN_IN_CONDITIONS } from "./loan.constants";

export const OPERATION_TYPES = [
  "ISSUE",
  "LOAN",
  "TRANSFER",
  "RECOVERY",
] as const;
export const OPERATION_STATUSES = [
  "DRAFT",
  "PENDING",
  "IN_TRANSIT",
  "PARTIAL",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "ACTIVE",
  "PARTIALLY_RETURNED",
  "RETURNED",
] as const;

@Schema({ _id: false })
export class OperationLine {
  @Prop({ required: true, type: String, enum: ["DEVICE", "PART"] })
  kind!: "DEVICE" | "PART";
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Device" })
  deviceId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part" })
  partId?: Types.ObjectId;
  @Prop({ required: true, min: 1, default: 1 }) quantity!: number;
  @Prop({ type: [String], default: [] }) serials?: string[];
  @Prop({ default: false }) returned!: boolean;
  @Prop({ enum: ["GOOD", "DEGRADED", "BROKEN"] }) handoverCondition?: string;
  @Prop({ enum: LOAN_IN_CONDITIONS }) receivedCondition?: string;
  @Prop({ trim: true, maxlength: 500 }) note?: string;
  @Prop({ enum: LOAN_OUT_CONDITIONS }) conditionOut?: string;
  @Prop({ trim: true, maxlength: 500 }) conditionOutDescription?: string;
  @Prop({ trim: true, maxlength: 500 }) accessoryNote?: string;
  @Prop({ trim: true }) deviceName?: string;
  @Prop({ trim: true }) assetCode?: string;
  @Prop({ trim: true }) serial?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  loanSourceLocationId?: Types.ObjectId;
  @Prop() handedOverAt?: Date;
  @Prop() returnedAt?: Date;
  @Prop({ enum: LOAN_IN_CONDITIONS }) conditionIn?: string;
  @Prop({ trim: true, maxlength: 500 }) conditionInDescription?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  returnReceivedBy?: Types.ObjectId;
  @Prop({ trim: true, maxlength: 500 }) returnNote?: string;
  @Prop({ enum: ["IN_STOCK", "REPAIRING", "LOST"] }) returnResult?: string;
}

@Schema({ _id: false })
export class LoanReturnItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Device", required: true })
  deviceId!: Types.ObjectId;
  @Prop() deviceName?: string;
  @Prop() assetCode?: string;
  @Prop() serial?: string;
  @Prop() conditionOut?: string;
  @Prop() conditionOutDescription?: string;
  @Prop({ required: true, enum: LOAN_IN_CONDITIONS }) conditionIn!: string;
  @Prop({ trim: true, maxlength: 500 }) conditionInDescription?: string;
  @Prop({ trim: true, maxlength: 500 }) note?: string;
  @Prop({ required: true, enum: ["IN_STOCK", "REPAIRING", "LOST"] })
  result!: string;
}
@Schema()
export class LoanReturn {
  @Prop({ type: MongooseSchema.Types.ObjectId, auto: true })
  _id!: Types.ObjectId;
  @Prop({ required: true }) returnedAt!: Date;
  @Prop({ required: true }) recordedAt!: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  receivedBy!: Types.ObjectId;
  @Prop({ trim: true, maxlength: 1000 }) note?: string;
  @Prop({ type: [LoanReturnItem], required: true }) items!: LoanReturnItem[];
}

@Schema({
  collection: "operations",
  timestamps: true,
  optimisticConcurrency: true,
})
export class OperationDocument {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  code!: string;
  @Prop({ required: true, type: String, enum: OPERATION_TYPES })
  type!: (typeof OPERATION_TYPES)[number];
  @Prop({
    required: true,
    type: String,
    enum: OPERATION_STATUSES,
    default: "DRAFT",
  })
  status!: (typeof OPERATION_STATUSES)[number];
  @Prop({ required: true }) operationDate!: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  sourceWarehouseId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  destinationWarehouseId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  sourceLocationId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  destinationLocationId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  receiverKeeperId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  receiverDepartmentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  senderKeeperId?: Types.ObjectId;
  @Prop() dueDate?: Date;
  @Prop({ required: true, trim: true, maxlength: 1000 }) reason!: string;
  @Prop({ type: [LoanReturn], default: undefined })
  returnHistory?: LoanReturn[];
  @Prop({ trim: true, maxlength: 1000 }) note?: string;
  @Prop() completedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  completedBy?: Types.ObjectId;
  @Prop({
    type: [OperationLine],
    validate: [(v: unknown[]) => v.length > 0, "OPERATION_LINES_REQUIRED"],
  })
  lines!: OperationLine[];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  dispatchedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  receivedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  closedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  updatedBy?: Types.ObjectId;
  @Prop() dispatchedAt?: Date;
  @Prop() receivedAt?: Date;
  @Prop() closedAt?: Date;
  @Prop({ trim: true, maxlength: 500 }) rejectionReason?: string;
  // Link Recovery to its original Issue
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "OperationDocument" })
  issueId?: Types.ObjectId;
}
export const OperationDocumentSchema =
  SchemaFactory.createForClass(OperationDocument);
OperationDocumentSchema.index({ code: 1 }, { unique: true });
OperationDocumentSchema.index({ type: 1, status: 1, operationDate: -1 });
OperationDocumentSchema.index({ receiverKeeperId: 1, status: 1, dueDate: 1 });
OperationDocumentSchema.index({ sourceWarehouseId: 1, status: 1 });
