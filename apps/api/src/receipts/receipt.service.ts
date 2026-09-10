import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { ClientSession, HydratedDocument, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import { Device, Part, PartSerial } from "../equipment/equipment.schemas";
import { Warehouse } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { CreateInboundReceiptDto, ReverseReceiptDto } from "./receipt.dto";
import { IdempotencyKey, InboundReceipt } from "./receipt.schemas";

const populate = [
  { path: "warehouseId", select: "code name" },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "submittedBy", select: "displayName employeeCode" },
  { path: "approvedBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  { path: "lines.part.partId", select: "code name trackingMode unitId" },
  { path: "lines.part.partId", populate: { path: "unitId", select: "name" } },
  { path: "lines.device.modelId", select: "code name" },
  { path: "lines.device.deviceTypeId", select: "code name" },
  { path: "lines.device.supplierId", select: "code name" },
];

function normal(value?: string): string | undefined {
  const result = value?.trim();
  return result ? result.toUpperCase() : undefined;
}
type CompletedLine = {
  type: "DEVICE" | "PART";
  quantity: number;
  note?: string;
  device?: {
    deviceId?: Types.ObjectId;
    assetCode?: string;
    serial?: string;
    modelId?: Types.ObjectId;
    deviceTypeId?: Types.ObjectId;
    supplierId?: Types.ObjectId;
    locationId?: Types.ObjectId;
    purchasePrice?: number;
    warrantyUntil?: Date;
    techCondition: string;
    notes?: string;
  };
  part?: { partId: Types.ObjectId; serials: string[] };
};

@Injectable()
export class ReceiptService {
  constructor(
    @InjectModel(InboundReceipt.name)
    private readonly receipts: Model<InboundReceipt>,
    @InjectModel(IdempotencyKey.name)
    private readonly keys: Model<IdempotencyKey>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(PartSerial.name)
    private readonly partSerials: Model<PartSerial>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    private readonly audit: AuditService,
  ) {}

  async list(query: {
    q?: string;
    status?: string;
    warehouseId?: string;
    source?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.source) filter.source = query.source;
    if (query.q?.trim())
      filter.code = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
    const [data, total] = await Promise.all([
      this.receipts
        .find(filter)
        .populate(populate)
        .sort({ receiptDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.receipts.countDocuments(filter).exec(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async get(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const receipt = await this.receipts
      .findById(id)
      .populate(populate)
      .lean()
      .exec();
    if (!receipt) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: receipt };
  }

  async create(
    input: CreateInboundReceiptDto,
    actor: CurrentActor,
    idempotencyKey?: string,
  ) {
    await this.validateDraft(input);
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const key = idempotencyKey?.trim();
    if (key) {
      const old = await this.keys
        .findOne({ key, actorUserId: actor.userId })
        .lean()
        .exec();
      if (old) {
        if (old.requestHash !== hash)
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_CONFLICT" });
        if (old.receiptId) return this.get(String(old.receiptId));
      }
    }
    try {
      const receipt = await this.receipts.create({
        code: input.code.trim().toUpperCase(),
        receiptDate: input.receiptDate,
        warehouseId: input.warehouseId,
        source: input.source,
        requiresApproval: input.requiresApproval ?? false,
        status: "DRAFT",
        createdBy: actor.userId,
        openingSource: input.openingSource?.trim(),
        openingReason: input.openingReason?.trim(),
        attachments:
          input.attachments?.map((item) => ({
            name: item.name.trim(),
            url: item.url?.trim(),
          })) ?? [],
        lines: input.lines.map((line) => ({
          type: line.type,
          quantity: line.quantity,
          note: line.note?.trim(),
          device: line.device
            ? {
                ...line.device,
                assetCode: normal(line.device.assetCode)!,
                serial: normal(line.device.serial),
                notes: line.device.notes?.trim(),
              }
            : undefined,
          part: line.part
            ? {
                partId: line.part.partId,
                serials:
                  line.part.serials?.map((serial) => normal(serial)!) ?? [],
              }
            : undefined,
        })),
      });
      if (key)
        await this.keys.create({
          key,
          requestHash: hash,
          actorUserId: actor.userId,
          receiptId: receipt._id,
        });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "INBOUND_RECEIPT_CREATED",
        entityType: "InboundReceipt",
        entityId: receipt._id,
        outcome: "SUCCESS",
        metadata: { code: receipt.code },
      });
      return { data: await receipt.populate(populate) };
    } catch (error) {
      if (this.duplicate(error)) {
        const keyPattern = (error as { keyPattern?: Record<string, unknown> })
          .keyPattern;
        if (keyPattern?.assetCode || keyPattern?.serial)
          throw new ConflictException({ code: "ASSET_CODE_OR_SERIAL_EXISTS" });
        throw new ConflictException({ code: "RECEIPT_CODE_EXISTS" });
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: CreateInboundReceiptDto,
    actor: CurrentActor,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const receipt = await this.receipts.findById(id).exec();
    if (!receipt) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (receipt.status !== "DRAFT")
      throw new ConflictException({
        code: "RECEIPT_NOT_EDITABLE",
        message: "Chỉ được sửa phiếu đang ở trạng thái Nháp.",
      });
    await this.validateDraft(input);
    try {
      const updated = await this.receipts.findByIdAndUpdate(
        id,
        {
          $set: {
            code: input.code.trim().toUpperCase(),
            receiptDate: input.receiptDate,
            warehouseId: input.warehouseId,
            source: input.source,
            requiresApproval:
              input.requiresApproval ?? receipt.requiresApproval,
            openingSource: input.openingSource?.trim(),
            openingReason: input.openingReason?.trim(),
            attachments:
              input.attachments?.map((item) => ({
                name: item.name.trim(),
                url: item.url?.trim(),
              })) ?? [],
            lines: input.lines.map((line) => ({
              type: line.type,
              quantity: line.quantity,
              note: line.note?.trim(),
              device: line.device
                ? {
                    ...line.device,
                    assetCode: normal(line.device.assetCode),
                    serial: normal(line.device.serial),
                    notes: line.device.notes?.trim(),
                  }
                : undefined,
              part: line.part
                ? {
                    partId: line.part.partId,
                    serials:
                      line.part.serials?.map((serial) => normal(serial)!) ?? [],
                  }
                : undefined,
            })),
          },
        },
        { new: true, runValidators: true },
      );
      if (!updated) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "INBOUND_RECEIPT_DRAFT_UPDATED",
        entityType: "InboundReceipt",
        entityId: updated._id,
        outcome: "SUCCESS",
        metadata: { code: updated.code },
      });
      return { data: await updated.populate(populate) };
    } catch (error) {
      if (this.duplicate(error))
        throw new ConflictException({ code: "RECEIPT_CODE_EXISTS" });
      throw error;
    }
  }

  async submit(id: string, actor: CurrentActor) {
    return this.transition(id, "DRAFT", "SUBMITTED", actor, "submittedBy");
  }
  async removeDraft(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const receipt = await this.receipts
      .findOneAndDelete({ _id: id, status: "DRAFT" })
      .exec();
    if (!receipt) throw new ConflictException({ code: "RECEIPT_NOT_EDITABLE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "INBOUND_RECEIPT_DRAFT_DELETED",
      entityType: "InboundReceipt",
      entityId: receipt._id,
      outcome: "SUCCESS",
      metadata: { code: receipt.code },
    });
    return { data: { id } };
  }
  async approve(id: string, actor: CurrentActor) {
    return this.transition(id, "SUBMITTED", "APPROVED", actor, "approvedBy");
  }

  async complete(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const session = await this.receipts.db.startSession();
    try {
      await session.withTransaction(async () => {
        const receipt = await this.receipts
          .findById(id)
          .session(session)
          .exec();
        if (!receipt)
          throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (receipt.status === "COMPLETED")
          throw new ConflictException({ code: "RECEIPT_ALREADY_COMPLETED" });
        const validStatus = receipt.requiresApproval
          ? receipt.status === "APPROVED"
          : ["DRAFT", "SUBMITTED"].includes(receipt.status);
        if (!validStatus)
          throw new ConflictException({
            code: "RECEIPT_NOT_READY_TO_COMPLETE",
          });
        for (let index = 0; index < receipt.lines.length; index += 1) {
          const line = receipt.lines[index] as unknown as CompletedLine;
          if (line.type === "DEVICE") {
            if (!line.device)
              throw new BadRequestException({ code: "DEVICE_LINE_REQUIRED" });
            const device = line.device;
            if (device.deviceId) {
              const changed = await this.devices.updateOne(
                {
                  _id: device.deviceId,
                  isActive: true,
                  usageStatus: "NOT_RECEIVED",
                  warehouseId: { $exists: false },
                },
                {
                  $set: {
                    warehouseId: receipt.warehouseId,
                    locationId: device.locationId,
                    usageStatus: "IN_STOCK",
                  },
                },
                { session },
              );
              if (changed.modifiedCount !== 1)
                throw new ConflictException({
                  code: "DEVICE_NOT_AVAILABLE_FOR_RECEIPT",
                });
            } else {
              await this.devices.create(
                [
                  {
                    assetCode: device.assetCode,
                    serial: device.serial,
                    modelId: device.modelId,
                    deviceTypeId: device.deviceTypeId,
                    supplierId: device.supplierId,
                    purchasedAt: receipt.receiptDate,
                    purchasePrice: device.purchasePrice,
                    warrantyUntil: device.warrantyUntil,
                    techCondition: device.techCondition,
                    warehouseId: receipt.warehouseId,
                    locationId: device.locationId,
                    usageStatus: "IN_STOCK",
                    notes: device.notes,
                  },
                ],
                { session },
              );
            }
          } else {
            if (!line.part)
              throw new BadRequestException({ code: "PART_LINE_REQUIRED" });
            const partLine = line.part;
            const part = await this.parts
              .findOne({ _id: partLine.partId, isActive: true })
              .session(session)
              .exec();
            if (!part)
              throw new BadRequestException({ code: "PART_REFERENCE_INVALID" });
            if (part.trackingMode === "SERIAL") {
              if (partLine.serials.length > line.quantity)
                throw new BadRequestException({
                  code: "PART_SERIAL_COUNT_EXCEEDED",
                });
              await this.partSerials.create(
                partLine.serials.map((serial) => ({
                  partId: part._id,
                  serial,
                  warehouseId: receipt.warehouseId,
                  status: "IN_STOCK",
                })),
                { session },
              );
            } else if (partLine.serials?.length)
              throw new BadRequestException({
                code: "PART_SERIAL_NOT_ALLOWED",
              });
            await this.balances.findOneAndUpdate(
              { partId: part._id, warehouseId: receipt.warehouseId },
              {
                $inc: { quantity: line.quantity },
                $setOnInsert: {
                  partId: part._id,
                  warehouseId: receipt.warehouseId,
                },
              },
              { new: true, upsert: true, session },
            );
            await this.transactions.create(
              [
                {
                  partId: part._id,
                  warehouseId: receipt.warehouseId,
                  type:
                    receipt.source === "OPENING"
                      ? "OPENING"
                      : receipt.source === "RETURN"
                        ? "RETURN"
                        : "PURCHASE",
                  quantity: line.quantity,
                  note: `Phiếu nhập ${receipt.code}${line.note ? `: ${line.note}` : ""}`,
                  createdBy: actor.userId,
                  receiptId: receipt._id,
                  lineIndex: index,
                },
              ],
              { session },
            );
          }
        }
        const changed = await this.receipts.updateOne(
          { _id: receipt._id, status: receipt.status },
          {
            $set: {
              status: "COMPLETED",
              completedBy: actor.userId,
              completedAt: new Date(),
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "RECEIPT_CONCURRENT_UPDATE" });
      });
    } catch (error) {
      if (this.duplicate(error))
        throw new ConflictException({ code: "ASSET_CODE_OR_SERIAL_EXISTS" });
      throw error;
    } finally {
      await session.endSession();
    }
    const receipt = await this.receipts.findById(id).exec();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "INBOUND_RECEIPT_COMPLETED",
      entityType: "InboundReceipt",
      entityId: receipt!._id,
      outcome: "SUCCESS",
    });
    return this.get(id);
  }

  async reverse(id: string, input: ReverseReceiptDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const session = await this.receipts.db.startSession();
    try {
      await session.withTransaction(async () => {
        const receipt = await this.receipts
          .findById(id)
          .session(session)
          .exec();
        if (!receipt)
          throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        // Chống đảo 2 lần: chỉ phiếu COMPLETED được đảo; REVERSED là trạng thái kết thúc
        if (receipt.status !== "COMPLETED")
          throw new ConflictException({
            code: "RECEIPT_NOT_REVERSIBLE",
            message: "Chỉ được đảo phiếu đã hoàn tất.",
          });
        // 1) Gom tổng đã nhập theo (linh kiện, kho) từ transaction gốc (không xóa)
        const originalTxs = await this.transactions
          .find({ receiptId: receipt._id })
          .session(session)
          .exec();
        if (!originalTxs.length)
          throw new ConflictException({
            code: "RECEIPT_NOT_REVERSIBLE",
            message: "Phiếu không có giao dịch kho để đảo.",
          });
        const totals = new Map<
          string,
          {
            partId: Types.ObjectId;
            warehouseId: Types.ObjectId;
            quantity: number;
          }
        >();
        for (const tx of originalTxs) {
          const key = `${tx.partId.toString()}:${tx.warehouseId.toString()}`;
          const entry = totals.get(key) ?? {
            partId: tx.partId,
            warehouseId: tx.warehouseId,
            quantity: 0,
          };
          entry.quantity += tx.quantity;
          totals.set(key, entry);
        }
        // 2) Không cho đảo nếu tồn không còn đủ (đã cấp phát/điều chuyển/xuất kho)
        for (const total of totals.values()) {
          const balance = await this.balances
            .findOne({ partId: total.partId, warehouseId: total.warehouseId })
            .session(session)
            .exec();
          if (!balance || balance.quantity < total.quantity)
            throw new ConflictException({
              code: "INSUFFICIENT_STOCK_TO_REVERSE",
              message:
                "Không thể đảo phiếu vì một phần hàng đã xuất khỏi kho (cấp phát/điều chuyển/thanh lý).",
            });
        }
        // 3) Thiết bị phải còn trong kho của phiếu; ngược lại chặn
        for (const line of receipt.lines) {
          if (line.type !== "DEVICE" || !line.device) continue;
          const device: CompletedLine["device"] = line.device;
          if (!device) continue;
          const condition: Record<string, unknown> = device.deviceId
            ? { _id: device.deviceId }
            : { assetCode: (device.assetCode ?? "").toUpperCase() };
          const usable = await this.devices
            .findOne({
              ...condition,
              warehouseId: receipt.warehouseId,
              usageStatus: "IN_STOCK",
            })
            .session(session)
            .exec();
          if (!usable)
            throw new ConflictException({
              code: "DEVICE_NOT_REVERSIBLE",
              message:
                "Không thể đảo phiếu vì thiết bị đã rời kho (cấp phát/điều chuyển/thanh lý).",
            });
          await this.devices.updateOne(
            { _id: usable._id },
            {
              $set: { usageStatus: "NOT_RECEIVED" },
              $unset: { warehouseId: 1, locationId: 1 },
            },
            { session },
          );
        }
        await this.reverseSerialsAndStock(
          receipt,
          totals,
          input,
          actor,
          session,
        );
        // 6) Đánh dấu phiếu REVERSED (chống race: chỉ update khi vẫn COMPLETED)
        const changed = await this.receipts.updateOne(
          { _id: receipt._id, status: "COMPLETED" },
          {
            $set: {
              status: "REVERSED",
              reversedBy: actor.userId,
              reversedAt: new Date(),
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "RECEIPT_CONCURRENT_UPDATE" });
      });
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "INBOUND_RECEIPT_REVERSED",
      entityType: "InboundReceipt",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
      metadata: { reason: input.reason?.trim() },
    });
    return this.get(id);
  }

  private async reverseSerialsAndStock(
    receipt: HydratedDocument<InboundReceipt>,
    totals: Map<
      string,
      { partId: Types.ObjectId; warehouseId: Types.ObjectId; quantity: number }
    >,
    input: ReverseReceiptDto,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    // 4) Serial linh kiện: phải còn IN_STOCK tại kho của phiếu, đánh dấu DISPOSED (giữ lịch sử)
    for (const line of receipt.lines) {
      if (line.type !== "PART" || !line.part?.serials?.length) continue;
      const serials = line.part.serials;
      const inStock = await this.partSerials
        .countDocuments({
          partId: line.part.partId,
          serial: { $in: serials },
          warehouseId: receipt.warehouseId,
          status: "IN_STOCK",
        })
        .session(session)
        .exec();
      if (inStock !== serials.length)
        throw new ConflictException({
          code: "PART_SERIAL_NOT_REVERSIBLE",
          message:
            "Không thể đảo phiếu vì có serial linh kiện đã xuất khỏi kho.",
        });
      await this.partSerials.updateMany(
        {
          partId: line.part.partId,
          serial: { $in: serials },
          warehouseId: receipt.warehouseId,
        },
        {
          $set: { status: "DISPOSED", note: `Đảo phiếu ${receipt.code}` },
          $unset: { warehouseId: 1, locationId: 1 },
        },
        { session },
      );
    }
    // 5) Tạo transaction đảo ngược (giữ transaction cũ: Nhập +20, Đảo -20) và giảm tồn
    for (const total of totals.values()) {
      await this.transactions.create(
        [
          {
            partId: total.partId,
            warehouseId: total.warehouseId,
            type: "ADJUSTMENT",
            quantity: -total.quantity,
            note: `Đảo phiếu ${receipt.code}${
              input.reason?.trim() ? `: ${input.reason.trim()}` : ""
            }`,
            createdBy: actor.userId,
            receiptId: receipt._id,
          },
        ],
        { session },
      );
      await this.balances.findOneAndUpdate(
        { partId: total.partId, warehouseId: total.warehouseId },
        { $inc: { quantity: -total.quantity } },
        { session },
      );
    }
  }

  private async transition(
    id: string,
    from: string,
    to: string,
    actor: CurrentActor,
    field: "submittedBy" | "approvedBy",
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const receipt = await this.receipts
      .findOneAndUpdate(
        { _id: id, status: from },
        { $set: { status: to, [field]: actor.userId } },
        { new: true },
      )
      .populate(populate)
      .exec();
    if (!receipt)
      throw new ConflictException({ code: "RECEIPT_INVALID_STATUS" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: `INBOUND_RECEIPT_${to}`,
      entityType: "InboundReceipt",
      entityId: receipt._id,
      outcome: "SUCCESS",
    });
    return { data: receipt };
  }

  private async validateDraft(input: CreateInboundReceiptDto) {
    if (
      !(await this.warehouses.exists({
        _id: input.warehouseId,
        isActive: true,
      }))
    )
      throw new BadRequestException({ code: "WAREHOUSE_REFERENCE_INVALID" });
    if (
      input.source === "OPENING" &&
      (!input.openingSource?.trim() || !input.openingReason?.trim())
    )
      throw new BadRequestException({
        code: "OPENING_SOURCE_AND_REASON_REQUIRED",
      });
    const assets = new Set<string>();
    const serials = new Set<string>();
    for (const line of input.lines) {
      if (line.type === "DEVICE") {
        if (!line.device)
          throw new BadRequestException({ code: "DEVICE_LINE_REQUIRED" });
        if (line.device.deviceId) {
          const device = await this.devices
            .findOne({
              _id: line.device.deviceId,
              isActive: true,
              usageStatus: "NOT_RECEIVED",
              warehouseId: { $exists: false },
            })
            .select("_id")
            .lean()
            .exec();
          if (!device)
            throw new BadRequestException({
              code: "DEVICE_NOT_AVAILABLE_FOR_RECEIPT",
            });
          continue;
        }
        const asset = normal(line.device.assetCode);
        if (!asset)
          throw new BadRequestException({ code: "DEVICE_ASSET_CODE_INVALID" });
        if (line.quantity !== 1 || assets.has(asset))
          throw new BadRequestException({ code: "DEVICE_ASSET_CODE_INVALID" });
        assets.add(asset);
        if (line.device.serial) {
          const serial = normal(line.device.serial)!;
          if (serials.has(serial))
            throw new BadRequestException({
              code: "SERIAL_DUPLICATE_IN_RECEIPT",
            });
          serials.add(serial);
        }
      } else {
        if (!line.part)
          throw new BadRequestException({ code: "PART_LINE_REQUIRED" });
        const part = await this.parts
          .findOne({ _id: line.part.partId, isActive: true })
          .lean()
          .exec();
        if (!part)
          throw new BadRequestException({ code: "PART_REFERENCE_INVALID" });
        const list = line.part.serials ?? [];
        if (part.trackingMode === "SERIAL" && list.length > line.quantity)
          throw new BadRequestException({
            code: "PART_SERIAL_COUNT_EXCEEDED",
          });
        if (part.trackingMode === "QUANTITY" && list.length)
          throw new BadRequestException({ code: "PART_SERIAL_NOT_ALLOWED" });
        const normalizedSerials = list.map((raw) => normal(raw)!);
        for (const serial of normalizedSerials) {
          if (serials.has(`${part._id.toString()}:${serial}`))
            throw new BadRequestException({
              code: "PART_SERIAL_DUPLICATE_IN_RECEIPT",
            });
          serials.add(`${part._id.toString()}:${serial}`);
        }
        if (
          normalizedSerials.length &&
          (await this.partSerials.exists({
            partId: part._id,
            serial: { $in: normalizedSerials },
          }))
        ) {
          throw new BadRequestException({ code: "PART_SERIAL_ALREADY_EXISTS" });
        }
      }
    }
  }
  private duplicate(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
