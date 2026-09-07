import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Part, PartSchema } from "../equipment/equipment.schemas";
import { Warehouse, WarehouseSchema } from "../identity/identity.schemas";
import { InventoryController } from "./inventory.controller";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "./inventory.schemas";
import { InventoryService } from "./inventory.service";
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Part.name, schema: PartSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
