import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import {
  Department,
  DepartmentSchema,
  Warehouse,
  WarehouseSchema,
} from "../identity/identity.schemas";
import {
  DeviceType,
  DeviceTypeSchema,
  ItemModel,
  ItemModelSchema,
  Keeper,
  KeeperSchema,
  Location,
  LocationSchema,
  Supplier,
  SupplierSchema,
  Unit,
  UnitSchema,
} from "../catalog/catalog.schemas";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
  PartSerial,
  PartSerialSchema,
} from "./equipment.schemas";
import { EquipmentController } from "./equipment.controller";
import { EquipmentService } from "./equipment.service";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: PartSerial.name, schema: PartSerialSchema },
      { name: ItemModel.name, schema: ItemModelSchema },
      { name: DeviceType.name, schema: DeviceTypeSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Unit.name, schema: UnitSchema },
      { name: Keeper.name, schema: KeeperSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
    ]),
  ],
  controllers: [EquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class EquipmentModule {}
