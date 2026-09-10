import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import {
  CancelCountDto,
  CheckDeviceDto,
  CheckPartDto,
  CreateCountDto,
  RecordUnexpectedDto,
  ResolveDiscrepancyDto,
  UpdateCountDto,
} from "./inventory-count.dto";
import { InventoryCountService } from "./inventory-count.service";
@Controller("api/inventory-counts")
export class InventoryCountController {
  constructor(private service: InventoryCountService) {}
  @Get() @RequirePermissions("inventory.view") list(
    @Query() q: Record<string, string | undefined>,
  ) {
    return this.service.list(q);
  }
  @Get(":id") @RequirePermissions("inventory.view") get(
    @Param("id") id: string,
  ) {
    return this.service.get(id);
  }
  @Post() @RequirePermissions("inventory.create") create(
    @Body() x: CreateCountDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.create(x, a);
  }
  @Patch(":id") @RequirePermissions("inventory.edit") update(
    @Param("id") id: string,
    @Body() x: UpdateCountDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.update(id, x, a);
  }
  @Patch(":id/start") @RequirePermissions("inventory.perform") start(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.start(id, a);
  }
  @Patch(":id/devices/:itemId") @RequirePermissions("inventory.perform") device(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() x: CheckDeviceDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.checkDevice(id, itemId, x, a);
  }
  @Patch(":id/parts/:itemId") @RequirePermissions("inventory.perform") part(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() x: CheckPartDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.checkPart(id, itemId, x, a);
  }
  @Post(":id/unexpected")
  @RequirePermissions("inventory.perform")
  unexpected(
    @Param("id") id: string,
    @Body() input: RecordUnexpectedDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.service.recordUnexpected(id, input, actor);
  }
  @Patch(":id/reconcile") @RequirePermissions("inventory.reconcile") reconcile(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.reconcile(id, a);
  }
  @Patch(":id/discrepancies/:key")
  @RequirePermissions("inventory.reconcile")
  resolve(
    @Param("id") id: string,
    @Param("key") key: string,
    @Body() x: ResolveDiscrepancyDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.resolve(id, key, x, a);
  }
  @Patch(":id/complete") @RequirePermissions("inventory.complete") complete(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.complete(id, a);
  }
  @Patch(":id/cancel") @RequirePermissions("inventory.cancel") cancel(
    @Param("id") id: string,
    @Body() x: CancelCountDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.cancel(id, x, a);
  }
}
