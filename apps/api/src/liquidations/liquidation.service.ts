import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ClientSession, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import { ItemModel } from "../catalog/catalog.schemas";
import { Device, Part, PartSerial } from "../equipment/equipment.schemas";
import { Department, Warehouse } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { RepairDocument } from "../repairs/repairs.schemas";
import type {
  CompleteLiquidationDto,
  CreateLiquidationDto,
  LiquidationLineDto,
  UpdateLiquidationDto,
} from "./liquidation.dto";
import { LiquidationDocument } from "./liquidation.schemas";

const populate = [
  { path: "warehouseId", select: "code name" },
  { path: "requestedDepartmentId", select: "code name" },
  { path: "requestedBy", select: "displayName employeeCode" },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "submittedBy", select: "displayName employeeCode" },
  { path: "approvedBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  { path: "rejectedBy", select: "displayName employeeCode" },
  { path: "cancelledBy", select: "displayName employeeCode" },
  { path: "statusHistory.by", select: "displayName employeeCode" },
  {
    path: "lines.deviceId",
    select: "assetCode serial modelId techCondition usageStatus warehouseId",
  },
  {
    path: "lines.deviceId",
    populate: { path: "modelId", select: "code name" },
  },
  { path: "lines.partId", select: "code name trackingMode" },
  { path: "lines.partSerialId", select: "serial status partId warehouseId" },
  { path: "lines.repairId", select: "code status outcome result" },
];

@Injectable()
export class LiquidationService {
  constructor(
    @InjectModel(LiquidationDocument.name)
    private readonly documents: Model<LiquidationDocument>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(PartSerial.name) private readonly serials: Model<PartSerial>,
    @InjectModel(RepairDocument.name)
    private readonly repairs: Model<RepairDocument>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(ItemModel.name) private readonly models: Model<ItemModel>,
    private readonly audit: AuditService,
  ) {}

  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.dateFrom || query.dateTo)
      filter.documentDate = {
        ...(query.dateFrom ? { $gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo
          ? { $lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
          : {}),
      };
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(escaped, "i");
      filter.$or = [
        { code: pattern },
        { reason: pattern },
        { "lines.assetCode": pattern },
        { "lines.serial": pattern },
        { "lines.name": pattern },
      ];
    }
    const [data, total] = await Promise.all([
      this.documents
        .find(filter)
        .populate(populate)
        .sort({ documentDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.documents.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async get(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const data = await this.documents.findById(id).populate(populate).lean();
    if (!data) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data };
  }

  async eligible(warehouseId?: string) {
    const deviceFilter: Record<string, unknown> = {
      isActive: true,
      usageStatus: "IN_STOCK",
    };
    if (warehouseId) deviceFilter.warehouseId = warehouseId;
    const [devices, balances, serials, repairs] = await Promise.all([
      this.devices
        .find(deviceFilter)
        .populate({ path: "modelId", select: "code name" })
        .sort({ assetCode: 1 })
        .limit(500)
        .lean(),
      warehouseId
        ? this.balances
            .find({ warehouseId, quantity: { $gt: 0 } })
            .populate("partId", "code name trackingMode")
            .lean()
        : [],
      warehouseId
        ? this.serials
            .find({ warehouseId, status: "IN_STOCK" })
            .populate("partId", "code name trackingMode")
            .limit(500)
            .lean()
        : [],
      this.repairs
        .find({
          status: "UNREPAIRABLE",
          outcome: "PENDING_DISPOSAL",
          deviceId: { $ne: null },
        })
        .populate({
          path: "deviceId",
          select:
            "assetCode serial modelId techCondition usageStatus warehouseId",
          populate: { path: "modelId", select: "code name" },
        })
        .lean(),
    ]);
    return { data: { devices, balances, serials, repairs } };
  }

  private async code() {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replace(/-/g, "");
    const prefix = `LIQ-${day}-`;
    const counter = await this.documents.db
      .collection<{ _id: string; seq: number }>("operation_counters")
      .findOneAndUpdate(
        { _id: prefix },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" },
      );
    return `${prefix}${String(counter!.seq).padStart(3, "0")}`;
  }

  private async snapshot(line: LiquidationLineDto, warehouseId: string) {
    if (line.kind === "DEVICE") {
      if (
        !line.deviceId ||
        line.partId ||
        line.partSerialId ||
        line.quantity !== 1
      )
        throw new BadRequestException({ code: "LIQUIDATION_LINE_INVALID" });
      const device = await this.devices
        .findById(line.deviceId)
        .populate({ path: "modelId", select: "name" })
        .lean();
      if (
        !device ||
        !device.isActive ||
        String(device.warehouseId ?? "") !== warehouseId
      )
        throw new ConflictException({ code: "LIQUIDATION_DEVICE_INVALID" });
      let repairId: Types.ObjectId | undefined;
      if (device.usageStatus === "REPAIRING" && line.repairId) {
        const repair = await this.repairs
          .findOne({
            _id: line.repairId,
            deviceId: device._id,
            status: "UNREPAIRABLE",
            outcome: "PENDING_DISPOSAL",
          })
          .lean();
        if (!repair)
          throw new ConflictException({ code: "LIQUIDATION_REPAIR_INVALID" });
        repairId = repair._id;
      } else if (device.usageStatus !== "IN_STOCK")
        throw new ConflictException({ code: "LIQUIDATION_DEVICE_INVALID" });
      const model =
        typeof device.modelId === "object"
          ? (device.modelId as { name?: string }).name
          : undefined;
      return {
        kind: "DEVICE" as const,
        deviceId: device._id,
        repairId,
        name: model ?? device.assetCode,
        assetCode: device.assetCode,
        serial: device.serial,
        model,
        condition: device.techCondition,
        quantity: 1,
        originalValue: device.purchasePrice ?? 0,
        liquidationValue: line.liquidationValue ?? 0,
        reason: line.reason?.trim(),
        note: line.note?.trim(),
      };
    }
    if (!line.partId)
      throw new BadRequestException({ code: "LIQUIDATION_LINE_INVALID" });
    const part = await this.parts
      .findOne({ _id: line.partId, isActive: true })
      .lean();
    if (!part)
      throw new BadRequestException({ code: "PART_REFERENCE_INVALID" });
    if (line.kind === "PART") {
      if (part.trackingMode !== "QUANTITY" || line.partSerialId)
        throw new BadRequestException({ code: "LIQUIDATION_LINE_INVALID" });
      return {
        kind: "PART" as const,
        partId: part._id,
        name: part.name,
        assetCode: part.code,
        condition: "IN_STOCK",
        quantity: line.quantity,
        originalValue: 0,
        liquidationValue: line.liquidationValue ?? 0,
        reason: line.reason?.trim(),
        note: line.note?.trim(),
      };
    }
    if (
      !line.partSerialId ||
      part.trackingMode !== "SERIAL" ||
      line.quantity !== 1
    )
      throw new BadRequestException({ code: "LIQUIDATION_LINE_INVALID" });
    const serial = await this.serials
      .findOne({
        _id: line.partSerialId,
        partId: part._id,
        warehouseId,
        status: "IN_STOCK",
      })
      .lean();
    if (!serial)
      throw new ConflictException({ code: "LIQUIDATION_SERIAL_INVALID" });
    return {
      kind: "PART_SERIAL" as const,
      partId: part._id,
      partSerialId: serial._id,
      name: part.name,
      assetCode: part.code,
      serial: serial.serial,
      condition: serial.status,
      quantity: 1,
      originalValue: 0,
      liquidationValue: line.liquidationValue ?? 0,
      reason: line.reason?.trim(),
      note: line.note?.trim(),
    };
  }

  private async validateInput(input: CreateLiquidationDto) {
    if (!input.lines.length)
      throw new BadRequestException({ code: "LIQUIDATION_LINES_REQUIRED" });
    if (
      !(await this.warehouses.exists({
        _id: input.warehouseId,
        isActive: true,
      }))
    )
      throw new BadRequestException({ code: "WAREHOUSE_REFERENCE_INVALID" });
    if (
      input.requestedDepartmentId &&
      !(await this.departments.exists({
        _id: input.requestedDepartmentId,
        isActive: true,
      }))
    )
      throw new BadRequestException({ code: "DEPARTMENT_REFERENCE_INVALID" });
    const lines = await Promise.all(
      input.lines.map((line) => this.snapshot(line, input.warehouseId)),
    );
    const keys = lines.flatMap((line) =>
      line.kind === "DEVICE"
        ? [`DEVICE:${String(line.deviceId)}`]
        : line.kind === "PART_SERIAL"
          ? [`PART_SERIAL:${String(line.partSerialId)}`]
          : [],
    );
    if (new Set(keys).size !== keys.length)
      throw new BadRequestException({ code: "LIQUIDATION_LINE_DUPLICATE" });
    return lines;
  }

  async create(input: CreateLiquidationDto, actor: CurrentActor) {
    const lines = await this.validateInput(input);
    const now = new Date();
    const document = await this.documents.create({
      ...input,
      code: await this.code(),
      documentDate: new Date(input.documentDate),
      liquidationDate: input.liquidationDate
        ? new Date(input.liquidationDate)
        : undefined,
      reason: input.reason.trim(),
      responsiblePerson: input.responsiblePerson?.trim(),
      note: input.note?.trim(),
      lines,
      totalValue: lines.reduce(
        (sum, line) => sum + line.liquidationValue * line.quantity,
        0,
      ),
      status: "DRAFT",
      requestedBy: actor.userId,
      createdBy: actor.userId,
      statusHistory: [{ status: "DRAFT", at: now, by: actor.userId }],
    });
    await this.log("LIQUIDATION_CREATED", document, actor, {
      lineCount: lines.length,
    });
    return this.get(String(document._id));
  }

  async update(id: string, input: UpdateLiquidationDto, actor: CurrentActor) {
    const current = await this.documents.findOne({ _id: id, status: "DRAFT" });
    if (!current)
      throw new ConflictException({ code: "LIQUIDATION_NOT_EDITABLE" });
    const lines = await this.validateInput(input);
    Object.assign(current, {
      ...input,
      documentDate: new Date(input.documentDate),
      liquidationDate: input.liquidationDate
        ? new Date(input.liquidationDate)
        : undefined,
      lines,
      totalValue: lines.reduce(
        (sum, line) => sum + line.liquidationValue * line.quantity,
        0,
      ),
      updatedBy: actor.userId,
    });
    await current.save();
    await this.log("LIQUIDATION_UPDATED", current, actor, {
      changedFields: Object.keys(input),
    });
    return this.get(id);
  }

  private assetKeys(lines: LiquidationDocument["lines"]) {
    return lines.flatMap((line) =>
      line.kind === "DEVICE"
        ? [`DEVICE:${String(line.deviceId)}`]
        : line.kind === "PART_SERIAL"
          ? [`PART_SERIAL:${String(line.partSerialId)}`]
          : [],
    );
  }
  async submit(id: string, actor: CurrentActor) {
    const document = await this.documents.findById(id);
    if (!document) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (document.status !== "DRAFT")
      throw new ConflictException({ code: "LIQUIDATION_INVALID_STATUS" });
    await this.validateInput({
      documentDate: document.documentDate.toISOString(),
      liquidationDate: document.liquidationDate?.toISOString(),
      warehouseId: String(document.warehouseId),
      reason: document.reason,
      method: document.method,
      requestedDepartmentId: document.requestedDepartmentId
        ? String(document.requestedDepartmentId)
        : undefined,
      responsiblePerson: document.responsiblePerson,
      note: document.note,
      lines: document.lines.map((line) => ({
        kind: line.kind,
        deviceId: line.deviceId ? String(line.deviceId) : undefined,
        partId: line.partId ? String(line.partId) : undefined,
        partSerialId: line.partSerialId ? String(line.partSerialId) : undefined,
        repairId: line.repairId ? String(line.repairId) : undefined,
        quantity: line.quantity,
        liquidationValue: line.liquidationValue,
        reason: line.reason,
        note: line.note,
      })),
    });
    const at = new Date();
    try {
      const changed = await this.documents.findOneAndUpdate(
        { _id: id, status: "DRAFT" },
        {
          $set: {
            status: "PENDING",
            activeAssetKeys: this.assetKeys(document.lines),
            submittedBy: actor.userId,
            submittedAt: at,
          },
          $push: { statusHistory: { status: "PENDING", at, by: actor.userId } },
        },
        { new: true },
      );
      if (!changed)
        throw new ConflictException({ code: "LIQUIDATION_CONCURRENT_UPDATE" });
      await this.log("LIQUIDATION_SUBMITTED", changed, actor);
      return this.get(id);
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new ConflictException({
          code: "LIQUIDATION_ASSET_ALREADY_PENDING",
        });
      throw error;
    }
  }

  async approve(id: string, actor: CurrentActor) {
    return this.transition(
      id,
      "PENDING",
      "APPROVED",
      "LIQUIDATION_APPROVED",
      actor,
    );
  }
  async reject(id: string, reason: string, actor: CurrentActor) {
    return this.transition(
      id,
      "PENDING",
      "REJECTED",
      "LIQUIDATION_REJECTED",
      actor,
      reason,
    );
  }
  async cancel(id: string, reason: string, actor: CurrentActor) {
    const document = await this.documents.findById(id);
    if (!document) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!["DRAFT", "PENDING", "APPROVED"].includes(document.status))
      throw new ConflictException({ code: "LIQUIDATION_INVALID_STATUS" });
    return this.transition(
      id,
      document.status,
      "CANCELLED",
      "LIQUIDATION_CANCELLED",
      actor,
      reason,
    );
  }
  private async transition(
    id: string,
    from: string,
    to: string,
    action: string,
    actor: CurrentActor,
    reason?: string,
  ) {
    const at = new Date();
    const fields: Record<string, unknown> = { status: to };
    if (to === "APPROVED")
      Object.assign(fields, { approvedBy: actor.userId, approvedAt: at });
    if (to === "REJECTED")
      Object.assign(fields, {
        rejectedBy: actor.userId,
        rejectedAt: at,
        rejectionReason: reason,
      });
    if (to === "CANCELLED")
      Object.assign(fields, {
        cancelledBy: actor.userId,
        cancelledAt: at,
        cancelReason: reason,
      });
    const changed = await this.documents.findOneAndUpdate(
      { _id: id, status: from },
      {
        $set: fields,
        ...(to === "REJECTED" || to === "CANCELLED"
          ? { $unset: { activeAssetKeys: 1 } }
          : {}),
        $push: {
          statusHistory: { status: to, at, by: actor.userId, note: reason },
        },
      },
      { new: true },
    );
    if (!changed) {
      if (!(await this.documents.exists({ _id: id })))
        throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      throw new ConflictException({ code: "LIQUIDATION_INVALID_STATUS" });
    }
    await this.log(action, changed, actor, reason ? { reason } : undefined);
    return this.get(id);
  }

  async complete(
    id: string,
    input: CompleteLiquidationDto,
    actor: CurrentActor,
  ) {
    const session = await this.documents.db.startSession();
    let code = "";
    try {
      await session.withTransaction(async () => {
        const document = await this.documents
          .findOne({ _id: id, status: "APPROVED" })
          .session(session);
        if (!document) {
          if (!(await this.documents.exists({ _id: id }).session(session)))
            throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
          throw new ConflictException({ code: "LIQUIDATION_INVALID_STATUS" });
        }
        code = document.code;
        for (const [index, line] of document.lines.entries())
          await this.disposeLine(document, line, index, actor, session);
        const at = input.liquidationDate
          ? new Date(input.liquidationDate)
          : new Date();
        const changed = await this.documents.updateOne(
          { _id: id, status: "APPROVED" },
          {
            $set: {
              status: "COMPLETED",
              liquidationDate: at,
              completedBy: actor.userId,
              completedAt: at,
            },
            $unset: { activeAssetKeys: 1 },
            $push: {
              statusHistory: { status: "COMPLETED", at, by: actor.userId },
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({
            code: "LIQUIDATION_CONCURRENT_UPDATE",
          });
      });
    } finally {
      await session.endSession();
    }
    const document = await this.documents.findById(id).lean();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "LIQUIDATION_COMPLETED",
      entityType: "LiquidationDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
      metadata: {
        code,
        lineCount: document?.lines.length,
        totalValue: document?.totalValue,
      },
    });
    return this.get(id);
  }

  private async disposeLine(
    document: LiquidationDocument & { _id: Types.ObjectId },
    line: LiquidationDocument["lines"][number],
    index: number,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    if (line.kind === "DEVICE" && line.deviceId) {
      const statuses = line.repairId ? ["REPAIRING"] : ["IN_STOCK"];
      const changed = await this.devices.updateOne(
        {
          _id: line.deviceId,
          warehouseId: document.warehouseId,
          usageStatus: { $in: statuses },
          isActive: true,
        },
        {
          $set: {
            usageStatus: "DISPOSED",
            techCondition:
              line.condition === "BROKEN" ? "BROKEN" : line.condition,
          },
          $unset: {
            keeperId: 1,
            departmentId: 1,
            warehouseId: 1,
            locationId: 1,
            loanId: 1,
            borrowedAt: 1,
            loanDueDate: 1,
          },
        },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "LIQUIDATION_DEVICE_INVALID" });
      return;
    }
    if (!line.partId)
      throw new BadRequestException({ code: "LIQUIDATION_LINE_INVALID" });
    if (line.kind === "PART_SERIAL") {
      const changed = await this.serials.updateOne(
        {
          _id: line.partSerialId,
          partId: line.partId,
          warehouseId: document.warehouseId,
          status: "IN_STOCK",
        },
        {
          $set: {
            status: "DISPOSED",
            note: `Thanh lý theo phiếu ${document.code}`,
          },
          $unset: { warehouseId: 1, locationId: 1 },
        },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "LIQUIDATION_SERIAL_INVALID" });
    }
    const balance = await this.balances.findOneAndUpdate(
      {
        partId: line.partId,
        warehouseId: document.warehouseId,
        quantity: { $gte: line.quantity },
      },
      { $inc: { quantity: -line.quantity } },
      { new: true, session },
    );
    if (!balance) throw new ConflictException({ code: "INSUFFICIENT_STOCK" });
    await this.transactions.create(
      [
        {
          partId: line.partId,
          warehouseId: document.warehouseId,
          type: "LIQUIDATION",
          quantity: line.quantity,
          liquidationId: document._id,
          lineIndex: index,
          createdBy: actor.userId,
          note: `Thanh lý ${document.code}`,
        },
      ],
      { session },
    );
  }

  async deviceHistory(deviceId: string) {
    if (!Types.ObjectId.isValid(deviceId))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return {
      data: await this.documents
        .find({ "lines.deviceId": deviceId, status: "COMPLETED" })
        .populate(populate)
        .sort({ liquidationDate: -1 })
        .lean(),
    };
  }
  private async log(
    action: string,
    document: LiquidationDocument & { _id: Types.ObjectId },
    actor: CurrentActor,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.write({
      actorUserId: actor.userId,
      action,
      entityType: "LiquidationDocument",
      entityId: document._id,
      outcome: "SUCCESS",
      metadata: { code: document.code, ...metadata },
    });
  }
}
