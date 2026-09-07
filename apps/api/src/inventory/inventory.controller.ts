import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import { CreateInventoryTransactionDto } from "./inventory.dto";
import { InventoryService } from "./inventory.service";
@ApiTags("inventory")
@Controller("api/inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get() @RequirePermissions("parts.read") list(
    @Query("warehouseId") warehouseId: string,
  ) {
    return this.inventory.list(warehouseId);
  }
  @Get("part/:partId") @RequirePermissions("parts.read") listPart(
    @Param("partId") partId: string,
  ) {
    return this.inventory.listPart(partId);
  }
  @Get("transactions") @RequirePermissions("parts.read") history(
    @Query()
    query: {
      warehouseId?: string;
      partId?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.inventory.listTransactions(query);
  }
  @Post("transactions") @RequirePermissions("parts.manage") create(
    @Body() input: CreateInventoryTransactionDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    return this.inventory.create(input, actor);
  }
}
