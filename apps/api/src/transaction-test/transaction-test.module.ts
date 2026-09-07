import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TransactionTestController } from "./transaction-test.controller";
import { TransactionTestService } from "./transaction-test.service";
import {
  TransactionTestItem,
  TransactionTestItemSchema,
} from "./transaction-test.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TransactionTestItem.name, schema: TransactionTestItemSchema },
    ]),
  ],
  controllers: [TransactionTestController],
  providers: [TransactionTestService],
})
export class TransactionTestModule {}
