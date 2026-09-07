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
  CATALOG_TYPES,
  CreateCatalogDto,
  UpdateCatalogDto,
  UpdateCatalogStatusDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api/catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(":type")
  @RequirePermissions("catalog.read")
  @ApiOperation({ summary: "Danh sách phần tử của một danh mục (phân trang)" })
  list(
    @Param("type") type: string,
    @Query()
    query: {
      q?: string;
      isActive?: string;
      deviceTypeId?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.catalog.list(type, query);
  }

  @Get(":type/:id")
  @RequirePermissions("catalog.read")
  @ApiOperation({ summary: "Chi tiết một phần tử danh mục" })
  get(@Param("type") type: string, @Param("id") id: string) {
    return this.catalog.get(type, id);
  }

  @Post(":type")
  @RequirePermissions("catalog.manage")
  @ApiOperation({ summary: "Tạo phần tử danh mục" })
  create(
    @Param("type") type: string,
    @Body() input: CreateCatalogDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.catalog.create(type, input, actor);
  }

  @Patch(":type/:id")
  @RequirePermissions("catalog.manage")
  @ApiOperation({ summary: "Cập nhật phần tử danh mục" })
  update(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() input: UpdateCatalogDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.catalog.update(type, id, input, actor);
  }

  @Patch(":type/:id/status")
  @RequirePermissions("catalog.manage")
  @ApiOperation({
    summary: "Ngừng sử dụng / kích hoạt lại phần tử danh mục",
  })
  setStatus(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() input: UpdateCatalogStatusDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.catalog.setStatus(type, id, input.isActive, actor);
  }

  @Delete(":type/:id")
  @RequirePermissions("catalog.manage")
  @ApiOperation({
    summary: "Xóa phần tử danh mục",
    description:
      "Chỉ xóa được khi chưa được chứng từ nào sử dụng; ngược lại trả 409 CATALOG_IN_USE.",
  })
  remove(
    @Param("type") type: string,
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.catalog.remove(type, id, actor);
  }
}

export { CATALOG_TYPES };
