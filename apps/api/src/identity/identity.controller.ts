import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import { SESSION_COOKIE } from "../auth/auth.constants";
import type { CurrentActor } from "../auth/auth.types";
import {
  AssignRoleDto,
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  CreateWarehouseDto,
  UpdateUserStatusDto,
} from "./identity.dto";
import { IdentityService } from "./identity.service";

@ApiTags("identity")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api")
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get("users")
  @RequirePermissions("users.read")
  @ApiOperation({ summary: "Danh sách tài khoản" })
  listUsers() {
    return this.identity.listUsers();
  }

  @Post("users")
  @RequirePermissions("users.manage")
  @ApiOperation({ summary: "Tạo tài khoản" })
  createUser(@Body() input: CreateUserDto, @CurrentUser() actor: CurrentActor) {
    return this.identity.createUser(input, actor);
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
  @RequirePermissions("users.manage")
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
  @RequirePermissions("roles.read")
  @ApiOperation({ summary: "Danh sách vai trò" })
  listRoles() {
    return this.identity.listRoles();
  }

  @Post("roles")
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Tạo vai trò" })
  createRole(@Body() input: CreateRoleDto, @CurrentUser() actor: CurrentActor) {
    return this.identity.createRole(input, actor);
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
