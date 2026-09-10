import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import {
  ItemModel,
  ItemModelSchema,
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
import { RepairsController } from "./repairs.controller";
import { RepairDocument, RepairDocumentSchema } from "./repairs.schemas";
import { RepairsService } from "./repairs.service";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: RepairDocument.name, schema: RepairDocumentSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: PartSerial.name, schema: PartSerialSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Keeper.name, schema: KeeperSchema },
      { name: ItemModel.name, schema: ItemModelSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [RepairsController],
  providers: [RepairsService],
})
export class RepairsModule {}
