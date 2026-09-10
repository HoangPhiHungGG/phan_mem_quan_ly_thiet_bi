import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
} from "../equipment/equipment.schemas";
import {
  InventoryBalance,
  InventoryBalanceSchema,
} from "../inventory/inventory.schemas";
import {
  OperationDocument,
  OperationDocumentSchema,
} from "../operations/operation.schemas";
import {
  InboundReceipt,
  InboundReceiptSchema,
} from "../receipts/receipt.schemas";
import {
  RepairDocument,
  RepairDocumentSchema,
} from "../repairs/repairs.schemas";
import {
  InventoryCountDocument,
  InventoryCountDocumentSchema,
} from "../inventory-counts/inventory-count.schemas";
import {
  LiquidationDocument,
  LiquidationDocumentSchema,
} from "../liquidations/liquidation.schemas";
import { Keeper, KeeperSchema } from "../catalog/catalog.schemas";
import {
  Department,
  DepartmentSchema,
  Warehouse,
  WarehouseSchema,
} from "../identity/identity.schemas";
import { ReportController } from "./report.controller";
import { ReportService } from "./report.service";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: OperationDocument.name, schema: OperationDocumentSchema },
      { name: InboundReceipt.name, schema: InboundReceiptSchema },
      { name: RepairDocument.name, schema: RepairDocumentSchema },
      {
        name: InventoryCountDocument.name,
        schema: InventoryCountDocumentSchema,
      },
      { name: LiquidationDocument.name, schema: LiquidationDocumentSchema },
      { name: Keeper.name, schema: KeeperSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
