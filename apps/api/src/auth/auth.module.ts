import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Role,
  RoleAssignment,
  RoleAssignmentSchema,
  RoleSchema,
  User,
  UserSchema,
} from "../identity/identity.schemas";
import { AuditService } from "./audit.service";
import { AuthController } from "./auth.controller";
import { PermissionsGuard, SessionAuthGuard } from "./auth.guards";
import {
  AuditLog,
  AuditLogSchema,
  AuthSession,
  AuthSessionSchema,
} from "./auth.schemas";
import { AuthService } from "./auth.service";
import { LoginRateLimiter } from "./login-rate-limiter.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: RoleAssignment.name, schema: RoleAssignmentSchema },
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuditService,
    LoginRateLimiter,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, AuditService, MongooseModule],
})
export class AuthModule {}
