import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import {
  DeviceType,
  DeviceTypeSchema,
  ItemModel,
  ItemModelSchema,
  Supplier,
  SupplierSchema,
  Unit,
  UnitSchema,
} from "../catalog/catalog.schemas";
import { Part, PartSchema } from "../equipment/equipment.schemas";
import {
  Department,
  DepartmentSchema,
  User,
  UserSchema,
} from "../identity/identity.schemas";
import { PurchaseController } from "./purchase.controller";
import { PurchaseRequest, PurchaseRequestSchema } from "./purchase.schemas";
import { PurchaseService } from "./purchase.service";
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Part.name, schema: PartSchema },
      { name: DeviceType.name, schema: DeviceTypeSchema },
      { name: ItemModel.name, schema: ItemModelSchema },
      { name: Unit.name, schema: UnitSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService],
})
export class PurchaseModule {}
