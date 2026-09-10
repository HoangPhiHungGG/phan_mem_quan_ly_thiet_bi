import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { ItemModel, ItemModelSchema } from "../catalog/catalog.schemas";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
  PartSerial,
  PartSerialSchema,
} from "../equipment/equipment.schemas";
import {
  Department,
  DepartmentSchema,
  Warehouse,
  WarehouseSchema,
} from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";
import {
  RepairDocument,
  RepairDocumentSchema,
} from "../repairs/repairs.schemas";
import { LiquidationController } from "./liquidation.controller";
import {
  LiquidationDocument,
  LiquidationDocumentSchema,
} from "./liquidation.schemas";
import { LiquidationService } from "./liquidation.service";
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: LiquidationDocument.name, schema: LiquidationDocumentSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: PartSerial.name, schema: PartSerialSchema },
      { name: RepairDocument.name, schema: RepairDocumentSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: ItemModel.name, schema: ItemModelSchema },
    ]),
  ],
  controllers: [LiquidationController],
  providers: [LiquidationService],
})
export class LiquidationModule {}
