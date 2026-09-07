import { Injectable, Logger } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model, ClientSession } from "mongoose";
import { TransactionTestItem } from "./transaction-test.schema";

@Injectable()
export class TransactionTestService {
  private readonly logger = new Logger(TransactionTestService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(TransactionTestItem.name)
    private readonly itemModel: Model<TransactionTestItem>,
  ) {}

  /**
   * Kiểm tra transaction COMMIT:
   * - Tạo 2 document trong cùng transaction
   * - Commit thành công
   * - Xác minh cả 2 document tồn tại
   * - Dọn dữ liệu thử (chỉ dữ liệu do lần kiểm tra này tạo)
   */
  async testCommit(): Promise<Record<string, unknown>> {
    const runId = `tx-commit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: ClientSession = await this.connection.startSession();

    try {
      session.startTransaction();

      await this.itemModel.create(
        [
          { code: `${runId}-a`, value: 1 },
          { code: `${runId}-b`, value: 2 },
        ],
        { session, ordered: true },
      );

      await session.commitTransaction();

      const count = await this.itemModel.countDocuments({
        code: { $in: [`${runId}-a`, `${runId}-b`] },
      });

      const result = {
        success: true,
        runId,
        committed: count === 2,
        message:
          count === 2
            ? "Transaction COMMIT thành công"
            : "LỖI: dữ liệu không đầy đủ sau commit",
      };

      // Dọn dữ liệu thử
      await this.itemModel.deleteMany({
        code: { $in: [`${runId}-a`, `${runId}-b`] },
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Transaction commit test thất bại: ${(error as Error).message}`,
      );
      if (session.inTransaction()) await session.abortTransaction();
      return {
        success: false,
        runId,
        message: `Transaction COMMIT thất bại: ${(error as Error).message}`,
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Kiểm tra transaction ROLLBACK:
   * - Tạo 2 document trong cùng transaction
   * - Cố tình abort transaction
   * - Xác minh KHÔNG document nào tồn tại
   * - Dọn dữ liệu thử (nếu có sót)
   */
  async testRollback(): Promise<Record<string, unknown>> {
    const runId = `tx-rollback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: ClientSession = await this.connection.startSession();

    try {
      session.startTransaction();

      await this.itemModel.create(
        [
          { code: `${runId}-a`, value: 1 },
          { code: `${runId}-b`, value: 2 },
        ],
        { session, ordered: true },
      );

      // Cố tình abort để kiểm tra rollback
      if (session.inTransaction()) await session.abortTransaction();

      const count = await this.itemModel.countDocuments({
        code: { $in: [`${runId}-a`, `${runId}-b`] },
      });

      const result = {
        success: true,
        runId,
        rolledBack: count === 0,
        message:
          count === 0
            ? "Transaction ROLLBACK thành công"
            : "LỖI: dữ liệu vẫn tồn tại sau rollback",
      };

      // Dọn dữ liệu thử nếu có sót
      await this.itemModel.deleteMany({
        code: { $in: [`${runId}-a`, `${runId}-b`] },
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Transaction rollback test thất bại: ${(error as Error).message}`,
      );
      await session.abortTransaction();
      return {
        success: false,
        runId,
        message: `Transaction ROLLBACK thất bại: ${(error as Error).message}`,
      };
    } finally {
      await session.endSession();
    }
  }
}
