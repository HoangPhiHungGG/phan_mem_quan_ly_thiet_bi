import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/auth.decorators";
import { WarehouseViewService } from "./warehouse-view.service";

@ApiTags("inventory")
@Controller("api/inventory/warehouses")
export class WarehouseViewController {
  constructor(private readonly view: WarehouseViewService) {}
  @Get(":id")
  @RequirePermissions("warehouses.read", "devices.read", "parts.read")
  summary(@Param("id") id: string) {
    return this.view.summary(id);
  }
  @Get(":id/devices") @RequirePermissions("devices.read") devices(
    @Param("id") id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.view.listDevices(id, query);
  }
  @Get(":id/parts") @RequirePermissions("parts.read") parts(
    @Param("id") id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.view.listParts(id, query);
  }
  @Get(":id/history")
  @RequirePermissions(
    "parts.read",
    "devices.read",
    "operations.read",
    "receipts.read",
  )
  history(
    @Param("id") id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.view.history(id, query);
  }
}
