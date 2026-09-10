import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
} from "../equipment/equipment.schemas";
import { Warehouse, WarehouseSchema } from "../identity/identity.schemas";
import { InventoryController } from "./inventory.controller";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "./inventory.schemas";
import { WarehouseViewService } from "./warehouse-view.service";
import { WarehouseViewController } from "./warehouse-view.controller";
import { InventoryService } from "./inventory.service";
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Part.name, schema: PartSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
    ]),
  ],
  controllers: [InventoryController, WarehouseViewController],
  providers: [InventoryService, WarehouseViewService],
})
export class InventoryModule {}
