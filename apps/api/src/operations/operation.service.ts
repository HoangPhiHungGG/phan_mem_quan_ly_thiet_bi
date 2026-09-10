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
import { Device, Part, PartSerial } from "../equipment/equipment.schemas";
import { Department, Warehouse } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { IdempotencyKey } from "../receipts/receipt.schemas";
import { CreateOperationDto, ReceiveOperationDto } from "./operation.dto";
import { LoanService } from "./loan.service";
import { ReturnLoanDto } from "./operation.dto";
import { OperationDocument } from "./operation.schemas";

const populate = [
  { path: "sourceWarehouseId", select: "code name" },
  { path: "destinationWarehouseId", select: "code name" },
  { path: "receiverKeeperId", select: "code displayName employeeCode" },
  { path: "senderKeeperId", select: "code displayName employeeCode" },
  { path: "receiverDepartmentId", select: "code name" },
  { path: "issueId", select: "code status operationDate" },
  {
    path: "lines.deviceId",
    select: "assetCode serial modelId usageStatus techCondition warehouseId",
    populate: { path: "modelId", select: "code name manufacturer" },
  },
  {
    path: "lines.partId",
    select: "code name trackingMode unitId",
    populate: { path: "unitId", select: "code name" },
  },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "dispatchedBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  { path: "closedBy", select: "displayName employeeCode" },
  { path: "updatedBy", select: "displayName employeeCode" },
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
    @InjectModel(PartSerial.name)
    private readonly partSerials: Model<PartSerial>,
    private readonly loans: LoanService,
  ) {}

  async list(query: Record<string, string | undefined>) {
    if (query.type === "LOAN") return this.loans.list(query);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.status)
      filter.status =
        query.type === "ISSUE" && query.status === "PENDING"
          ? { $in: ["PENDING", "DRAFT"] }
          : query.status;
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
    this.validateId(id);
    if (await this.operations.exists({ _id: id, type: "LOAN" }))
      return this.loans.get(id);
    const item = await this.operations.findById(id).populate(populate).lean();
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: item };
  }
  async getRecoverableItems(id: string) {
    this.validateId(id);
    const issue = await this.operations.findById(id).populate(populate).lean();
    if (!issue) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (issue.type !== "ISSUE")
      throw new BadRequestException({ code: "NOT_AN_ISSUE" });
    if (issue.status !== "COMPLETED")
      throw new BadRequestException({ code: "ISSUE_NOT_COMPLETED" });

    // Find all completed RECOVERY operations that reference this issue
    const recoveries = await this.operations
      .find({
        type: "RECOVERY",
        issueId: issue._id,
        status: "COMPLETED",
      })
      .select("lines")
      .lean();

    // Build a map of recovered quantities per device/part
    const recoveredDeviceIds = new Set<string>();
    const recoveredPartQuantities = new Map<string, number>();
    for (const recovery of recoveries) {
      for (const line of recovery.lines ?? []) {
        if (line.kind === "DEVICE" && line.deviceId) {
          recoveredDeviceIds.add(this.referenceId(line.deviceId));
        } else if (line.kind === "PART" && line.partId) {
          const key = this.referenceId(line.partId);
          recoveredPartQuantities.set(
            key,
            (recoveredPartQuantities.get(key) ?? 0) + (line.quantity ?? 0),
          );
        }
      }
    }

    // Build list of recoverable items
    const items = [];
    for (let i = 0; i < issue.lines.length; i += 1) {
      const line = issue.lines[i];
      if (line.kind === "DEVICE" && line.deviceId) {
        const deviceId = this.referenceId(line.deviceId);
        if (recoveredDeviceIds.has(deviceId)) continue; // Already recovered
        // After populate, deviceId may be an object with device info
        const deviceInfo =
          typeof line.deviceId === "object" &&
          line.deviceId !== null &&
          "assetCode" in line.deviceId
            ? (line.deviceId as { assetCode?: string; serial?: string })
            : null;
        items.push({
          lineIndex: i,
          kind: "DEVICE",
          deviceId,
          quantity: 1,
          recovered: 0,
          remaining: 1,
          handoverCondition: line.handoverCondition,
          deviceName: deviceInfo?.assetCode ?? line.deviceName,
          assetCode: deviceInfo?.assetCode ?? line.assetCode,
          serial: deviceInfo?.serial ?? line.serial,
        });
      } else if (line.kind === "PART" && line.partId) {
        const partId = this.referenceId(line.partId);
        const recovered = recoveredPartQuantities.get(partId) ?? 0;
        const remaining = (line.quantity ?? 0) - recovered;
        if (remaining <= 0) continue; // Fully recovered
        // After populate, partId may be an object with part info
        const partInfo =
          typeof line.partId === "object" &&
          line.partId !== null &&
          "code" in line.partId
            ? (line.partId as { code?: string; name?: string })
            : null;
        items.push({
          lineIndex: i,
          kind: "PART",
          partId,
          quantity: line.quantity ?? 0,
          recovered,
          remaining,
          handoverCondition: line.handoverCondition,
          partName: partInfo?.name ?? partInfo?.code ?? line.deviceName,
          partCode: partInfo?.code,
        });
      }
    }

    return {
      data: {
        issue: {
          _id: issue._id,
          code: issue.code,
          status: issue.status,
          operationDate: issue.operationDate,
          sourceWarehouseId: issue.sourceWarehouseId,
          receiverKeeperId: issue.receiverKeeperId,
          receiverDepartmentId: issue.receiverDepartmentId,
        },
        items,
      },
    };
  }

  private referenceId(value: unknown): string {
    if (value && typeof value === "object" && "_id" in value)
      return String(value._id);
    return String(value);
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
          status: {
            $in: [
              "DRAFT",
              "PENDING",
              "IN_TRANSIT",
              "PARTIAL",
              "COMPLETED",
              "ACTIVE",
              "PARTIALLY_RETURNED",
              "RETURNED",
            ],
          },
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
    return this.loans.list({ overdue: "true", limit: "100" });
  }

  async create(input: CreateOperationDto, actor: CurrentActor, key?: string) {
    if (input.type === "LOAN") return this.loans.create(input, actor, key);
    await this.validate(input);
    let code =
      input.type === "ISSUE" ? undefined : input.code?.trim().toUpperCase();
    if (input.type !== "ISSUE" && !code)
      throw new BadRequestException({ code: "OPERATION_CODE_REQUIRED" });
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          ...input,
          code: input.type === "ISSUE" ? undefined : code,
        }),
      )
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
    if (input.type === "ISSUE") code = await this.generateIssueCode();
    try {
      const operation = await this.operations.create({
        ...input,
        code,
        reason: input.reason.trim(),
        operationDate: input.operationDate,
        dueDate: input.dueDate,
        status: input.type === "ISSUE" ? "PENDING" : "DRAFT",
        createdBy: actor.userId,
        issueId: input.issueId ? new Types.ObjectId(input.issueId) : undefined,
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
    this.validateId(id);
    if (await this.operations.exists({ _id: id, type: "LOAN" }))
      return this.loans.complete(id, actor);
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations.findById(id).session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (
          !(op.type === "ISSUE"
            ? ["PENDING", "DRAFT"].includes(op.status)
            : op.status === "DRAFT")
        )
          throw new ConflictException({ code: "OPERATION_NOT_EDITABLE" });
        if (op.type === "ISSUE") await this.validateIssue(op, session);
        if (op.type === "TRANSFER") {
          await this.dispatchTransfer(op, actor, session);
          return;
        }
        for (let i = 0; i < op.lines.length; i += 1)
          await this.applyLine(op, i, actor, session);
        const changed = await this.operations.updateOne(
          { _id: op._id, status: op.status },
          {
            $set: {
              status: op.type === "LOAN" ? "ACTIVE" : "COMPLETED",
              dispatchedBy: actor.userId,
              dispatchedAt: new Date(),
              closedBy: actor.userId,
              closedAt: new Date(),
              ...(op.type === "ISSUE"
                ? {
                    completedBy: actor.userId,
                    completedAt: new Date(),
                    lines: op.lines,
                  }
                : {}),
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
    this.validateId(id);
    if (await this.operations.exists({ _id: id, type: "LOAN" }))
      return this.loans.update(id, input, actor);
    if (input.type !== "ISSUE")
      throw new BadRequestException({ code: "OPERATION_TYPE_IMMUTABLE" });
    await this.validate(input);
    const { code: _code, ...rest } = input;
    void _code;
    const updateData: Record<string, unknown> = {
      ...rest,
      reason: rest.reason.trim(),
      updatedBy: actor.userId,
      lines: rest.lines.map((line) => ({
        ...line,
        returned: false,
        note: line.note?.trim(),
      })),
    };
    updateData.status = "PENDING";
    const updated = await this.operations.findOneAndUpdate(
      { _id: id, type: "ISSUE", status: { $in: ["PENDING", "DRAFT"] } },
      { $set: updateData },
      { new: true, runValidators: true },
    );
    if (!updated) throw new ConflictException({ code: "ISSUE_NOT_EDITABLE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "ISSUE_UPDATED",
      entityType: "OperationDocument",
      entityId: updated._id,
      outcome: "SUCCESS",
    });
    return { data: await updated.populate(populate) };
  }

  async removeDraft(id: string, actor: CurrentActor) {
    this.validateId(id);
    if (await this.operations.exists({ _id: id, type: "LOAN" }))
      return this.loans.remove(id, actor);
    const removed = await this.operations.findOneAndDelete({
      _id: id,
      type: { $in: ["ISSUE", "RECOVERY"] },
      status: { $in: ["PENDING", "DRAFT"] },
    });
    if (!removed)
      throw new ConflictException({
        code: "OPERATION_NOT_EDITABLE",
      });
    await this.audit.write({
      actorUserId: actor.userId,
      action: `${removed.type}_DELETED`,
      entityType: "OperationDocument",
      entityId: removed._id,
      outcome: "SUCCESS",
    });
    return { data: { id } };
  }

  async returnDevices(id: string, input: ReturnLoanDto, actor: CurrentActor) {
    return this.loans.returnDevices(id, input, actor);
  }

  async receive(id: string, input: ReceiveOperationDto, actor: CurrentActor) {
    this.validateId(id);
    if (await this.operations.exists({ _id: id, type: "LOAN" })) {
      if (!input.returnedAt || !input.items)
        throw new BadRequestException({ code: "LOAN_RETURN_REQUIRED" });
      return this.loans.returnDevices(
        id,
        { returnedAt: input.returnedAt, items: input.items, note: input.note },
        actor,
      );
    }
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations.findById(id).session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });

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
      if (op.type === "ISSUE") {
        const serials = await this.partSerials
          .find({
            partId: line.partId,
            warehouseId: op.sourceWarehouseId,
            status: "IN_STOCK",
          })
          .sort({ serial: 1 })
          .limit(line.quantity)
          .session(session);
        line.serials = serials.map((item) => item.serial);
        if (serials.length) {
          const changed = await this.partSerials.updateMany(
            {
              _id: { $in: serials.map((item) => item._id) },
              status: "IN_STOCK",
            },
            { $set: { status: "ISSUED" }, $unset: { locationId: 1 } },
            { session },
          );
          if (changed.modifiedCount !== serials.length)
            throw new ConflictException({ code: "DEVICE_NOT_AVAILABLE" });
        }
      }
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
    if (op.type === "ISSUE")
      Object.assign(filter, {
        techCondition: { $ne: "BROKEN" },
        keeperId: null,
      });
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
        usageStatus: ["BROKEN", "MISSING_ACCESSORIES", "OTHER"].includes(
          line.receivedCondition ?? "",
        )
          ? "REPAIRING"
          : line.receivedCondition === "LOST"
            ? "LOST"
            : "IN_STOCK",
        keeperId: undefined,
        departmentId: undefined,
      });
    const changed = await this.devices.updateOne(
      filter,
      {
        $set: set,
        $unset:
          op.type === "RECOVERY"
            ? { keeperId: 1, departmentId: 1 }
            : op.type === "ISSUE" && !op.destinationLocationId
              ? { locationId: 1 }
              : {},
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
    if (!input.lines?.length || !input.reason?.trim())
      throw new BadRequestException({ code: "OPERATION_LINE_INVALID" });
    if (input.type === "ISSUE") await this.validateIssue(input);
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
    if (input.type === "RECOVERY") {
      // Recovery requires issueId and destinationWarehouseId
      if (!input.issueId)
        throw new BadRequestException({ code: "RECOVERY_ISSUE_REQUIRED" });
      if (!input.destinationWarehouseId)
        throw new BadRequestException({
          code: "DESTINATION_WAREHOUSE_REQUIRED",
        });
      // Validate that the issue exists and is COMPLETED
      const issue = await this.operations
        .findOne({ _id: input.issueId, type: "ISSUE", status: "COMPLETED" })
        .lean();
      if (!issue)
        throw new BadRequestException({ code: "RECOVERY_ISSUE_INVALID" });
      // Auto-populate from issue if not provided
      if (!input.sourceWarehouseId)
        input.sourceWarehouseId = String(issue.sourceWarehouseId);
      if (!input.receiverKeeperId)
        input.receiverKeeperId = String(issue.receiverKeeperId);
      if (!input.receiverDepartmentId)
        input.receiverDepartmentId = String(issue.receiverDepartmentId);
    } else {
      if (!input.sourceWarehouseId)
        throw new BadRequestException({ code: "SOURCE_WAREHOUSE_REQUIRED" });
    }
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
    if (input.type !== "ISSUE" && !input.code?.trim())
      throw new BadRequestException({ code: "OPERATION_CODE_REQUIRED" });
  }

  private validateId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException({ code: "OPERATION_ID_INVALID" });
  }

  private async validateIssue(
    input:
      | Pick<
          CreateOperationDto,
          | "sourceWarehouseId"
          | "receiverKeeperId"
          | "receiverDepartmentId"
          | "destinationLocationId"
          | "lines"
          | "reason"
        >
      | OperationDocument,
    session: ClientSession | null = null,
  ) {
    if (
      !input.reason?.trim() ||
      !input.lines?.length ||
      !input.sourceWarehouseId ||
      !input.receiverKeeperId ||
      !input.receiverDepartmentId
    )
      throw new BadRequestException({ code: "ISSUE_REQUIRED_FIELDS" });
    for (const [model, id] of [
      [this.warehouses, input.sourceWarehouseId],
      [this.keepers, input.receiverKeeperId],
      [this.departments, input.receiverDepartmentId],
    ] as const) {
      if (
        !(await (model as Model<Warehouse>)
          .exists({ _id: id, isActive: true })
          .session(session))
      )
        throw new BadRequestException({ code: "ISSUE_REFERENCE_INVALID" });
    }
    if (
      input.destinationLocationId &&
      !(await this.locations
        .exists({ _id: input.destinationLocationId, isActive: true })
        .session(session))
    )
      throw new BadRequestException({ code: "ISSUE_REFERENCE_INVALID" });
    const seen = new Set<string>();
    const quantities = new Map<string, number>();
    for (const line of input.lines) {
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        !["GOOD", "DEGRADED", "BROKEN"].includes(line.handoverCondition ?? "")
      )
        throw new BadRequestException({ code: "OPERATION_LINE_INVALID" });
      if (line.kind === "DEVICE") {
        if (
          !line.deviceId ||
          line.partId ||
          line.quantity !== 1 ||
          seen.has(String(line.deviceId))
        )
          throw new BadRequestException({ code: "OPERATION_DEVICE_INVALID" });
        seen.add(String(line.deviceId));
        if (
          !(await this.devices
            .exists({
              _id: line.deviceId,
              warehouseId: input.sourceWarehouseId,
              usageStatus: "IN_STOCK",
              techCondition: { $ne: "BROKEN" },
              keeperId: null,
              isActive: true,
            })
            .session(session))
        )
          throw new ConflictException({ code: "DEVICE_NOT_AVAILABLE" });
      } else if (line.kind === "PART" && line.partId && !line.deviceId) {
        quantities.set(
          String(line.partId),
          (quantities.get(String(line.partId)) ?? 0) + line.quantity,
        );
      } else throw new BadRequestException({ code: "OPERATION_LINE_INVALID" });
    }
    for (const [partId, quantity] of quantities) {
      if (
        !(await this.parts
          .exists({ _id: partId, isActive: true })
          .session(session))
      )
        throw new BadRequestException({ code: "PART_REFERENCE_INVALID" });
      if (
        !(await this.balances
          .exists({
            partId,
            warehouseId: input.sourceWarehouseId,
            quantity: { $gte: quantity },
          })
          .session(session))
      )
        throw new ConflictException({ code: "INSUFFICIENT_STOCK" });
    }
  }

  private async generateIssueCode(): Promise<string> {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replace(/-/g, "");
    const prefix = `ISSUE-${today}-`;
    // Bootstrap from existing codes; an atomic, persistent counter handles concurrent requests and deletions.
    const existing = await this.operations
      .find({ code: new RegExp(`^${prefix}`) })
      .select("code")
      .lean();
    const maximum = existing.reduce(
      (max, item) => Math.max(max, Number(item.code.slice(prefix.length)) || 0),
      0,
    );
    const counters = this.operations.db.collection<{
      _id: string;
      seq: number;
    }>("operation_counters");
    const counter = await counters.findOneAndUpdate(
      { _id: prefix },
      [
        {
          $set: {
            seq: { $add: [{ $max: [{ $ifNull: ["$seq", 0] }, maximum] }, 1] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    return `${prefix}${String(counter!.seq).padStart(3, "0")}`;
  }
}
