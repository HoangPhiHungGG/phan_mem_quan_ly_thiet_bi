import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import { DashboardService } from "./dashboard.service";

@Controller("api/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary(@CurrentUser() actor: CurrentActor) {
    return this.dashboard.summary(actor);
  }

  @Get("inventory-trend")
  inventoryTrend(
    @CurrentUser() actor: CurrentActor,
    @Query("range") range?: string,
  ) {
    return this.dashboard.inventoryTrend(actor, range);
  }
}
