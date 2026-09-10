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
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SESSION_COOKIE } from "../auth/auth.constants";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import {
  CancelRepairDto,
  CompleteRepairDto,
  CreateRepairDto,
  ReceiveRepairDto,
  StartRepairDto,
  UnrepairableRepairDto,
  UpdateRepairDto,
  UpdateRepairProgressDto,
} from "./repairs.dto";
import { RepairsService } from "./repairs.service";

@ApiTags("repairs")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("api/repairs")
export class RepairsController {
  constructor(private readonly service: RepairsService) {}

  @Get()
  @RequirePermissions("repair.view")
  list(@Query() query: Record<string, string | undefined>) {
    return this.service.list(query);
  }

  @Get("eligible-devices")
  @RequirePermissions("repair.view")
  eligibleDevices() {
    return this.service.eligibleDevices();
  }

  @Get("eligible-part-serials")
  @RequirePermissions("repair.view")
  eligiblePartSerials() {
    return this.service.eligiblePartSerials();
  }

  @Get("device/:deviceId/history")
  @RequirePermissions("repair.view")
  deviceHistory(@Param("deviceId") deviceId: string) {
    return this.service.deviceHistory(deviceId);
  }

  @Get(":id")
  @RequirePermissions("repair.view")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions("repair.create")
  create(@Body() input: CreateRepairDto, @CurrentUser() actor: CurrentActor) {
    return this.service.create(input, actor);
  }

  @Patch(":id")
  @RequirePermissions("repair.edit")
  update(
    @Param("id") id: string,
    @Body() input: UpdateRepairDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.update(id, input, actor);
  }

  @Delete(":id")
  @RequirePermissions("repair.cancel")
  remove(@Param("id") id: string, @CurrentUser() actor: CurrentActor) {
    return this.service.removeDraft(id, actor);
  }

  @Patch(":id/receive")
  @RequirePermissions("repair.receive")
  receive(
    @Param("id") id: string,
    @Body() input: ReceiveRepairDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.receive(id, actor, input);
  }

  @Patch(":id/start")
  @RequirePermissions("repair.edit")
  start(
    @Param("id") id: string,
    @Body() input: StartRepairDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.start(id, actor, input);
  }

  @Patch(":id/progress")
  @RequirePermissions("repair.edit")
  progress(
    @Param("id") id: string,
    @Body() input: UpdateRepairProgressDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.updateProgress(id, input, actor);
  }

  @Patch(":id/complete")
  @RequirePermissions("repair.complete")
  complete(
    @Param("id") id: string,
    @Body() input: CompleteRepairDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.complete(id, input, actor);
  }

  @Patch(":id/unrepairable")
  @RequirePermissions("repair.complete")
  unrepairable(
    @Param("id") id: string,
    @Body() input: UnrepairableRepairDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.markUnrepairable(id, input, actor);
  }

  @Patch(":id/cancel")
  @RequirePermissions("repair.cancel")
  cancel(
    @Param("id") id: string,
    @Body() input: CancelRepairDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.cancel(id, input, actor);
  }
}
