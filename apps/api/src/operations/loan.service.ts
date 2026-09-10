import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { ClientSession, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import { CurrentActor } from "../auth/auth.types";
import { Keeper, Location } from "../catalog/catalog.schemas";
import { Device } from "../equipment/equipment.schemas";
import { Department, Warehouse } from "../identity/identity.schemas";
import { IdempotencyKey } from "../receipts/receipt.schemas";
import { CreateOperationDto, ReturnLoanDto } from "./operation.dto";
import {
  OperationDocument,
  OperationLine,
  LoanReturnItem,
} from "./operation.schemas";
import {
  LOAN_IN_CONDITIONS,
  LOAN_OPEN_STATUSES,
  LOAN_OUT_CONDITIONS,
  loanDay,
  loanOverdueDays,
} from "./loan.constants";

export const loanPopulate = [
  { path: "sourceWarehouseId", select: "code name" },
  { path: "receiverKeeperId", select: "displayName employeeCode code" },
  { path: "receiverDepartmentId", select: "name code" },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "dispatchedBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  {
    path: "lines.deviceId",
    select: "assetCode serial usageStatus techCondition",
  },
  { path: "lines.returnReceivedBy", select: "displayName employeeCode" },
  { path: "returnHistory.receivedBy", select: "displayName employeeCode" },
];

@Injectable()
export class LoanService {
  constructor(
    @InjectModel(OperationDocument.name)
    private readonly operations: Model<OperationDocument>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(Keeper.name) private readonly keepers: Model<Keeper>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(Location.name) private readonly locations: Model<Location>,
    @InjectModel(IdempotencyKey.name)
    private readonly keys: Model<IdempotencyKey>,
    private readonly audit: AuditService,
  ) {}

  private id(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException({ code: "OPERATION_ID_INVALID" });
  }
  private summary<
    T extends {
      status: string;
      dueDate?: Date;
      lines: { kind: string; returned?: boolean }[];
    },
  >(op: T) {
    const deviceLines = op.lines.filter((line) => line.kind === "DEVICE");
    const returnedCount = deviceLines.filter((line) => line.returned).length;
    const remainingCount = deviceLines.length - returnedCount;
    return {
      ...op,
      deviceCount: deviceLines.length,
      returnedCount,
      remainingCount,
      overdueDays:
        LOAN_OPEN_STATUSES.includes(op.status) && remainingCount > 0
          ? loanOverdueDays(op.dueDate)
          : 0,
    };
  }
  async get(id: string) {
    this.id(id);
    const op = await this.operations
      .findOne({ _id: id, type: "LOAN" })
      .populate(loanPopulate)
      .lean();
    if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: this.summary(op) };
  }
  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(
      100,
      Math.max(1, Math.trunc(Number(query.limit) || 20)),
    );
    const filter: Record<string, unknown> = { type: "LOAN" };
    if (query.returnable === "true") {
      filter.status = { $in: LOAN_OPEN_STATUSES };
      filter.lines = {
        $elemMatch: { kind: "DEVICE", returned: { $ne: true } },
      };
    } else if (query.status)
      filter.status =
        query.status === "PENDING"
          ? { $in: ["PENDING", "DRAFT"] }
          : query.status;
    if (query.overdue === "true") {
      filter.status = { $in: LOAN_OPEN_STATUSES };
      filter.lines = {
        $elemMatch: { kind: "DEVICE", returned: { $ne: true } },
      };
      filter.dueDate = {
        $lt: new Date(`${loanDay(new Date())}T00:00:00+07:00`),
      };
    }
    if (query.warehouseId) {
      this.id(query.warehouseId);
      filter.sourceWarehouseId = query.warehouseId;
    }
    if (query.q?.trim()) {
      const match = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      const [keepers, departments, devices] = await Promise.all([
        this.keepers
          .find({
            $or: [
              { displayName: match },
              { employeeCode: match },
              { code: match },
            ],
          })
          .select("_id")
          .lean(),
        this.departments
          .find({ $or: [{ name: match }, { code: match }] })
          .select("_id")
          .lean(),
        this.devices
          .find({ $or: [{ assetCode: match }, { serial: match }] })
          .select("_id")
          .lean(),
      ]);
      filter.$or = [
        { code: match },
        { receiverKeeperId: { $in: keepers.map((item) => item._id) } },
        { receiverDepartmentId: { $in: departments.map((item) => item._id) } },
        { "lines.deviceId": { $in: devices.map((item) => item._id) } },
        { "lines.deviceName": match },
        { "lines.assetCode": match },
        { "lines.serial": match },
      ];
    }
    const [rows, total] = await Promise.all([
      this.operations
        .find(filter)
        .populate(loanPopulate)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.operations.countDocuments(filter),
    ]);
    return {
      data: rows.map((op) => this.summary(op)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private unavailable(deviceId: string, assetCode?: string): never {
    throw new ConflictException({
      code: "LOAN_DEVICE_UNAVAILABLE",
      deviceId,
      message: `Thiết bị ${assetCode ?? deviceId} không còn khả dụng để cho mượn. Hãy tải lại danh sách.`,
    });
  }
  private async prepare(
    input: CreateOperationDto,
    session: ClientSession | null = null,
  ) {
    if (
      input.type !== "LOAN" ||
      !input.receiverKeeperId ||
      !input.sourceWarehouseId ||
      !input.operationDate ||
      !input.dueDate ||
      !input.reason?.trim() ||
      !input.lines?.length
    )
      throw new BadRequestException({ code: "LOAN_REQUIRED_FIELDS" });
    if (input.destinationWarehouseId || input.destinationLocationId)
      throw new BadRequestException({ code: "LOAN_DESTINATION_NOT_ALLOWED" });
    if (
      !Number.isFinite(Date.parse(input.operationDate)) ||
      !Number.isFinite(Date.parse(input.dueDate)) ||
      loanDay(new Date(input.dueDate)) < loanDay(new Date(input.operationDate))
    )
      throw new BadRequestException({ code: "LOAN_DUE_DATE_INVALID" });
    const keeper = await this.keepers
      .findOne({ _id: input.receiverKeeperId, isActive: true })
      .session(session)
      .lean();
    const departmentId =
      input.receiverDepartmentId ||
      (keeper?.departmentId ? String(keeper.departmentId) : undefined);
    if (
      !keeper ||
      !departmentId ||
      !(await this.departments
        .exists({ _id: departmentId, isActive: true })
        .session(session)) ||
      !(await this.warehouses
        .exists({ _id: input.sourceWarehouseId, isActive: true })
        .session(session))
    )
      throw new BadRequestException({ code: "LOAN_REFERENCE_INVALID" });
    const seen = new Set<string>();
    const lines: OperationLine[] = [];
    for (const line of input.lines) {
      if (
        line.kind !== "DEVICE" ||
        !line.deviceId ||
        line.partId ||
        line.quantity !== 1 ||
        seen.has(line.deviceId)
      )
        throw new BadRequestException({ code: "LOAN_DEVICE_INVALID" });
      seen.add(line.deviceId);
      const conditionOut =
        line.conditionOut ??
        (line.handoverCondition === "GOOD"
          ? "GOOD"
          : line.handoverCondition === "DEGRADED"
            ? "MINOR_FAULT"
            : undefined);
      if (
        !LOAN_OUT_CONDITIONS.includes(
          conditionOut as (typeof LOAN_OUT_CONDITIONS)[number],
        ) ||
        (conditionOut === "OTHER" && !line.conditionOutDescription?.trim())
      )
        throw new BadRequestException({ code: "LOAN_CONDITION_REQUIRED" });
      const device = await this.devices
        .findById(line.deviceId)
        .populate<{ modelId?: { name?: string } }>("modelId", "name")
        .session(session)
        .lean();
      if (
        !device ||
        !device.isActive ||
        device.usageStatus !== "IN_STOCK" ||
        device.techCondition === "BROKEN" ||
        String(device.warehouseId) !== input.sourceWarehouseId ||
        device.keeperId ||
        device.loanId
      )
        this.unavailable(line.deviceId, device?.assetCode);
      lines.push({
        kind: "DEVICE",
        deviceId: device._id,
        quantity: 1,
        returned: false,
        conditionOut,
        conditionOutDescription: line.conditionOutDescription?.trim(),
        accessoryNote: line.accessoryNote?.trim(),
        note: line.note?.trim(),
        handoverCondition: ["GOOD", "NORMAL"].includes(conditionOut!)
          ? "GOOD"
          : "DEGRADED",
        deviceName: device.modelId?.name ?? device.assetCode,
        assetCode: device.assetCode,
        serial: device.serial,
      });
    }
    return { receiverDepartmentId: departmentId, lines };
  }
  private async code() {
    const prefix = `LOAN-${loanDay(new Date()).replace(/-/g, "")}-`;
    const existing = await this.operations
      .find({ code: new RegExp(`^${prefix}`) })
      .select("code")
      .lean();
    const maximum = existing.reduce(
      (max, row) => Math.max(max, Number(row.code.slice(prefix.length)) || 0),
      0,
    );
    const collection = this.operations.db.collection<{
      _id: string;
      seq: number;
    }>("operation_counters");
    const row = await collection.findOneAndUpdate(
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
    return `${prefix}${String(row!.seq).padStart(3, "0")}`;
  }
  async create(input: CreateOperationDto, actor: CurrentActor, key?: string) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ ...input, code: undefined }))
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
    const prepared = await this.prepare(input);
    const code = await this.code();
    const session = await this.operations.db.startSession();
    let id: Types.ObjectId | undefined;
    try {
      await session.withTransaction(async () => {
        const [op] = await this.operations.create(
          [
            {
              type: "LOAN",
              code,
              operationDate: input.operationDate,
              dueDate: input.dueDate,
              sourceWarehouseId: input.sourceWarehouseId,
              receiverKeeperId: input.receiverKeeperId,
              ...prepared,
              reason: input.reason.trim(),
              note: input.note?.trim(),
              status: "PENDING",
              createdBy: actor.userId,
            },
          ],
          { session },
        );
        id = op._id;
        if (normalizedKey)
          await this.keys.create(
            [
              {
                key: normalizedKey,
                requestHash,
                actorUserId: actor.userId,
                operationId: id,
              },
            ],
            { session },
          );
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        if (normalizedKey) {
          const old = await this.keys
            .findOne({ key: normalizedKey, actorUserId: actor.userId })
            .lean();
          if (old?.requestHash === requestHash && old.operationId)
            return this.get(String(old.operationId));
        }
        throw new ConflictException({ code: "OPERATION_CONCURRENT_UPDATE" });
      }
      throw error;
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "LOAN_CREATED",
      entityType: "OperationDocument",
      entityId: id,
      outcome: "SUCCESS",
    });
    return this.get(String(id));
  }
  async update(id: string, input: CreateOperationDto, actor: CurrentActor) {
    this.id(id);
    const old = await this.operations.findOne({ _id: id, type: "LOAN" }).lean();
    if (!old) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!["DRAFT", "PENDING"].includes(old.status) || old.returnHistory?.length)
      throw new ConflictException({ code: "LOAN_NOT_EDITABLE" });
    const prepared = await this.prepare(input);
    const changed = await this.operations.findOneAndUpdate(
      {
        _id: id,
        type: "LOAN",
        status: { $in: ["DRAFT", "PENDING"] },
        "returnHistory.0": { $exists: false },
      },
      {
        $set: {
          ...prepared,
          receiverKeeperId: input.receiverKeeperId,
          sourceWarehouseId: input.sourceWarehouseId,
          operationDate: input.operationDate,
          dueDate: input.dueDate,
          reason: input.reason.trim(),
          note: input.note?.trim() ?? "",
          updatedBy: actor.userId,
          status: "PENDING",
        },
        $unset: { destinationWarehouseId: 1, destinationLocationId: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!changed) throw new ConflictException({ code: "LOAN_NOT_EDITABLE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "LOAN_UPDATED",
      entityType: "OperationDocument",
      entityId: changed._id,
      outcome: "SUCCESS",
    });
    return this.get(id);
  }
  async remove(id: string, actor: CurrentActor) {
    this.id(id);
    const changed = await this.operations.findOneAndDelete({
      _id: id,
      type: "LOAN",
      status: { $in: ["DRAFT", "PENDING"] },
      "returnHistory.0": { $exists: false },
    });
    if (!changed) throw new ConflictException({ code: "LOAN_NOT_EDITABLE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "LOAN_DELETED",
      entityType: "OperationDocument",
      entityId: changed._id,
      outcome: "SUCCESS",
    });
    return { data: { id } };
  }
  async complete(id: string, actor: CurrentActor) {
    this.id(id);
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations
          .findOne({ _id: id, type: "LOAN" })
          .session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (!["DRAFT", "PENDING"].includes(op.status))
          throw new ConflictException({ code: "LOAN_NOT_EDITABLE" });
        // Ignore legacy destination fields; loans always return to their original warehouse.
        const prepared = await this.prepare(
          {
            type: "LOAN",
            operationDate: op.operationDate.toISOString(),
            dueDate: op.dueDate?.toISOString(),
            sourceWarehouseId: String(op.sourceWarehouseId),
            receiverKeeperId: String(op.receiverKeeperId),
            receiverDepartmentId: op.receiverDepartmentId
              ? String(op.receiverDepartmentId)
              : undefined,
            reason: op.reason,
            lines: op.lines.map((line) => ({
              conditionOut: line.conditionOut,
              conditionOutDescription: line.conditionOutDescription,
              accessoryNote: line.accessoryNote,
              note: line.note,
              kind: line.kind,
              deviceId: line.deviceId ? String(line.deviceId) : undefined,
              partId: line.partId ? String(line.partId) : undefined,
              quantity: line.quantity,
              handoverCondition: line.handoverCondition as
                "GOOD" | "DEGRADED" | "BROKEN",
            })),
          },
          session,
        );
        const now = new Date();
        op.lines = prepared.lines;
        op.receiverDepartmentId = new Types.ObjectId(
          prepared.receiverDepartmentId,
        );
        for (const line of op.lines) {
          const device = await this.devices
            .findById(line.deviceId)
            .session(session);
          line.loanSourceLocationId = device?.locationId;
          line.handedOverAt = now;
          const changed = await this.devices.updateOne(
            {
              _id: line.deviceId,
              warehouseId: op.sourceWarehouseId,
              usageStatus: "IN_STOCK",
              techCondition: { $ne: "BROKEN" },
              isActive: true,
              keeperId: null,
              loanId: null,
            },
            {
              $set: {
                usageStatus: "LENT",
                keeperId: op.receiverKeeperId,
                departmentId: op.receiverDepartmentId,
                loanId: op._id,
                borrowedAt: op.operationDate,
                loanDueDate: op.dueDate,
                techCondition: line.handoverCondition,
              },
              $unset: { locationId: 1 },
            },
            { session },
          );
          if (changed.modifiedCount !== 1)
            this.unavailable(String(line.deviceId), line.assetCode);
        }
        op.status = "ACTIVE";
        op.dispatchedBy = actor.userId;
        op.dispatchedAt = now;
        op.completedBy = actor.userId;
        op.completedAt = now;
        op.destinationWarehouseId = undefined;
        op.destinationLocationId = undefined;
        await op.save({ session });
      });
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "LOAN_HANDED_OVER",
      entityType: "OperationDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
    });
    return this.get(id);
  }
  async returnDevices(id: string, input: ReturnLoanDto, actor: CurrentActor) {
    this.id(id);
    if (
      !input.items?.length ||
      !input.returnedAt ||
      !Number.isFinite(Date.parse(input.returnedAt))
    )
      throw new BadRequestException({ code: "LOAN_RETURN_REQUIRED" });
    const ids = input.items.map((item) => item.deviceId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException({ code: "LOAN_RETURN_DEVICE_INVALID" });
    const session = await this.operations.db.startSession();
    try {
      await session.withTransaction(async () => {
        const op = await this.operations
          .findOne({ _id: id, type: "LOAN" })
          .session(session);
        if (!op) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (!LOAN_OPEN_STATUSES.includes(op.status))
          throw new ConflictException({ code: "LOAN_NOT_RETURNABLE" });
        const day = loanDay(new Date(input.returnedAt));
        if (day < loanDay(op.operationDate) || day > loanDay(new Date()))
          throw new BadRequestException({ code: "LOAN_RETURN_DATE_INVALID" });
        for (const item of input.items) {
          const line = op.lines.find(
            (line) =>
              line.kind === "DEVICE" && String(line.deviceId) === item.deviceId,
          );
          if (!line || line.returned)
            throw new ConflictException({ code: "LOAN_RETURN_DEVICE_INVALID" });
          if (
            !LOAN_IN_CONDITIONS.includes(
              item.conditionIn as (typeof LOAN_IN_CONDITIONS)[number],
            ) ||
            (item.conditionIn === "OTHER" &&
              !item.conditionInDescription?.trim()) ||
            (["MISSING_ACCESSORIES", "LOST"].includes(item.conditionIn) &&
              !item.note?.trim())
          )
            throw new BadRequestException({
              code: "LOAN_RETURN_CONDITION_REQUIRED",
            });
        }
        const history: LoanReturnItem[] = [];
        for (const item of input.items) {
          const line = op.lines.find(
            (line) => String(line.deviceId) === item.deviceId,
          )!;
          const result =
            item.conditionIn === "LOST"
              ? "LOST"
              : ["BROKEN", "MISSING_ACCESSORIES", "OTHER"].includes(
                    item.conditionIn,
                  )
                ? "REPAIRING"
                : "IN_STOCK";
          const techCondition = ["GOOD", "NORMAL"].includes(item.conditionIn)
            ? "GOOD"
            : ["BROKEN", "LOST"].includes(item.conditionIn)
              ? "BROKEN"
              : "DEGRADED";
          const location = line.loanSourceLocationId
            ? await this.locations
                .exists({
                  _id: line.loanSourceLocationId,
                  warehouseId: op.sourceWarehouseId,
                  isActive: true,
                })
                .session(session)
            : null;
          const changed = await this.devices.updateOne(
            {
              _id: line.deviceId,
              usageStatus: "LENT",
              keeperId: op.receiverKeeperId,
              $or: [{ loanId: op._id }, { loanId: { $exists: false } }],
            },
            {
              $set: {
                usageStatus: result,
                techCondition,
                warehouseId: op.sourceWarehouseId,
                ...(location && result === "IN_STOCK"
                  ? { locationId: line.loanSourceLocationId }
                  : {}),
              },
              $unset: {
                keeperId: 1,
                departmentId: 1,
                loanId: 1,
                borrowedAt: 1,
                loanDueDate: 1,
                ...(!location || result !== "IN_STOCK"
                  ? { locationId: 1 }
                  : {}),
              },
            },
            { session },
          );
          if (changed.modifiedCount !== 1)
            throw new ConflictException({
              code: "LOAN_RETURN_DEVICE_INVALID",
              message: `Thiết bị ${line.assetCode ?? item.deviceId} không còn được mượn theo phiếu này.`,
            });
          Object.assign(line, {
            returned: true,
            returnedAt: new Date(input.returnedAt),
            conditionIn: item.conditionIn,
            conditionInDescription: item.conditionInDescription?.trim(),
            returnReceivedBy: actor.userId,
            returnNote: item.note?.trim(),
            returnResult: result,
            receivedCondition: techCondition,
          });
          history.push({
            deviceId: line.deviceId!,
            deviceName: line.deviceName,
            assetCode: line.assetCode,
            serial: line.serial,
            conditionOut: line.conditionOut ?? line.handoverCondition,
            conditionOutDescription: line.conditionOutDescription,
            conditionIn: item.conditionIn,
            conditionInDescription: item.conditionInDescription?.trim(),
            note: item.note?.trim(),
            result,
          });
        }
        op.returnHistory ??= [];
        op.returnHistory.push({
          _id: new Types.ObjectId(),
          returnedAt: new Date(input.returnedAt),
          recordedAt: new Date(),
          receivedBy: actor.userId,
          note: input.note?.trim(),
          items: history,
        });
        op.status = op.lines
          .filter((line) => line.kind === "DEVICE")
          .every((line) => line.returned)
          ? "RETURNED"
          : "PARTIALLY_RETURNED";
        op.receivedBy = actor.userId;
        op.receivedAt = new Date();
        if (op.status === "RETURNED") {
          op.closedBy = actor.userId;
          op.closedAt = new Date();
        }
        // Retain dueDate for historical reports and printed receipts.
        await op.save({ session });
      });
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "LOAN_RETURNED",
      entityType: "OperationDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
    });
    return this.get(id);
  }
}
