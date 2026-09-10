import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SESSION_COOKIE } from "../auth/auth.constants";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import {
  CompleteLiquidationDto,
  CreateLiquidationDto,
  DecisionDto,
  UpdateLiquidationDto,
} from "./liquidation.dto";
import { LiquidationService } from "./liquidation.service";

@ApiTags("liquidations")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api/liquidations")
export class LiquidationController {
  constructor(private readonly service: LiquidationService) {}
  @Get() @RequirePermissions("liquidation.view") list(
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.list(query);
  }
  @Get("eligible-assets") @RequirePermissions("liquidation.view") eligible(
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.service.eligible(warehouseId);
  }
  @Get("device/:deviceId/history")
  @RequirePermissions("liquidation.view")
  history(@Param("deviceId") id: string) {
    return this.service.deviceHistory(id);
  }
  @Get(":id") @RequirePermissions("liquidation.view") get(
    @Param("id") id: string,
  ) {
    return this.service.get(id);
  }
  @Post() @RequirePermissions("liquidation.create") create(
    @Body() input: CreateLiquidationDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.create(input, actor);
  }
  @Patch(":id") @RequirePermissions("liquidation.edit") update(
    @Param("id") id: string,
    @Body() input: UpdateLiquidationDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.update(id, input, actor);
  }
  @Patch(":id/submit") @RequirePermissions("liquidation.submit") submit(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.submit(id, actor);
  }
  @Patch(":id/approve") @RequirePermissions("liquidation.approve") approve(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.approve(id, actor);
  }
  @Patch(":id/reject") @RequirePermissions("liquidation.approve") reject(
    @Param("id") id: string,
    @Body() input: DecisionDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.reject(id, input.reason, actor);
  }
  @Patch(":id/complete") @RequirePermissions("liquidation.complete") complete(
    @Param("id") id: string,
    @Body() input: CompleteLiquidationDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.complete(id, input, actor);
  }
  @Patch(":id/cancel") @RequirePermissions("liquidation.cancel") cancel(
    @Param("id") id: string,
    @Body() input: DecisionDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.cancel(id, input.reason, actor);
  }
}
