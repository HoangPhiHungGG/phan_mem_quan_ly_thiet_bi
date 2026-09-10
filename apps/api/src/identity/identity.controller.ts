import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import { SESSION_COOKIE } from "../auth/auth.constants";
import type { CurrentActor } from "../auth/auth.types";
import {
  AssignRoleDto,
  AssignUserRoleDto,
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  CreateWarehouseDto,
  ListQueryDto,
  ResetPasswordDto,
  UpdateRoleDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from "./identity.dto";
import { IdentityService } from "./identity.service";

@ApiTags("identity")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api")
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get("users")
  @RequirePermissions("users.view")
  @ApiOperation({ summary: "Danh sách tài khoản" })
  listUsers(@Query() query: ListQueryDto) {
    return this.identity.listUsers(query);
  }

  @Post("users")
  @RequirePermissions("users.create", "users.assign_role")
  @ApiOperation({ summary: "Tạo tài khoản" })
  createUser(@Body() input: CreateUserDto, @CurrentUser() actor: CurrentActor) {
    return this.identity.createUser(input, actor);
  }

  @Get("users/eligible-employees")
  @RequirePermissions("users.create", "users.assign_role")
  @ApiOperation({ summary: "Nhân viên chưa có tài khoản" })
  eligibleEmployees(@Query("q") q?: string) {
    return this.identity.eligibleEmployees(q);
  }

  @Patch("users/:id")
  @RequirePermissions("users.update")
  @ApiOperation({ summary: "Cập nhật thông tin đăng nhập của tài khoản" })
  updateUser(
    @Param("id") id: string,
    @Body() input: UpdateUserDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.updateUser(id, input, actor);
  }

  @Post("users/:id/assign-role")
  @RequirePermissions("users.assign_role")
  @ApiOperation({ summary: "Thay vai trò hiện tại của tài khoản" })
  assignUserRole(
    @Param("id") id: string,
    @Body() input: AssignUserRoleDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.assignUserRole(id, input.roleId, actor);
  }

  @Post("users/:id/lock")
  @RequirePermissions("users.lock")
  lock(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.identity.updateStatus(id, "LOCKED", actor);
  }

  @Post("users/:id/unlock")
  @RequirePermissions("users.lock")
  unlock(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.identity.updateStatus(id, "ACTIVE", actor, "LOCKED");
  }

  @Post("users/:id/deactivate")
  @RequirePermissions("users.activate")
  deactivate(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.identity.updateStatus(id, "INACTIVE", actor);
  }

  @Post("users/:id/activate")
  @RequirePermissions("users.activate")
  activate(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.identity.updateStatus(
      id,
      "ACTIVE",
      actor,
      "INACTIVE_OR_DISABLED",
    );
  }

  @Delete("users/:id")
  @RequirePermissions("users.delete")
  @ApiOperation({ summary: "Xóa tài khoản chưa phát sinh lịch sử" })
  deleteUser(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.identity.deleteUser(id, actor);
  }

  @Post("users/:id/reset-password")
  @RequirePermissions("users.reset_password")
  @ApiOperation({ summary: "Đặt lại mật khẩu và thu hồi các phiên đăng nhập" })
  resetPassword(
    @Param("id") id: string,
    @Body() input: ResetPasswordDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.resetPassword(id, input, actor);
  }

  @Get("users/:id")
  @ApiOperation({
    summary: "Chi tiết một tài khoản",
    description:
      "Object-level access: chỉ trả về khi là chính mình hoặc có quyền users.read.",
  })
  getUser(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.identity.getUser(id, actor);
  }

  @Patch("users/:id/status")
  @RequirePermissions("users.lock")
  @ApiOperation({
    summary: "Khóa/mở tài khoản",
    description: "Khóa/vô hiệu hóa sẽ thu hồi mọi phiên của tài khoản.",
  })
  updateStatus(
    @Param("id") id: string,
    @Body() input: UpdateUserStatusDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.updateStatus(id, input.status, actor);
  }

  @Get("roles")
  @RequirePermissions("roles.view")
  @ApiOperation({ summary: "Danh sách vai trò" })
  listRoles() {
    return this.identity.listRoles();
  }

  @Get("permissions")
  @RequirePermissions("roles.view")
  @ApiOperation({ summary: "Danh mục quyền theo module" })
  permissions() {
    return this.identity.permissions();
  }

  @Post("roles")
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Tạo vai trò" })
  createRole(@Body() input: CreateRoleDto, @CurrentUser() actor: CurrentActor) {
    return this.identity.createRole(input, actor);
  }

  @Patch("roles/:id")
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Cập nhật vai trò và ma trận quyền" })
  updateRole(
    @Param("id") id: string,
    @Body() input: UpdateRoleDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.updateRole(id, input, actor);
  }

  @Get("admin-audit-logs")
  @RequirePermissions("audit.view")
  @ApiOperation({ summary: "Nhật ký thao tác quản trị" })
  listAudit(@Query() query: ListQueryDto) {
    return this.identity.listAudit(query);
  }

  @Post("users/:id/role-assignments")
  @RequirePermissions("roles.assign")
  @ApiOperation({
    summary: "Gán vai trò và phạm vi bộ phận/kho",
    description: "Thay đổi quyền sẽ thu hồi mọi phiên của tài khoản.",
  })
  assignRole(
    @Param("id") id: string,
    @Body() input: AssignRoleDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.assignRole(id, input, actor);
  }

  @Delete("role-assignments/:id")
  @RequirePermissions("roles.assign")
  @ApiOperation({ summary: "Thu hồi phân quyền" })
  revokeAssignment(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.identity.revokeAssignment(id, actor);
  }

  @Get("departments")
  @RequirePermissions("departments.read")
  @ApiOperation({ summary: "Danh sách bộ phận" })
  listDepartments() {
    return this.identity.listDepartments();
  }

  @Post("departments")
  @RequirePermissions("departments.manage")
  @ApiOperation({ summary: "Tạo bộ phận" })
  createDepartment(@Body() input: CreateDepartmentDto) {
    return this.identity.createDepartment(input);
  }

  @Get("warehouses")
  @RequirePermissions("warehouses.read")
  @ApiOperation({ summary: "Danh sách kho" })
  listWarehouses() {
    return this.identity.listWarehouses();
  }

  @Post("warehouses")
  @RequirePermissions("warehouses.manage")
  @ApiOperation({ summary: "Tạo kho" })
  createWarehouse(@Body() input: CreateWarehouseDto) {
    return this.identity.createWarehouse(input);
  }
}
