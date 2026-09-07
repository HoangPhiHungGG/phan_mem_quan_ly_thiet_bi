import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { CurrentActor } from "../auth/auth.types";
import { Part } from "../equipment/equipment.schemas";
import { Warehouse } from "../identity/identity.schemas";
import { InventoryBalance, InventoryTransaction } from "./inventory.schemas";
import type { CreateInventoryTransactionDto } from "./inventory.dto";
@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
  ) {}
  async list(warehouseId: string) {
    return {
      data: await this.balances
        // Một số dư bằng 0 vẫn được giữ lại khi đã có giao dịch, để người dùng
        // thấy "hết hàng" thay vì mất dấu hàng đã từng thuộc kho.
        .find({ warehouseId, quantity: { $gte: 0 } })
        .populate(
          "partId",
          "code name trackingMode minQty unitId deviceTypeId modelId supplierId isActive",
        )
        .populate({
          path: "partId",
          populate: [
            { path: "unitId", select: "name" },
            { path: "deviceTypeId", select: "name" },
            { path: "modelId", select: "name" },
            { path: "supplierId", select: "name" },
          ],
        })
        .lean()
        .exec(),
    };
  }
  async listPart(partId: string) {
    return {
      data: await this.balances
        .find({ partId, quantity: { $gte: 0 } })
        .populate("warehouseId", "code name")
        .lean()
        .exec(),
    };
  }
  async listTransactions(query: {
    warehouseId?: string;
    partId?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.partId) filter.partId = query.partId;
    const [data, total] = await Promise.all([
      this.transactions
        .find(filter)
        .populate("partId", "code name")
        .populate("warehouseId", "code name")
        .populate("receiptId", "code")
        .populate("createdBy", "displayName employeeCode")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.transactions.countDocuments(filter).exec(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
  async create(input: CreateInventoryTransactionDto, actor: CurrentActor) {
    if (
      !(await this.parts.exists({ _id: input.partId, isActive: true })) ||
      !(await this.warehouses.exists({
        _id: input.warehouseId,
        isActive: true,
      }))
    )
      throw new BadRequestException({ code: "INVENTORY_REFERENCE_INVALID" });
    const outgoing = ["ISSUE", "TRANSFER_OUT", "DISPOSAL"].includes(input.type);
    const delta = outgoing ? -input.quantity : input.quantity;
    const session = await this.balances.db.startSession();
    try {
      await session.withTransaction(async () => {
        const balance = await this.balances.findOneAndUpdate(
          { partId: input.partId, warehouseId: input.warehouseId },
          {
            $inc: { quantity: delta },
            $setOnInsert: {
              partId: input.partId,
              warehouseId: input.warehouseId,
            },
          },
          { new: true, upsert: true, session },
        );
        if (balance.quantity < 0)
          throw new BadRequestException({ code: "INSUFFICIENT_STOCK" });
        await this.transactions.create(
          [{ ...input, note: input.note?.trim(), createdBy: actor.userId }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return { data: { ok: true } };
  }
}
