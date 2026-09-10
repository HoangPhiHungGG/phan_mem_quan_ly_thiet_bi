import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import {
  Keeper,
  KeeperSchema,
  Location,
  LocationSchema,
} from "../catalog/catalog.schemas";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
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
import { InventoryCountController } from "./inventory-count.controller";
import {
  InventoryCountDocument,
  InventoryCountDocumentSchema,
} from "./inventory-count.schemas";
import { InventoryCountService } from "./inventory-count.service";
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: InventoryCountDocument.name,
        schema: InventoryCountDocumentSchema,
      },
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Keeper.name, schema: KeeperSchema },
    ]),
  ],
  controllers: [InventoryCountController],
  providers: [InventoryCountService],
})
export class InventoryCountModule {}
