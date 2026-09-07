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
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SESSION_COOKIE } from "../auth/auth.constants";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import {
  CreateOperationDto,
  ReceiveOperationDto,
  RejectOperationDto,
  UpdateOperationDto,
} from "./operation.dto";
import { OperationService } from "./operation.service";
@ApiTags("operations")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api/operations")
export class OperationController {
  constructor(private readonly service: OperationService) {}
  @Get() @RequirePermissions("operations.read") list(
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.list(query);
  }
  @Get("mine") my(@CurrentUser() actor: CurrentActor) {
    return this.service.mine(actor);
  }
  @Get("overdue") @RequirePermissions("operations.read") overdue() {
    return this.service.overdue();
  }
  @Get(":id") @RequirePermissions("operations.read") get(
    @Param("id") id: string,
  ) {
    return this.service.get(id);
  }
  @Post() @RequirePermissions("operations.manage") create(
    @Body() input: CreateOperationDto,
    @CurrentUser() actor: CurrentActor,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.create(input, actor, key);
  }
  @Patch(":id/complete") @RequirePermissions("operations.manage") complete(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.complete(id, actor);
  }
  @Patch(":id") @RequirePermissions("operations.manage") update(
    @Param("id") id: string,
    @Body() input: UpdateOperationDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.updateDraft(id, input, actor);
  }
  @Delete(":id") @RequirePermissions("operations.manage") remove(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.removeDraft(id, actor);
  }
  @Patch(":id/receive") @RequirePermissions("operations.manage") receive(
    @Param("id") id: string,
    @Body() input: ReceiveOperationDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.receive(id, input, actor);
  }
  @Patch(":id/reject") @RequirePermissions("operations.manage") reject(
    @Param("id") id: string,
    @Body() input: RejectOperationDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.reject(id, input.reason, actor);
  }
}
