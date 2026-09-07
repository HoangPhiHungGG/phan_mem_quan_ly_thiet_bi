import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";
import { Public } from "../auth/auth.decorators";

@ApiTags("health")
@Controller("api/health")
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Kiểm tra tiến trình API" })
  check() {
    return this.healthService.check();
  }

  @Get("ready")
  @ApiOperation({ summary: "Kiểm tra sẵn sàng (bao gồm database)" })
  ready() {
    return this.healthService.ready();
  }
}
