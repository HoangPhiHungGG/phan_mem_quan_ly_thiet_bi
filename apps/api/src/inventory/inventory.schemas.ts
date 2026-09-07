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
  @Prop({ min: 0 }) lineIndex?: number;
}
export const InventoryTransactionSchema =
  SchemaFactory.createForClass(InventoryTransaction);
InventoryTransactionSchema.index({ warehouseId: 1, partId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ receiptId: 1, lineIndex: 1 });
InventoryTransactionSchema.index({ operationId: 1, lineIndex: 1 });
