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
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import {
  CreatePurchaseDto,
  ReasonDto,
  UpdatePurchaseDto,
} from "./purchase.dto";
import { PurchaseService } from "./purchase.service";
@ApiTags("purchase-requests")
@Controller("api/purchase-requests")
export class PurchaseController {
  constructor(private readonly service: PurchaseService) {}
  @Get() @RequirePermissions("purchases.read") list(
    @Query() q: Record<string, string | undefined>,
  ) {
    return this.service.list(q);
  }
  @Get(":id") @RequirePermissions("purchases.read") get(
    @Param("id") id: string,
  ) {
    return this.service.get(id);
  }
  @Post() @RequirePermissions("purchases.manage") create(
    @Body() i: CreatePurchaseDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.create(i, a);
  }
  @Patch(":id") @RequirePermissions("purchases.manage") update(
    @Param("id") id: string,
    @Body() i: UpdatePurchaseDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.update(id, i, a);
  }
  @Delete(":id") @RequirePermissions("purchases.manage") remove(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.remove(id, a);
  }
  @Post(":id/submit") @RequirePermissions("purchases.manage") submit(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.submit(id, a);
  }
  @Post(":id/approve") @RequirePermissions("purchases.manage") approve(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.approve(id, a);
  }
  @Post(":id/reject") @RequirePermissions("purchases.manage") reject(
    @Param("id") id: string,
    @Body() b: ReasonDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.reject(id, a, b.reason);
  }
  @Post(":id/order") @RequirePermissions("purchases.manage") order(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.order(id, a);
  }
  @Post(":id/cancel") @RequirePermissions("purchases.manage") cancel(
    @Param("id") id: string,
    @Body() b: ReasonDto,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.cancel(id, a, b.reason);
  }
  @Post(":id/complete") @RequirePermissions("purchases.manage") complete(
    @Param("id") id: string,
    @CurrentUser() a: CurrentActor,
  ) {
    return this.service.complete(id, a);
  }
}
