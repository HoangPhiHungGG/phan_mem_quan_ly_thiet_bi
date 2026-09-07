import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { TransactionTestService } from "./transaction-test.service";
import { RequirePermissions } from "../auth/auth.decorators";

@ApiTags("transaction-test")
@Controller("api/transaction-test")
@RequirePermissions("users.manage")
export class TransactionTestController {
  constructor(
    private readonly transactionTestService: TransactionTestService,
  ) {}

  @Get("commit")
  @ApiOperation({ summary: "Kiểm tra transaction COMMIT" })
  async testCommit() {
    return this.transactionTestService.testCommit();
  }

  @Get("rollback")
  @ApiOperation({ summary: "Kiểm tra transaction ROLLBACK" })
  async testRollback() {
    return this.transactionTestService.testRollback();
  }
}
