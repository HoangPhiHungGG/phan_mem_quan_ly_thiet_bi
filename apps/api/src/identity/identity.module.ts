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

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: RoleAssignment.name, schema: RoleAssignmentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: BootstrapLock.name, schema: BootstrapLockSchema },
    ]),
  ],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
