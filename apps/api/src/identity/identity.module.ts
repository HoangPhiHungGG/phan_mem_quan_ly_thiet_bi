import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { IdentityController } from "./identity.controller";
import {
  BootstrapLock,
  BootstrapLockSchema,
  Department,
  DepartmentSchema,
  Role,
  RoleAssignment,
  RoleAssignmentSchema,
  RoleSchema,
  User,
  UserSchema,
  Warehouse,
  WarehouseSchema,
} from "./identity.schemas";
import { IdentityService } from "./identity.service";
import {
  Keeper,
  KeeperSchema,
  Position,
  PositionSchema,
} from "../catalog/catalog.schemas";
import { DisplayCodeModule } from "../display-codes/display-code.module";

@Module({
  imports: [
    AuthModule,
    DisplayCodeModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: RoleAssignment.name, schema: RoleAssignmentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: BootstrapLock.name, schema: BootstrapLockSchema },
      { name: Keeper.name, schema: KeeperSchema },
      { name: Position.name, schema: PositionSchema },
    ]),
  ],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
