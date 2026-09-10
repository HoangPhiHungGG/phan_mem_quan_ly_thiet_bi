import { Controller, Get, Param, Query } from "@nestjs/common";
import { CurrentUser, RequirePermissions } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import { ReportQueryDto, REPORT_TYPES, type ReportType } from "./report.dto";
import { ReportService } from "./report.service";

@Controller("api/reports")
@RequirePermissions("reports.read")
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get(":type")
  get(
    @Param("type") rawType: string,
    @Query() query: ReportQueryDto,
    @CurrentUser() actor: CurrentActor,
  ) {
    const type = REPORT_TYPES.includes(rawType as ReportType)
      ? (rawType as ReportType)
      : undefined;
    return this.reports.get(type, query, actor);
  }
}
