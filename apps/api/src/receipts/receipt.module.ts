import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
  PartSerial,
  PartSerialSchema,
} from "../equipment/equipment.schemas";
import { Warehouse, WarehouseSchema } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";
import {
  IdempotencyKey,
  IdempotencyKeySchema,
  InboundReceipt,
  InboundReceiptSchema,
} from "./receipt.schemas";
import { ReceiptController } from "./receipt.controller";
import { ReceiptService } from "./receipt.service";
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: InboundReceipt.name, schema: InboundReceiptSchema },
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: PartSerial.name, schema: PartSerialSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
    ]),
  ],
  controllers: [ReceiptController],
  providers: [ReceiptService],
})
export class ReceiptModule {}
