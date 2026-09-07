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
import { OperationController } from "./operation.controller";
import {
  OperationDocument,
  OperationDocumentSchema,
} from "./operation.schemas";
import { OperationService } from "./operation.service";
import {
  IdempotencyKey,
  IdempotencyKeySchema,
} from "../receipts/receipt.schemas";
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: OperationDocument.name, schema: OperationDocumentSchema },
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Keeper.name, schema: KeeperSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [OperationController],
  providers: [OperationService],
})
export class OperationModule {}
