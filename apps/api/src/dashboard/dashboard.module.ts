import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import {
  DeviceType,
  DeviceTypeSchema,
  Keeper,
  KeeperSchema,
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
  User,
  UserSchema,
} from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";
import {
  InventoryCountDocument,
  InventoryCountDocumentSchema,
} from "../inventory-counts/inventory-count.schemas";
import {
  LiquidationDocument,
  LiquidationDocumentSchema,
} from "../liquidations/liquidation.schemas";
import {
  OperationDocument,
  OperationDocumentSchema,
} from "../operations/operation.schemas";
import {
  PurchaseRequest,
  PurchaseRequestSchema,
} from "../purchases/purchase.schemas";
import {
  InboundReceipt,
  InboundReceiptSchema,
} from "../receipts/receipt.schemas";
import {
  RepairDocument,
  RepairDocumentSchema,
} from "../repairs/repairs.schemas";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: DeviceType.name, schema: DeviceTypeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Keeper.name, schema: KeeperSchema },
      { name: User.name, schema: UserSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: OperationDocument.name, schema: OperationDocumentSchema },
      { name: RepairDocument.name, schema: RepairDocumentSchema },
      { name: InboundReceipt.name, schema: InboundReceiptSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: LiquidationDocument.name, schema: LiquidationDocumentSchema },
      {
        name: InventoryCountDocument.name,
        schema: InventoryCountDocumentSchema,
      },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
