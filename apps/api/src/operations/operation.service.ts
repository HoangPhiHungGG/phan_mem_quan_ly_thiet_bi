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
import { Keeper, Location } from "../catalog/catalog.schemas";
import { Device, Part } from "../equipment/equipment.schemas";
import { Department, Warehouse } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { IdempotencyKey } from "../receipts/receipt.schemas";
import { CreateOperationDto, ReceiveOperationDto } from "./operation.dto";
import { OperationDocument } from "./operation.schemas";

const populate = [
  { path: "sourceWarehouseId", select: "code name" },
  { path: "destinationWarehouseId", select: "code name" },
  { path: "receiverKeeperId", select: "code displayName" },
  { path: "senderKeeperId", select: "code displayName" },
  { path: "receiverDepartmentId", select: "code name" },
  {
    path: "lines.deviceId",
    select: "assetCode serial usageStatus techCondition",
  },
  { path: "lines.partId", select: "code name trackingMode unitId" },
  { path: "createdBy", select: "displayName" },
];

@Injectable()
export class OperationService {
  constructor(
    @InjectModel(OperationDocument.name)
    private readonly operations: Model<OperationDocument>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(Keeper.name) private readonly keepers: Model<Keeper>,
    @InjectModel(Location.name) private readonly locations: Model<Location>,
    @InjectModel(IdempotencyKey.name)
    private readonly keys: Model<IdempotencyKey>,
    private readonly audit: AuditService,
  ) {}

  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.warehouseId)
      filter.$or = [
        { sourceWarehouseId: query.warehouseId },
        { destinationWarehouseId: query.warehouseId },
      ];
    if (query.q?.trim())
      filter.code = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
    const [data, total] = await Promise.all([
      this.operations
        .find(filter)
        .populate(populate)
        .sort({ operationDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.operations.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
  async get(id: string) {
    const item = await this.operations.findById(id).populate(populate).lean();
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: item };
  }
  async mine(actor: CurrentActor) {
    const userCode = actor.employeeCode?.trim().toUpperCase();
    const keeper = userCode
      ? await this.keepers
          .findOne({ employeeCode: userCode, isActive: true })
          .lean()
      : null;
    const filter = keeper
      ? {
          receiverKeeperId: keeper._id,
          status: { $in: ["DRAFT", "IN_TRANSIT", "PARTIAL", "COMPLETED"] },
        }
      : { createdBy: actor.userId };
    const [operations, devices] = await Promise.all([
      this.operations
        .find(filter)
        .populate(populate)
        .sort({ operationDate: -1 })
        .limit(100)
        .lean(),
      keeper
        ? this.devices
            .find({ keeperId: keeper._id, isActive: true })
            .select("assetCode serial usageStatus techCondition")
            .lean()
        : [],
    ]);
    return { data: { operations, devices } };
  }
  async overdue() {
    return {
      data: await this.operations
        .find({
          type: "LOAN",
          status: { $in: ["ACTIVE", "PARTIALLY_RETURNED"] },
          dueDate: { $lt: new Date() },
        })
        .populate(populate)
        .sort({ dueDate: 1 })
        .lean(),
    };
  }

  async create(input: CreateOperationDto, actor: CurrentActor, key?: string) {
    await this.validate(input);
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const normalizedKey = key?.trim();
    if (normalizedKey) {
      const old = await this.keys
        .findOne({ key: normalizedKey, actorUserId: actor.userId })
        .lean();
      if (old) {
        if (old.requestHash !== requestHash)
          throw new ConflictException({ code: "IDEMPOTENCY_KEY_CONFLICT" });
        if (old.operationId) return this.get(String(old.operationId));
      }
    }
    try {
      const operation = await this.operations.create({
        ...input,
        code: input.code.trim().toUpperCase(),
        reason: input.reason.trim(),
        operationDate: input.operationDate,
        dueDate: input.dueDate,
        status: "DRAFT",
        createdBy: actor.userId,
        lines: input.lines.map((line) => ({
          ...line,
          note: line.note?.trim(),
          returned: false,
        })),
      });
      if (normalizedKey)
        await this.keys.create({
          key: normalizedKey,
          requestHash,
          actorUserId: actor.userId,
          operationId: operation._id,
        });
      await this.audit.write({
        actorUserId: actor.userId,
        action: `${operation.type}_CREATED`,
        entityType: "OperationDocument",
        entityId: operation._id,
        outcome: "SUCCESS",
        metadata: { code: operation.code },
      });
      return { data: await operation.populate(populate) };
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new ConflictException({ code: "OPERATION_CODE_EXISTS" });
      throw error;
    }
  }

  async complete(id: string, actor: CurrentActor) {
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations.findById(id).session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (op.status !== "DRAFT")
          throw new ConflictException({ code: "OPERATION_NOT_EDITABLE" });
        if (op.type === "TRANSFER") {
          await this.dispatchTransfer(op, actor, session);
          return;
        }
        for (let i = 0; i < op.lines.length; i += 1)
          await this.applyLine(op, i, actor, session);
        const changed = await this.operations.updateOne(
          { _id: op._id, status: "DRAFT" },
          {
            $set: {
              status: op.type === "LOAN" ? "ACTIVE" : "COMPLETED",
              dispatchedBy: actor.userId,
              dispatchedAt: new Date(),
              closedBy: actor.userId,
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "OPERATION_CONCURRENT_UPDATE" });
      });
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "OPERATION_COMPLETED",
      entityType: "OperationDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
    });
    return this.get(id);
  }

  async updateDraft(
    id: string,
    input: CreateOperationDto,
    actor: CurrentActor,
  ) {
    await this.validate(input);
    const updated = await this.operations.findOneAndUpdate(
      { _id: id, type: "ISSUE", status: "DRAFT" },
      {
        $set: {
          ...input,
          code: input.code.trim().toUpperCase(),
          reason: input.reason.trim(),
          updatedBy: actor.userId,
          lines: input.lines.map((line) => ({
            ...line,
            returned: false,
            note: line.note?.trim(),
          })),
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) throw new ConflictException({ code: "ISSUE_NOT_EDITABLE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "ISSUE_DRAFT_UPDATED",
      entityType: "OperationDocument",
      entityId: updated._id,
      outcome: "SUCCESS",
    });
    return { data: await updated.populate(populate) };
  }

  async removeDraft(id: string, actor: CurrentActor) {
    const removed = await this.operations.findOneAndDelete({
      _id: id,
      type: "ISSUE",
      status: "DRAFT",
    });
    if (!removed) throw new ConflictException({ code: "ISSUE_NOT_EDITABLE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "ISSUE_DRAFT_DELETED",
      entityType: "OperationDocument",
      entityId: removed._id,
      outcome: "SUCCESS",
    });
    return { data: { id } };
  }

  async receive(id: string, input: ReceiveOperationDto, actor: CurrentActor) {
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations.findById(id).session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (op.type === "LOAN") {
          await this.returnLoan(op, input, actor, session);
          return;
        }
        if (op.type !== "TRANSFER" || op.status !== "IN_TRANSIT")
          throw new ConflictException({
            code: "OPERATION_NOT_READY_TO_RECEIVE",
          });
        for (let i = 0; i < op.lines.length; i += 1) {
          const line = op.lines[i];
          if (line.kind === "DEVICE" && line.deviceId) {
            const changed = await this.devices.updateOne(
              {
                _id: line.deviceId,
                usageStatus: "IN_TRANSIT",
                warehouseId: op.sourceWarehouseId,
              },
              {
                $set: {
                  warehouseId: op.destinationWarehouseId,
                  locationId: op.destinationLocationId,
                  usageStatus: "IN_STOCK",
                },
              },
              { session },
            );
            if (changed.modifiedCount !== 1)
              throw new ConflictException({ code: "DEVICE_NOT_IN_TRANSIT" });
          } else if (line.kind === "PART" && line.partId)
            await this.addBalance(
              line.partId,
              op.destinationWarehouseId!,
              line.quantity,
              "TRANSFER_IN",
              op,
              i,
              actor,
              session,
            );
        }
        await this.operations.updateOne(
          { _id: op._id, status: "IN_TRANSIT" },
          {
            $set: {
              status: "COMPLETED",
              receivedBy: actor.userId,
              receivedAt: new Date(),
              closedBy: actor.userId,
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return this.get(id);
  }
  async reject(id: string, reason: string, actor: CurrentActor) {
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations.findById(id).session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (op.type !== "TRANSFER" || op.status !== "IN_TRANSIT")
          throw new ConflictException({
            code: "OPERATION_NOT_READY_TO_REJECT",
          });
        for (let i = 0; i < op.lines.length; i += 1) {
          const line = op.lines[i];
          if (line.kind === "DEVICE" && line.deviceId)
            await this.devices.updateOne(
              { _id: line.deviceId, usageStatus: "IN_TRANSIT" },
              { $set: { usageStatus: "IN_STOCK" } },
              { session },
            );
          else if (line.partId)
            await this.addBalance(
              line.partId,
              op.sourceWarehouseId!,
              line.quantity,
              "TRANSFER_IN",
              op,
              i,
              actor,
              session,
            );
        }
        await this.operations.updateOne(
          { _id: op._id, status: "IN_TRANSIT" },
          {
            $set: {
              status: "REJECTED",
              receivedBy: actor.userId,
              receivedAt: new Date(),
              rejectionReason: reason.trim(),
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return this.get(id);
  }

  private async applyLine(
    op: HydratedDocument<OperationDocument>,
    index: number,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    const line = op.lines[index];
    if (line.kind === "PART") {
      if (!op.sourceWarehouseId)
        throw new BadRequestException({ code: "SOURCE_WAREHOUSE_REQUIRED" });
      await this.takeBalance(
        line.partId!,
        op.sourceWarehouseId,
        line.quantity,
        "ISSUE",
        op,
        index,
        actor,
        session,
      );
      return;
    }
    const sourceStates =
      op.type === "RECOVERY" ? ["IN_USE", "LENT"] : ["IN_STOCK"];
    const filter: Record<string, unknown> = {
      _id: line.deviceId,
      usageStatus: { $in: sourceStates },
      isActive: true,
    };
    if (op.type !== "RECOVERY") filter.warehouseId = op.sourceWarehouseId;
    if (op.type === "RECOVERY" && op.senderKeeperId)
      filter.keeperId = op.senderKeeperId;
    const set: Record<string, unknown> = {
      techCondition: line.handoverCondition ?? "GOOD",
    };
    if (op.type === "ISSUE")
      Object.assign(set, {
        usageStatus: "IN_USE",
        keeperId: op.receiverKeeperId,
        departmentId: op.receiverDepartmentId,
        locationId: op.destinationLocationId,
      });
    if (op.type === "LOAN")
      Object.assign(set, {
        usageStatus: "LENT",
        keeperId: op.receiverKeeperId,
        departmentId: op.receiverDepartmentId,
        locationId: op.destinationLocationId,
      });
    if (op.type === "RECOVERY")
      Object.assign(set, {
        warehouseId: op.destinationWarehouseId,
        locationId: op.destinationLocationId,
        usageStatus:
          line.handoverCondition === "BROKEN" ? "REPAIRING" : "IN_STOCK",
        keeperId: undefined,
        departmentId: undefined,
      });
    const changed = await this.devices.updateOne(
      filter,
      {
        $set: set,
        $unset: op.type === "RECOVERY" ? { keeperId: 1, departmentId: 1 } : {},
      },
      { session },
    );
    if (changed.modifiedCount !== 1)
      throw new ConflictException({ code: "DEVICE_NOT_AVAILABLE" });
  }
  private async dispatchTransfer(
    op: HydratedDocument<OperationDocument>,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    for (let i = 0; i < op.lines.length; i += 1) {
      const line = op.lines[i];
      if (line.kind === "DEVICE") {
        const changed = await this.devices.updateOne(
          {
            _id: line.deviceId,
            warehouseId: op.sourceWarehouseId,
            usageStatus: "IN_STOCK",
            isActive: true,
          },
          { $set: { usageStatus: "IN_TRANSIT" } },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "DEVICE_NOT_AVAILABLE" });
      } else
        await this.takeBalance(
          line.partId!,
          op.sourceWarehouseId!,
          line.quantity,
          "TRANSFER_OUT",
          op,
          i,
          actor,
          session,
        );
    }
    await this.operations.updateOne(
      { _id: op._id, status: "DRAFT" },
      {
        $set: {
          status: "IN_TRANSIT",
          dispatchedBy: actor.userId,
          dispatchedAt: new Date(),
        },
      },
      { session },
    );
  }
  private async returnLoan(
    op: HydratedDocument<OperationDocument>,
    input: ReceiveOperationDto,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    if (
      op.type !== "LOAN" ||
      !["ACTIVE", "PARTIALLY_RETURNED"].includes(op.status)
    )
      throw new ConflictException({ code: "LOAN_NOT_RETURNABLE" });
    const selected = new Set(
      input.deviceIds ??
        op.lines
          .filter((line) => line.kind === "DEVICE" && !line.returned)
          .map((line) => String(line.deviceId)),
    );
    let returned = 0;
    for (const line of op.lines)
      if (
        line.kind === "DEVICE" &&
        !line.returned &&
        selected.has(String(line.deviceId))
      ) {
        const changed = await this.devices.updateOne(
          {
            _id: line.deviceId,
            usageStatus: "LENT",
            keeperId: op.receiverKeeperId,
          },
          {
            $set: {
              warehouseId: op.destinationWarehouseId ?? op.sourceWarehouseId,
              locationId: op.destinationLocationId,
              usageStatus: "IN_STOCK",
            },
            $unset: { keeperId: 1, departmentId: 1 },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "DEVICE_NOT_ON_LOAN" });
        line.returned = true;
        returned += 1;
      }
    if (!returned)
      throw new BadRequestException({ code: "RETURN_LINE_REQUIRED" });
    const allReturned = op.lines
      .filter((line) => line.kind === "DEVICE")
      .every((line) => line.returned);
    op.status = allReturned ? "RETURNED" : "PARTIALLY_RETURNED";
    if (allReturned) op.dueDate = undefined;
    op.receivedBy = actor.userId;
    op.receivedAt = new Date();
    await op.save({ session });
  }
  private async takeBalance(
    partId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    quantity: number,
    type: string,
    op: HydratedDocument<OperationDocument>,
    lineIndex: number,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    const balance = await this.balances.findOneAndUpdate(
      { partId, warehouseId, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true, session },
    );
    if (!balance) throw new ConflictException({ code: "INSUFFICIENT_STOCK" });
    await this.transactions.create(
      [
        {
          partId,
          warehouseId,
          quantity,
          type,
          createdBy: actor.userId,
          operationId: op._id,
          lineIndex,
          note: `${op.type} ${op.code}`,
        },
      ],
      { session },
    );
  }
  private async addBalance(
    partId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    quantity: number,
    type: string,
    op: HydratedDocument<OperationDocument>,
    lineIndex: number,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    await this.balances.findOneAndUpdate(
      { partId, warehouseId },
      { $inc: { quantity }, $setOnInsert: { partId, warehouseId } },
      { upsert: true, session },
    );
    await this.transactions.create(
      [
        {
          partId,
          warehouseId,
          quantity,
          type,
          createdBy: actor.userId,
          operationId: op._id,
          lineIndex,
          note: `${op.type} ${op.code}`,
        },
      ],
      { session },
    );
  }
  private async validate(input: CreateOperationDto) {
    if (
      (input.type === "ISSUE" || input.type === "LOAN") &&
      !input.receiverKeeperId
    )
      throw new BadRequestException({ code: "RECEIVER_REQUIRED" });
    if (input.type === "LOAN" && !input.dueDate)
      throw new BadRequestException({ code: "LOAN_DUE_DATE_REQUIRED" });
    if (
      input.type === "TRANSFER" &&
      (!input.sourceWarehouseId ||
        !input.destinationWarehouseId ||
        input.sourceWarehouseId === input.destinationWarehouseId)
    )
      throw new BadRequestException({ code: "TRANSFER_WAREHOUSE_INVALID" });
    if (input.type !== "RECOVERY" && !input.sourceWarehouseId)
      throw new BadRequestException({ code: "SOURCE_WAREHOUSE_REQUIRED" });
    if (input.type === "RECOVERY" && !input.destinationWarehouseId)
      throw new BadRequestException({ code: "DESTINATION_WAREHOUSE_REQUIRED" });
    const deviceIds = input.lines
      .filter((line) => line.kind === "DEVICE")
      .map((line) => line.deviceId);
    if (
      deviceIds.some((id) => !id) ||
      new Set(deviceIds).size !== deviceIds.length
    )
      throw new BadRequestException({ code: "OPERATION_DEVICE_INVALID" });
    if (
      input.lines.some(
        (line) =>
          (line.kind === "PART" && !line.partId) ||
          (line.kind === "DEVICE" && line.quantity !== 1),
      )
    )
      throw new BadRequestException({ code: "OPERATION_LINE_INVALID" });
    if (
      input.receiverKeeperId &&
      !(await this.keepers.exists({
        _id: input.receiverKeeperId,
        isActive: true,
      }))
    )
      throw new BadRequestException({ code: "KEEPER_REFERENCE_INVALID" });
  }
}
