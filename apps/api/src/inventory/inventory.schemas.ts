import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

@Schema({ collection: "inventory_balances", timestamps: true })
export class InventoryBalance {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part", required: true })
  partId!: Types.ObjectId;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
    required: true,
  })
  warehouseId!: Types.ObjectId;
  @Prop({ required: true, min: 0, default: 0 }) quantity!: number;
}
export const InventoryBalanceSchema =
  SchemaFactory.createForClass(InventoryBalance);
InventoryBalanceSchema.index({ partId: 1, warehouseId: 1 }, { unique: true });

@Schema({ collection: "inventory_transactions", timestamps: true })
export class InventoryTransaction {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Part", required: true })
  partId!: Types.ObjectId;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
    required: true,
  })
  warehouseId!: Types.ObjectId;
  @Prop({
    required: true,
    enum: [
      "OPENING",
      "PURCHASE",
      "ISSUE",
      "RETURN",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "DISPOSAL",
      "ADJUSTMENT",
      "LIQUIDATION",
      "INVENTORY_ADJUSTMENT",
    ],
  })
  type!: string;
  @Prop({ required: true }) quantity!: number;
  @Prop({ trim: true, maxlength: 500 }) note?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "InboundReceipt" })
  receiptId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "OperationDocument" })
  operationId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "RepairDocument" })
  repairId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "LiquidationDocument" })
  liquidationId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "InventoryCountDocument" })
  inventoryCountId?: Types.ObjectId;
  @Prop({ min: 0 }) lineIndex?: number;
}
export const InventoryTransactionSchema =
  SchemaFactory.createForClass(InventoryTransaction);
InventoryTransactionSchema.index({ warehouseId: 1, partId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ receiptId: 1, lineIndex: 1 });
InventoryTransactionSchema.index({ operationId: 1, lineIndex: 1 });
InventoryTransactionSchema.index({ repairId: 1, lineIndex: 1 });
InventoryTransactionSchema.index({ liquidationId: 1, lineIndex: 1 });
InventoryTransactionSchema.index({ inventoryCountId: 1, lineIndex: 1 });

export const ASSET_TRANSACTION_TYPES = ["INITIAL_RECEIPT"] as const;
export const ASSET_TRANSACTION_SOURCES = [
  "DEVICE_CREATE",
  "DEVICE_IMPORT",
  "LEGACY_MIGRATION",
] as const;

// Thiết bị được quản lý theo từng tài sản, không dùng InventoryBalance của linh kiện.
@Schema({ collection: "asset_transactions", timestamps: true })
export class AssetTransaction {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Device", required: true })
  deviceId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Warehouse",
    required: true,
  })
  warehouseId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ASSET_TRANSACTION_TYPES })
  type!: (typeof ASSET_TRANSACTION_TYPES)[number];

  @Prop({ required: true, type: String, enum: ASSET_TRANSACTION_SOURCES })
  source!: (typeof ASSET_TRANSACTION_SOURCES)[number];

  @Prop({ required: true, min: 1, max: 1, default: 1 })
  quantity!: 1;

  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80 })
  assetCode!: string;

  @Prop({ trim: true, uppercase: true, maxlength: 120 })
  serial?: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "User",
    required: function (this: AssetTransaction) {
      return this.source !== "LEGACY_MIGRATION";
    },
  })
  createdBy?: Types.ObjectId;

  @Prop({
    trim: true,
    enum: ["SYSTEM_MIGRATION"],
    required: function (this: AssetTransaction) {
      return this.source === "LEGACY_MIGRATION";
    },
  })
  createdBySystem?: "SYSTEM_MIGRATION";

  @Prop({ trim: true, maxlength: 100 })
  importSessionId?: string;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;
}

export const AssetTransactionSchema =
  SchemaFactory.createForClass(AssetTransaction);
AssetTransactionSchema.index({ deviceId: 1, type: 1 }, { unique: true });
AssetTransactionSchema.index({ warehouseId: 1, createdAt: -1 });
AssetTransactionSchema.index({ importSessionId: 1, deviceId: 1 });
