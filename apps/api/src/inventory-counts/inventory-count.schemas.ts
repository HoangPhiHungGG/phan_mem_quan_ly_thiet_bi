import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

export const COUNT_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "RECONCILING",
  "COMPLETED",
  "CANCELLED",
] as const;
export const COUNT_SCOPES = [
  "ALL",
  "WAREHOUSE",
  "DEPARTMENT",
  "LOCATION",
] as const;
export const COUNT_RESULTS = [
  "MATCHED",
  "MISSING",
  "SURPLUS",
  "NOT_FOUND",
  "WRONG_LOCATION",
  "WRONG_HOLDER",
  "CONDITION_MISMATCH",
] as const;
export const DISCREPANCY_STATUSES = [
  "OPEN",
  "RESOLVED",
  "ACCEPTED",
  "REJECTED",
] as const;

export class CountDeviceItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    default: () => new Types.ObjectId(),
  })
  _id!: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: "Device" })
  deviceId!: Types.ObjectId;
  @Prop({ required: true }) assetCode!: string;
  @Prop() name?: string;
  @Prop() serial?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  expectedWarehouseId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  expectedDepartmentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  expectedKeeperId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  expectedLocationId?: Types.ObjectId;
  @Prop() expectedCondition!: string;
  @Prop({ default: false }) checked!: boolean;
  @Prop({ default: 0 }) revision!: number;
  @Prop({ default: true }) found?: boolean;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  actualWarehouseId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  actualDepartmentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Keeper" })
  actualKeeperId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  actualLocationId?: Types.ObjectId;
  @Prop() actualCondition?: string;
  @Prop({ type: String, enum: COUNT_RESULTS })
  result?: (typeof COUNT_RESULTS)[number];
  @Prop() checkedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  checkedBy?: Types.ObjectId;
  @Prop({ maxlength: 1000 }) note?: string;
}
export class CountPartItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    default: () => new Types.ObjectId(),
  })
  _id!: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: "Part" })
  partId!: Types.ObjectId;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
  })
  warehouseId!: Types.ObjectId;
  @Prop() code!: string;
  @Prop() name!: string;
  @Prop() unit?: string;
  @Prop({ required: true, min: 0 }) expectedQuantity!: number;
  @Prop({ default: false }) checked!: boolean;
  @Prop({ default: 0 }) revision!: number;
  @Prop({ min: 0 }) actualQuantity?: number;
  @Prop() difference?: number;
  @Prop({ type: String, enum: COUNT_RESULTS })
  result?: (typeof COUNT_RESULTS)[number];
  @Prop() checkedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  checkedBy?: Types.ObjectId;
  @Prop({ maxlength: 1000 }) note?: string;
}
export class CountDiscrepancy {
  @Prop({ required: true }) key!: string;
  @Prop({ required: true, type: String, enum: ["DEVICE", "PART"] })
  kind!: "DEVICE" | "PART";
  @Prop({ type: MongooseSchema.Types.ObjectId }) itemId!: Types.ObjectId;
  @Prop({ required: true, type: String, enum: COUNT_RESULTS })
  type!: (typeof COUNT_RESULTS)[number];
  @Prop({ type: MongooseSchema.Types.Mixed }) expected?: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed }) actual?: unknown;
  @Prop({
    required: true,
    type: String,
    enum: DISCREPANCY_STATUSES,
    default: "OPEN",
  })
  status!: (typeof DISCREPANCY_STATUSES)[number];
  @Prop({ maxlength: 1000 }) cause?: string;
  @Prop({ maxlength: 1000 }) resolution?: string;
  @Prop({ maxlength: 1000 }) note?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  resolvedBy?: Types.ObjectId;
  @Prop() resolvedAt?: Date;
}
export class CountStatusEvent {
  @Prop({ required: true, type: String, enum: COUNT_STATUSES }) status!: string;
  @Prop({ required: true }) at!: Date;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: "User" })
  by!: Types.ObjectId;
  @Prop() note?: string;
}
export class CountUnexpectedItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    default: () => new Types.ObjectId(),
  })
  _id!: Types.ObjectId;
  @Prop({ required: true }) assetCode!: string;
  @Prop() serial?: string;
  @Prop() name?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  actualLocationId?: Types.ObjectId;
  @Prop({ required: true, type: String, enum: ["SURPLUS", "WRONG_LOCATION"] })
  result!: string;
  @Prop({ maxlength: 1000 }) note?: string;
  @Prop({ required: true }) recordedAt!: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  recordedBy!: Types.ObjectId;
}

@Schema({
  collection: "inventory_counts",
  timestamps: true,
  optimisticConcurrency: true,
})
export class InventoryCountDocument {
  @Prop({ required: true, unique: true }) code!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) countDate!: Date;
  @Prop({ required: true, type: String, enum: COUNT_SCOPES })
  scope!: (typeof COUNT_SCOPES)[number];
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Warehouse" })
  warehouseId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Department" })
  departmentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Location" })
  locationId?: Types.ObjectId;
  @Prop({ required: true }) responsiblePerson!: string;
  @Prop({ type: [String], default: [] }) members!: string[];
  @Prop({ maxlength: 1000 }) note?: string;
  @Prop({
    required: true,
    type: String,
    enum: COUNT_STATUSES,
    default: "DRAFT",
  })
  status!: (typeof COUNT_STATUSES)[number];
  @Prop({ type: [CountDeviceItem], default: [] })
  deviceItems!: CountDeviceItem[];
  @Prop({ type: [CountPartItem], default: [] }) partItems!: CountPartItem[];
  @Prop({ type: [CountDiscrepancy], default: [] })
  discrepancies!: CountDiscrepancy[];
  @Prop({ type: [CountUnexpectedItem], default: [] })
  unexpectedItems!: CountUnexpectedItem[];
  @Prop() snapshotAt?: Date;
  @Prop() completedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  completedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  cancelledBy?: Types.ObjectId;
  @Prop() cancelledAt?: Date;
  @Prop({ type: [CountStatusEvent], default: [] })
  statusHistory!: CountStatusEvent[];
}
export const InventoryCountDocumentSchema = SchemaFactory.createForClass(
  InventoryCountDocument,
);
InventoryCountDocumentSchema.index({ status: 1, countDate: -1 });
InventoryCountDocumentSchema.index({
  scope: 1,
  warehouseId: 1,
  departmentId: 1,
});
