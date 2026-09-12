import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import {
  Department,
  DepartmentSchema,
  RoleAssignment,
  RoleAssignmentSchema,
  User,
  UserSchema,
  Warehouse,
  WarehouseSchema,
} from "../identity/identity.schemas";
import { OperationDocument } from "../operations/operation.schemas";
import { OperationDocumentSchema } from "../operations/operation.schemas";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
  PartSerial,
  PartSerialSchema,
} from "../equipment/equipment.schemas";
import {
  ComponentType,
  ComponentTypeSchema,
  DeviceType,
  DeviceTypeSchema,
  ItemModel,
  ItemModelSchema,
  Keeper,
  KeeperSchema,
  Location,
  LocationSchema,
  Position,
  PositionSchema,
  Supplier,
  SupplierSchema,
  Unit,
  UnitSchema,
} from "./catalog.schemas";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { DisplayCodeModule } from "../display-codes/display-code.module";

@Module({
  imports: [
    AuthModule,
    DisplayCodeModule,
    MongooseModule.forFeature([
      { name: Keeper.name, schema: KeeperSchema },
      { name: Position.name, schema: PositionSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: DeviceType.name, schema: DeviceTypeSchema },
      { name: ComponentType.name, schema: ComponentTypeSchema },
      { name: Unit.name, schema: UnitSchema },
      { name: ItemModel.name, schema: ItemModelSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Part.name, schema: PartSchema },
      { name: PartSerial.name, schema: PartSerialSchema },
      { name: User.name, schema: UserSchema },
      { name: RoleAssignment.name, schema: RoleAssignmentSchema },
      { name: OperationDocument.name, schema: OperationDocumentSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
