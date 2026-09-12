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
  CreateDeviceDto,
  CreatePartDto,
  UpdateDeviceAttachmentsDto,
  UpdateDeviceDto,
  UpdatePartDto,
  UpdatePartStatusDto,
} from "./equipment.dto";
import { EquipmentService } from "./equipment.service";
import {
  CommitEquipmentImportDto,
  PreviewEquipmentImportDto,
} from "./equipment-import.dto";
import { EquipmentImportService } from "./equipment-import.service";

@ApiTags("equipment")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api")
export class EquipmentController {
  constructor(
    private readonly equipment: EquipmentService,
    private readonly imports: EquipmentImportService,
  ) {}

  @Post("devices/import/preview")
  @RequirePermissions("devices.import")
  @ApiOperation({ summary: "Kiểm tra trước dữ liệu import thiết bị" })
  previewDevices(
    @Body() input: PreviewEquipmentImportDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.imports.preview("DEVICE", input, actor);
  }

  @Post("devices/import/commit")
  @RequirePermissions("devices.import")
  @ApiOperation({ summary: "Xác nhận import thiết bị đã preview" })
  commitDevices(
    @Body() input: CommitEquipmentImportDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.imports.commit("DEVICE", input, actor);
  }

  @Post("parts/import/preview")
  @RequirePermissions("components.import")
  @ApiOperation({ summary: "Kiểm tra trước dữ liệu import linh kiện" })
  previewParts(
    @Body() input: PreviewEquipmentImportDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.imports.preview("PART", input, actor);
  }

  @Post("parts/import/commit")
  @RequirePermissions("components.import")
  @ApiOperation({ summary: "Xác nhận import linh kiện đã preview" })
  commitParts(
    @Body() input: CommitEquipmentImportDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.imports.commit("PART", input, actor);
  }

  @Get("devices")
  @RequirePermissions("devices.read")
  @ApiOperation({ summary: "Danh sách thiết bị (tìm kiếm, lọc, phân trang)" })
  listDevices(
    @Query()
    query: {
      q?: string;
      deviceTypeId?: string;
      modelId?: string;
      available?: string;
      usageStatus?: string;
      techCondition?: string;
      departmentId?: string;
      keeperId?: string;
      warehouseId?: string;
      locationId?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.equipment.listDevices(query);
  }

  @Get("devices/:id")
  @RequirePermissions("devices.read")
  @ApiOperation({ summary: "Chi tiết hồ sơ thiết bị" })
  getDevice(@Param("id") id: string) {
    return this.equipment.getDevice(id);
  }

  @Post("devices")
  @RequirePermissions("devices.manage")
  @ApiOperation({
    summary: "Tạo hồ sơ thiết bị",
    description:
      "Tồn kho/người giữ/trạng thái không sửa trực tiếp sau khi tạo; chỉ qua nghiệp vụ.",
  })
  createDevice(
    @Body() input: CreateDeviceDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.equipment.createDevice(input, actor);
  }

  @Patch("devices/:id")
  @RequirePermissions("devices.manage")
  @ApiOperation({
    summary: "Cập nhật hồ sơ thiết bị",
    description:
      "Không cho sửa người giữ, bộ phận, kho/vị trí, trạng thái sử dụng trực tiếp.",
  })
  updateDevice(
    @Param("id") id: string,
    @Body() input: UpdateDeviceDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.equipment.updateDevice(id, input, actor);
  }

  @Delete("devices/:id")
  @RequirePermissions("devices.manage")
  @ApiOperation({ summary: "Ngừng sử dụng thiết bị (soft delete)" })
  removeDevice(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.equipment.removeDevice(id, actor);
  }

  @Patch("devices/:id/attachments")
  @RequirePermissions("devices.manage")
  @ApiOperation({ summary: "Cập nhật tệp đính kèm hồ sơ thiết bị" })
  updateAttachments(
    @Param("id") id: string,
    @Body() input: UpdateDeviceAttachmentsDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.equipment.updateDeviceAttachments(id, input, actor);
  }

  @Get("parts")
  @RequirePermissions("parts.read")
  @ApiOperation({ summary: "Danh sách linh kiện (tìm kiếm, lọc, phân trang)" })
  listParts(
    @Query()
    query: {
      q?: string;
      trackingMode?: string;
      componentTypeId?: string;
      modelId?: string;
      isActive?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.equipment.listParts(query);
  }

  @Get("parts/:id")
  @RequirePermissions("parts.read")
  @ApiOperation({ summary: "Chi tiết linh kiện" })
  getPart(@Param("id") id: string) {
    return this.equipment.getPart(id);
  }

  @Post("parts")
  @RequirePermissions("parts.manage")
  @ApiOperation({
    summary: "Tạo hồ sơ linh kiện",
    description:
      "Tồn kho khởi đầu bằng 0; tăng tồn ban đầu qua nghiệp vụ nhập số dư đầu kỳ.",
  })
  createPart(@Body() input: CreatePartDto, @CurrentUser() actor: CurrentActor) {
    return this.equipment.createPart(input, actor);
  }

  @Patch("parts/:id")
  @RequirePermissions("parts.manage")
  @ApiOperation({
    summary: "Cập nhật linh kiện",
    description: "Không cho sửa mã, kiểu quản lý và tồn kho trực tiếp.",
  })
  updatePart(
    @Param("id") id: string,
    @Body() input: UpdatePartDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.equipment.updatePart(id, input, actor);
  }

  @Patch("parts/:id/status")
  @RequirePermissions("parts.manage")
  @ApiOperation({ summary: "Ngừng sử dụng / kích hoạt lại linh kiện" })
  updatePartStatus(
    @Param("id") id: string,
    @Body() input: UpdatePartStatusDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.equipment.updatePartStatus(id, input.isActive, actor);
  }

  @Delete("parts/:id")
  @RequirePermissions("parts.manage")
  @ApiOperation({ summary: "Xóa linh kiện chưa có tồn kho hoặc lịch sử" })
  removePart(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.equipment.removePart(id, actor);
  }

  @Get("parts/:id/serials")
  @RequirePermissions("parts.read")
  @ApiOperation({
    summary: "Danh sách từng chiếc linh kiện có serial",
    description: "Serial chỉ được tạo qua nghiệp vụ nhập kho ở bước sau.",
  })
  listPartSerials(
    @Param("id") id: string,
    @Query() query: { status?: string; page?: string; limit?: string },
  ) {
    return this.equipment.listPartSerials(id, query);
  }
}
