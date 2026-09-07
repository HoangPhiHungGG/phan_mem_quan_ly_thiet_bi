import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  CreateInboundReceiptDto,
  ReverseReceiptDto,
  UpdateInboundReceiptDto,
} from "./receipt.dto";
import { ReceiptService } from "./receipt.service";
@ApiTags("inbound-receipts")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api/inbound-receipts")
export class ReceiptController {
  constructor(private readonly receipts: ReceiptService) {}
  @Get()
  @RequirePermissions("receipts.read")
  @ApiOperation({ summary: "Danh sách phiếu nhập" })
  list(
    @Query()
    query: {
      q?: string;
      status?: string;
      warehouseId?: string;
      source?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.receipts.list(query);
  }
  @Get(":id") @RequirePermissions("receipts.read") get(
    @Param("id") id: string,
  ) {
    return this.receipts.get(id);
  }
  @Post()
  @RequirePermissions("receipts.manage")
  @ApiOperation({
    summary: "Tạo phiếu nhập nháp; dùng Idempotency-Key để chống gửi trùng",
  })
  create(
    @Body() input: CreateInboundReceiptDto,
    @CurrentUser() actor: CurrentActor,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.receipts.create(input, actor, key);
  }
  @Patch(":id")
  @RequirePermissions("receipts.manage")
  @ApiOperation({
    summary: "Sửa phiếu nhập nháp; chỉ phiếu DRAFT được sửa",
  })
  update(
    @Param("id") id: string,
    @Body() input: UpdateInboundReceiptDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.receipts.update(id, input, actor);
  }
  @Patch(":id/submit") @RequirePermissions("receipts.manage") submit(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.receipts.submit(id, actor);
  }
  @Delete(":id")
  @RequirePermissions("receipts.manage")
  @ApiOperation({ summary: "Xóa phiếu nhập nháp; không xóa phiếu đã hoàn tất" })
  removeDraft(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.receipts.removeDraft(id, actor);
  }
  @Patch(":id/approve") @RequirePermissions("receipts.manage") approve(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.receipts.approve(id, actor);
  }
  @Patch(":id/complete")
  @RequirePermissions("receipts.manage")
  @ApiOperation({
    summary:
      "Hoàn tất: tạo thiết bị, serial, giao dịch và số dư trong một transaction",
  })
  complete(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.receipts.complete(id, actor);
  }
  @Patch(":id/reverse")
  @RequirePermissions("receipts.manage")
  @ApiOperation({
    summary:
      "Đảo phiếu đã hoàn tất: tạo transaction đảo, trả thiết bị về chưa nhập kho, về REVERSED",
  })
  reverse(
    @Param("id") id: string,
    @Body() input: ReverseReceiptDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.receipts.reverse(id, input, actor);
  }
}
