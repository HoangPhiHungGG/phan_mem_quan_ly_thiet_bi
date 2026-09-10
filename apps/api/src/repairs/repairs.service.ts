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
import { Department, Warehouse } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { ItemModel, Keeper, Location } from "../catalog/catalog.schemas";
import { Device, Part, PartSerial } from "../equipment/equipment.schemas";
import type {
  CancelRepairDto,
  CompleteRepairDto,
  CreateRepairDto,
  ReceiveRepairDto,
  StartRepairDto,
  UnrepairableRepairDto,
  UpdateRepairProgressDto,
  UpdateRepairDto,
} from "./repairs.dto";
import {
  REPAIR_ACTIVE_STATUSES,
  RepairDocument,
  type RepairDocumentType,
} from "./repairs.schemas";

const populate = [
  {
    path: "deviceId",
    select:
      "assetCode serial modelId usageStatus techCondition keeperId departmentId warehouseId locationId",
  },
  {
    path: "deviceId",
    populate: [
      { path: "modelId", select: "code name" },
      { path: "keeperId", select: "code displayName employeeCode" },
      { path: "departmentId", select: "code name" },
      { path: "warehouseId", select: "code name" },
      { path: "locationId", select: "code name" },
    ],
  },
  { path: "partSerialId", select: "serial status partId" },
  { path: "partSerialId", populate: { path: "partId", select: "code name" } },
  { path: "fromKeeperId", select: "code displayName employeeCode" },
  { path: "fromDepartmentId", select: "code name" },
  { path: "fromWarehouseId", select: "code name" },
  { path: "fromLocationId", select: "code name" },
  { path: "partsWarehouseId", select: "code name" },
  { path: "destinationWarehouseId", select: "code name" },
  { path: "destinationLocationId", select: "code name" },
  { path: "parts.partId", select: "code name trackingMode" },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "receivedBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  { path: "cancelledBy", select: "displayName employeeCode" },
  { path: "updatedBy", select: "displayName employeeCode" },
  { path: "statusHistory.by", select: "displayName employeeCode" },
];

const DEVICE_ELIGIBLE_STATUSES = ["IN_STOCK", "IN_USE", "LENT"] as const;

@Injectable()
export class RepairsService {
  constructor(
    @InjectModel(RepairDocument.name)
    private readonly repairs: Model<RepairDocument>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(PartSerial.name)
    private readonly partSerials: Model<PartSerial>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(Location.name) private readonly locations: Model<Location>,
    @InjectModel(Keeper.name) private readonly keepers: Model<Keeper>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(ItemModel.name) private readonly itemModels: Model<ItemModel>,
    private readonly audit: AuditService,
  ) {}

  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status =
        query.status === "ACTIVE"
          ? { $in: REPAIR_ACTIVE_STATUSES }
          : query.status;
    }
    if (query.deviceId && Types.ObjectId.isValid(query.deviceId))
      filter.deviceId = query.deviceId;
    if (query.dateFrom || query.dateTo) {
      filter.repairDate = {
        ...(query.dateFrom ? { $gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo
          ? { $lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
          : {}),
      };
    }
    if (query.q?.trim()) {
      const pattern = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [
        { code: pattern },
        { assetCode: pattern },
        { serial: pattern },
        { issueDescription: pattern },
        { vendor: pattern },
      ];
    }
    const [items, total] = await Promise.all([
      this.repairs
        .find(filter)
        .populate(populate)
        .sort({ repairDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.repairs.countDocuments(filter).exec(),
    ]);
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async get(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const repair = await this.repairs
      .findById(id)
      .populate(populate)
      .lean()
      .exec();
    if (!repair) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: repair };
  }

  // Thiết bị đủ điều kiện đưa vào sửa chữa
  async eligibleDevices() {
    const activeRepairs = await this.repairs
      .find({
        status: { $in: REPAIR_ACTIVE_STATUSES },
        deviceId: { $ne: null },
      })
      .select("deviceId")
      .lean()
      .exec();
    const busyIds = activeRepairs
      .map((item) => item.deviceId)
      .filter((id): id is Types.ObjectId => Boolean(id))
      .map((id) => String(id));
    const devices = await this.devices
      .find({
        isActive: true,
        usageStatus: { $in: DEVICE_ELIGIBLE_STATUSES },
        ...(busyIds.length ? { _id: { $nin: busyIds } } : {}),
      })
      .populate([
        { path: "modelId", select: "code name" },
        { path: "keeperId", select: "code displayName employeeCode" },
        { path: "departmentId", select: "code name" },
        { path: "warehouseId", select: "code name" },
        { path: "locationId", select: "code name" },
      ])
      .sort({ assetCode: 1 })
      .limit(500)
      .lean()
      .exec();
    return { data: devices };
  }

  // Linh kiện serial đủ điều kiện sửa
  async eligiblePartSerials() {
    const activeRepairs = await this.repairs
      .find({
        status: { $in: REPAIR_ACTIVE_STATUSES },
        partSerialId: { $ne: null },
      })
      .select("partSerialId")
      .lean()
      .exec();
    const busyIds = activeRepairs
      .map((item) => item.partSerialId)
      .filter((id): id is Types.ObjectId => Boolean(id))
      .map((id) => String(id));
    const serials = await this.partSerials
      .find({
        status: { $in: ["IN_STOCK", "ISSUED", "BROKEN"] },
        ...(busyIds.length ? { _id: { $nin: busyIds } } : {}),
      })
      .populate({ path: "partId", select: "code name trackingMode" })
      .sort({ serial: 1 })
      .limit(500)
      .lean()
      .exec();
    return { data: serials };
  }

  private async generateCode(): Promise<string> {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replace(/-/g, "");
    const prefix = `REPAIR-${today}-`;
    const existing = await this.repairs
      .find({ code: new RegExp(`^${prefix}`) })
      .select("code")
      .lean()
      .exec();
    const maximum = existing.reduce(
      (max, item) => Math.max(max, Number(item.code.slice(prefix.length)) || 0),
      0,
    );
    const counters = this.repairs.db.collection<{ _id: string; seq: number }>(
      "operation_counters",
    );
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

  // Snapshot thông tin đối tượng sửa chữa vào phiếu
  private async buildSnapshot(input: CreateRepairDto) {
    if (input.targetKind === "DEVICE") {
      if (!input.deviceId || input.partSerialId)
        throw new BadRequestException({ code: "REPAIR_TARGET_REQUIRED" });
      const device = await this.devices
        .findOne({ _id: input.deviceId, isActive: true })
        .populate({ path: "modelId", select: "name" })
        .lean()
        .exec();
      if (!device)
        throw new BadRequestException({ code: "REPAIR_DEVICE_INVALID" });
      if (
        !DEVICE_ELIGIBLE_STATUSES.includes(
          device.usageStatus as (typeof DEVICE_ELIGIBLE_STATUSES)[number],
        )
      )
        throw new ConflictException({
          code: "REPAIR_DEVICE_NOT_ELIGIBLE",
        });
      const activeCount = await this.repairs
        .countDocuments({
          deviceId: device._id,
          status: { $in: REPAIR_ACTIVE_STATUSES },
        })
        .exec();
      if (activeCount > 0)
        throw new ConflictException({ code: "REPAIR_ALREADY_ACTIVE" });
      const model =
        device.modelId && typeof device.modelId === "object"
          ? (device.modelId as { name?: string }).name
          : undefined;
      return {
        targetKind: "DEVICE" as const,
        deviceId: device._id,
        partSerialId: undefined,
        assetCode: device.assetCode,
        serial: device.serial,
        targetName: model ?? device.assetCode,
        fromKeeperId: device.keeperId ?? undefined,
        fromDepartmentId: device.departmentId ?? undefined,
        fromWarehouseId: device.warehouseId ?? undefined,
        fromLocationId: device.locationId ?? undefined,
        fromUsageStatus: device.usageStatus,
        fromPartSerialStatus: undefined,
        activeTargetKey: `DEVICE:${String(device._id)}`,
      };
    }
    if (!input.partSerialId || input.deviceId)
      throw new BadRequestException({ code: "REPAIR_TARGET_REQUIRED" });
    const partSerial = await this.partSerials
      .findById(input.partSerialId)
      .populate({ path: "partId", select: "name code" })
      .lean()
      .exec();
    if (!partSerial)
      throw new BadRequestException({ code: "REPAIR_PART_SERIAL_INVALID" });
    if (!["IN_STOCK", "ISSUED", "BROKEN"].includes(partSerial.status))
      throw new ConflictException({ code: "REPAIR_DEVICE_NOT_ELIGIBLE" });
    const activeCount = await this.repairs
      .countDocuments({
        partSerialId: partSerial._id,
        status: { $in: REPAIR_ACTIVE_STATUSES },
      })
      .exec();
    if (activeCount > 0)
      throw new ConflictException({ code: "REPAIR_ALREADY_ACTIVE" });
    const part =
      partSerial.partId && typeof partSerial.partId === "object"
        ? (partSerial.partId as { code?: string; name?: string })
        : null;
    return {
      targetKind: "PART_SERIAL" as const,
      deviceId: undefined,
      partSerialId: partSerial._id,
      assetCode: part?.code,
      serial: partSerial.serial,
      targetName: part?.name ?? part?.code,
      fromKeeperId: undefined,
      fromDepartmentId: undefined,
      fromWarehouseId: partSerial.warehouseId ?? undefined,
      fromLocationId: partSerial.locationId ?? undefined,
      fromUsageStatus: undefined,
      fromPartSerialStatus: partSerial.status,
      activeTargetKey: `PART_SERIAL:${String(partSerial._id)}`,
    };
  }

  async create(input: CreateRepairDto, actor: CurrentActor) {
    const snapshot = await this.buildSnapshot(input);
    const code = await this.generateCode();
    try {
      const repair = await this.repairs.create({
        ...input,
        ...snapshot,
        code,
        repairDate: input.repairDate,
        issueDescription: input.issueDescription.trim(),
        parts: [],
        totalCost: this.computeTotal(input),
        status: "DRAFT",
        createdBy: actor.userId,
        statusHistory: [{ status: "DRAFT", at: new Date(), by: actor.userId }],
      });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "REPAIR_CREATED",
        entityType: "RepairDocument",
        entityId: repair._id,
        outcome: "SUCCESS",
        metadata: {
          code: repair.code,
          deviceId: repair.deviceId,
          partSerialId: repair.partSerialId,
        },
      });
      return { data: await repair.populate(populate) };
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const key = (error as { keyPattern?: Record<string, number> })
          .keyPattern;
        throw new ConflictException({
          code: key?.activeTargetKey
            ? "REPAIR_ALREADY_ACTIVE"
            : "OPERATION_CODE_EXISTS",
        });
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateRepairDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const repair = await this.repairs.findById(id).exec();
    if (!repair) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (repair.status !== "DRAFT")
      throw new ConflictException({ code: "REPAIR_NOT_EDITABLE" });
    // Nếu đổi đối tượng sửa chữa → rebuild snapshot + validate lại
    const targetChanged =
      (input.targetKind === "DEVICE" &&
        input.deviceId &&
        String(repair.deviceId) !== input.deviceId) ||
      (input.targetKind === "PART_SERIAL" &&
        input.partSerialId &&
        String(repair.partSerialId) !== input.partSerialId);
    if (targetChanged) {
      const snapshot = await this.buildSnapshot(input);
      repair.targetKind = snapshot.targetKind;
      repair.deviceId = snapshot.deviceId;
      repair.partSerialId = snapshot.partSerialId;
      repair.assetCode = snapshot.assetCode;
      repair.serial = snapshot.serial;
      repair.targetName = snapshot.targetName;
      repair.fromKeeperId = snapshot.fromKeeperId;
      repair.fromDepartmentId = snapshot.fromDepartmentId;
      repair.fromWarehouseId = snapshot.fromWarehouseId;
      repair.fromLocationId = snapshot.fromLocationId;
      repair.fromUsageStatus = snapshot.fromUsageStatus;
      repair.fromPartSerialStatus = snapshot.fromPartSerialStatus;
      repair.activeTargetKey = snapshot.activeTargetKey;
    }
    repair.repairDate = new Date(input.repairDate);
    repair.conditionBefore = input.conditionBefore;
    repair.issueDescription = input.issueDescription.trim();
    repair.severity = input.severity;
    repair.repairType = input.repairType;
    repair.vendor = input.vendor?.trim();
    repair.vendorContact = input.vendorContact?.trim();
    repair.responsiblePerson = input.responsiblePerson?.trim();
    repair.sentAt = input.sentAt ? new Date(input.sentAt) : undefined;
    repair.expectedCompletionAt = input.expectedCompletionAt
      ? new Date(input.expectedCompletionAt)
      : undefined;
    repair.inspectionCost = input.inspectionCost ?? 0;
    repair.repairCost = input.repairCost ?? 0;
    repair.partsCost = input.partsCost ?? 0;
    repair.otherCost = input.otherCost ?? 0;
    repair.totalCost = this.computeTotal(input);
    repair.note = input.note?.trim();
    repair.updatedBy = actor.userId;
    await repair.save();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "REPAIR_UPDATED",
      entityType: "RepairDocument",
      entityId: repair._id,
      outcome: "SUCCESS",
      metadata: { code: repair.code, changedFields: Object.keys(input) },
    });
    return { data: await repair.populate(populate) };
  }

  // DRAFT → RECEIVED: khoá thiết bị vào trạng thái REPAIRING
  async receive(id: string, actor: CurrentActor, input: ReceiveRepairDto) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const session = await this.repairs.db.startSession();
    try {
      await session.withTransaction(async () => {
        const repair = await this.repairs.findById(id).session(session).exec();
        if (!repair)
          throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (repair.status !== "DRAFT")
          throw new ConflictException({ code: "REPAIR_INVALID_STATUS" });
        await this.lockTarget(repair, session);
        const receivedAt = input.receivedAt
          ? new Date(input.receivedAt)
          : new Date();
        const changed = await this.repairs.updateOne(
          { _id: repair._id, status: "DRAFT" },
          {
            $set: {
              status: "RECEIVED",
              receivedAt,
              receivedBy: actor.userId,
            },
            $push: {
              statusHistory: {
                status: "RECEIVED",
                at: receivedAt,
                by: actor.userId,
                note: input.note?.trim(),
              },
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "REPAIR_CONCURRENT_UPDATE" });
      });
    } finally {
      await session.endSession();
    }
    const repair = await this.repairs.findById(id).lean().exec();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "REPAIR_RECEIVED",
      entityType: "RepairDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
      metadata: {
        code: repair?.code,
        deviceId: repair?.deviceId,
        partSerialId: repair?.partSerialId,
        receivedAt: repair?.receivedAt,
      },
    });
    return this.get(id);
  }

  // Khoá đối tượng sửa vào trạng thái REPAIRING (atomic guard)
  private async lockTarget(repair: RepairDocumentType, session: ClientSession) {
    if (repair.targetKind === "DEVICE" && repair.deviceId) {
      const changed = await this.devices.updateOne(
        {
          _id: repair.deviceId,
          isActive: true,
          usageStatus: { $in: DEVICE_ELIGIBLE_STATUSES },
        },
        { $set: { usageStatus: "REPAIRING" } },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "REPAIR_DEVICE_NOT_ELIGIBLE" });
      return;
    }
    if (repair.targetKind === "PART_SERIAL" && repair.partSerialId) {
      const changed = await this.partSerials.updateOne(
        {
          _id: repair.partSerialId,
          status: { $in: ["IN_STOCK", "ISSUED", "BROKEN"] },
        },
        { $set: { status: "REPAIRING" } },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "REPAIR_DEVICE_NOT_ELIGIBLE" });
    }
  }

  // RECEIVED → REPAIRING
  async start(id: string, actor: CurrentActor, input: StartRepairDto) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const repair = await this.repairs.findById(id).lean().exec();
    if (!repair) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (repair.status !== "RECEIVED")
      throw new ConflictException({ code: "REPAIR_INVALID_STATUS" });
    const now = new Date();
    const changed = await this.repairs.updateOne(
      { _id: repair._id, status: "RECEIVED" },
      {
        $set: {
          status: "REPAIRING",
          ...(input.sentAt ? { sentAt: new Date(input.sentAt) } : {}),
          ...(input.expectedCompletionAt
            ? { expectedCompletionAt: new Date(input.expectedCompletionAt) }
            : {}),
        },
        $push: {
          statusHistory: {
            status: "REPAIRING",
            at: now,
            by: actor.userId,
            note: input.note?.trim(),
          },
        },
      },
    );
    if (changed.modifiedCount !== 1)
      throw new ConflictException({ code: "REPAIR_CONCURRENT_UPDATE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "REPAIR_STARTED",
      entityType: "RepairDocument",
      entityId: repair._id,
      outcome: "SUCCESS",
      metadata: {
        code: repair.code,
        sentAt: input.sentAt,
        expectedCompletionAt: input.expectedCompletionAt,
      },
    });
    return this.get(id);
  }

  private computeTotal(input: {
    inspectionCost?: number;
    repairCost?: number;
    partsCost?: number;
    otherCost?: number;
  }): number {
    return (
      (input.inspectionCost ?? 0) +
      (input.repairCost ?? 0) +
      (input.partsCost ?? 0) +
      (input.otherCost ?? 0)
    );
  }

  // Trừ tồn kho linh kiện thay thế (atomic, không cho âm) + ghi transaction
  private async takePart(
    repair: RepairDocumentType,
    line: {
      partId: string;
      partSerialId?: string;
      serial?: string;
      quantity: number;
      note?: string;
    },
    index: number,
    actor: CurrentActor,
    session: ClientSession,
  ) {
    if (!repair.partsWarehouseId)
      throw new BadRequestException({
        code: "REPAIR_PARTS_WAREHOUSE_REQUIRED",
      });
    const part = await this.parts
      .findOne({ _id: line.partId, isActive: true })
      .session(session)
      .exec();
    if (!part)
      throw new BadRequestException({ code: "PART_REFERENCE_INVALID" });
    if (part.trackingMode === "SERIAL") {
      if (!line.partSerialId || line.quantity !== 1)
        throw new BadRequestException({ code: "REPAIR_PART_SERIAL_REQUIRED" });
      const selectedSerial = await this.partSerials.findOneAndUpdate(
        {
          _id: line.partSerialId,
          partId: part._id,
          warehouseId: repair.partsWarehouseId,
          status: "IN_STOCK",
        },
        {
          $set: {
            status: "ISSUED",
            note: `Dùng cho ${repair.code}${line.note ? `: ${line.note}` : ""}`,
          },
        },
        { new: true, session },
      );
      if (!selectedSerial)
        throw new ConflictException({
          code: "REPAIR_PART_SERIAL_UNAVAILABLE",
        });
      line.serial = selectedSerial.serial;
    } else if (line.partSerialId) {
      throw new BadRequestException({ code: "PART_SERIAL_NOT_ALLOWED" });
    }
    const balance = await this.balances.findOneAndUpdate(
      {
        partId: part._id,
        warehouseId: repair.partsWarehouseId,
        quantity: { $gte: line.quantity },
      },
      { $inc: { quantity: -line.quantity } },
      { new: true, session },
    );
    if (!balance) throw new ConflictException({ code: "INSUFFICIENT_STOCK" });
    await this.transactions.create(
      [
        {
          partId: part._id,
          warehouseId: repair.partsWarehouseId,
          quantity: line.quantity,
          type: "ISSUE",
          createdBy: actor.userId,
          repairId: repair._id,
          lineIndex: index,
          note: `Sửa chữa ${repair.code}${line.note ? `: ${line.note}` : ""}`,
        },
      ],
      { session },
    );
  }

  async updateProgress(
    id: string,
    input: UpdateRepairProgressDto,
    actor: CurrentActor,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const costs = {
      inspectionCost: input.inspectionCost,
      repairCost: input.repairCost,
      partsCost: input.partsCost,
      otherCost: input.otherCost,
    };
    const update: Record<string, unknown> = {
      ...(input.repairContent !== undefined
        ? { repairContent: input.repairContent.trim() }
        : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor.trim() } : {}),
      ...(input.vendorContact !== undefined
        ? { vendorContact: input.vendorContact.trim() }
        : {}),
      ...(input.responsiblePerson !== undefined
        ? { responsiblePerson: input.responsiblePerson.trim() }
        : {}),
      ...(input.expectedCompletionAt
        ? { expectedCompletionAt: new Date(input.expectedCompletionAt) }
        : {}),
      ...(input.note !== undefined ? { note: input.note.trim() } : {}),
      updatedBy: actor.userId,
    };
    for (const [key, value] of Object.entries(costs)) {
      if (value !== undefined) update[key] = value;
    }
    const current = await this.repairs
      .findOne({ _id: id, status: "REPAIRING" })
      .lean();
    if (!current) {
      const exists = await this.repairs.exists({ _id: id });
      if (!exists) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      throw new ConflictException({ code: "REPAIR_INVALID_STATUS" });
    }
    update.totalCost = this.computeTotal({
      inspectionCost: input.inspectionCost ?? current.inspectionCost,
      repairCost: input.repairCost ?? current.repairCost,
      partsCost: input.partsCost ?? current.partsCost,
      otherCost: input.otherCost ?? current.otherCost,
    });
    const currentUpdatedAt = (current as typeof current & { updatedAt: Date })
      .updatedAt;
    const changed = await this.repairs.findOneAndUpdate(
      { _id: id, status: "REPAIRING", updatedAt: currentUpdatedAt },
      { $set: update },
      { new: true },
    );
    if (!changed)
      throw new ConflictException({ code: "REPAIR_CONCURRENT_UPDATE" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "REPAIR_UPDATED",
      entityType: "RepairDocument",
      entityId: changed._id,
      outcome: "SUCCESS",
      metadata: {
        code: changed.code,
        progress: true,
        changedFields: Object.keys(input),
      },
    });
    return this.get(id);
  }

  async complete(id: string, input: CompleteRepairDto, actor: CurrentActor) {
    return this.finish(id, input, actor, "COMPLETED");
  }

  async markUnrepairable(
    id: string,
    input: UnrepairableRepairDto,
    actor: CurrentActor,
  ) {
    return this.finish(
      id,
      {
        ...input,
        conditionAfter: "BROKEN",
        outcome: input.outcome ?? "PENDING_DISPOSAL",
      },
      actor,
      "UNREPAIRABLE",
    );
  }

  private async finish(
    id: string,
    input: CompleteRepairDto,
    actor: CurrentActor,
    finalStatus: "COMPLETED" | "UNREPAIRABLE",
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const session = await this.repairs.db.startSession();
    let code = "";
    let finalTotal = 0;
    let usedParts: Array<{
      partId: string;
      quantity: number;
      serial?: string;
    }> = [];
    try {
      await session.withTransaction(async () => {
        const repair = await this.repairs.findById(id).session(session).exec();
        if (!repair)
          throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (repair.status !== "REPAIRING")
          throw new ConflictException({ code: "REPAIR_INVALID_STATUS" });
        code = repair.code;
        const parts = input.parts ?? [];
        if (parts.length && !input.partsWarehouseId)
          throw new BadRequestException({
            code: "REPAIR_PARTS_WAREHOUSE_REQUIRED",
          });
        if (input.partsWarehouseId) {
          const warehouse = await this.warehouses
            .exists({ _id: input.partsWarehouseId, isActive: true })
            .session(session);
          if (!warehouse)
            throw new BadRequestException({
              code: "WAREHOUSE_REFERENCE_INVALID",
            });
          repair.partsWarehouseId = new Types.ObjectId(input.partsWarehouseId);
        }
        const serialIds = parts.flatMap((line) =>
          line.partSerialId ? [line.partSerialId] : [],
        );
        if (new Set(serialIds).size !== serialIds.length)
          throw new BadRequestException({
            code: "REPAIR_PART_SERIAL_DUPLICATE",
          });
        for (const [index, line] of parts.entries()) {
          await this.takePart(repair, line, index, actor, session);
        }
        await this.applyOutcome(repair, input, session);
        const completedAt = input.completedAt
          ? new Date(input.completedAt)
          : new Date();
        finalTotal = this.computeTotal({
          inspectionCost: input.inspectionCost ?? repair.inspectionCost,
          repairCost: input.repairCost ?? repair.repairCost,
          partsCost: input.partsCost ?? repair.partsCost,
          otherCost: input.otherCost ?? repair.otherCost,
        });
        const changed = await this.repairs.updateOne(
          { _id: repair._id, status: "REPAIRING" },
          {
            $set: {
              status: finalStatus,
              result: input.result.trim(),
              conditionAfter: input.conditionAfter,
              outcome: input.outcome,
              repairContent: input.repairContent?.trim(),
              inspectionCost: input.inspectionCost ?? repair.inspectionCost,
              repairCost: input.repairCost ?? repair.repairCost,
              partsCost: input.partsCost ?? repair.partsCost,
              otherCost: input.otherCost ?? repair.otherCost,
              totalCost: finalTotal,
              parts,
              partsWarehouseId: repair.partsWarehouseId,
              destinationWarehouseId: input.destinationWarehouseId,
              destinationLocationId: input.destinationLocationId,
              completedAt,
              completedBy: actor.userId,
              updatedBy: actor.userId,
            },
            $unset: { activeTargetKey: 1 },
            $push: {
              statusHistory: {
                status: finalStatus,
                at: completedAt,
                by: actor.userId,
                note: input.result.trim(),
              },
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "REPAIR_CONCURRENT_UPDATE" });
        usedParts = parts.map((line) => ({
          partId: line.partId,
          quantity: line.quantity,
          serial: line.serial,
        }));
      });
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action:
        finalStatus === "COMPLETED"
          ? "REPAIR_COMPLETED"
          : "REPAIR_UNREPAIRABLE",
      entityType: "RepairDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
      metadata: {
        code,
        usedParts,
        outcome: input.outcome,
        conditionAfter: input.conditionAfter,
        totalCost: finalTotal,
      },
    });
    for (const part of usedParts) {
      await this.audit.write({
        actorUserId: actor.userId,
        action: "REPAIR_PART_USED",
        entityType: "RepairDocument",
        entityId: new Types.ObjectId(id),
        outcome: "SUCCESS",
        metadata: { code, ...part },
      });
    }
    return this.get(id);
  }

  private async applyOutcome(
    repair: RepairDocumentType,
    input: Pick<
      CompleteRepairDto,
      | "outcome"
      | "conditionAfter"
      | "destinationWarehouseId"
      | "destinationLocationId"
    >,
    session: ClientSession,
  ) {
    let warehouseId: Types.ObjectId | undefined;
    let locationId: Types.ObjectId | undefined;
    if (input.outcome === "RETURN_TO_WAREHOUSE") {
      if (!input.destinationWarehouseId)
        throw new BadRequestException({
          code: "DESTINATION_WAREHOUSE_REQUIRED",
        });
      const warehouse = await this.warehouses
        .findOne({ _id: input.destinationWarehouseId, isActive: true })
        .session(session)
        .exec();
      if (!warehouse)
        throw new BadRequestException({ code: "WAREHOUSE_REFERENCE_INVALID" });
      warehouseId = warehouse._id;
      if (input.destinationLocationId) {
        const location = await this.locations
          .findOne({
            _id: input.destinationLocationId,
            warehouseId: warehouse._id,
            isActive: true,
          })
          .session(session)
          .exec();
        if (!location)
          throw new BadRequestException({ code: "LOCATION_REFERENCE_INVALID" });
        locationId = location._id;
      }
    }
    if (repair.targetKind === "DEVICE" && repair.deviceId) {
      const set: Record<string, unknown> = {
        techCondition: input.conditionAfter,
      };
      const unset: Record<string, 1> = {};
      if (input.outcome === "RETURN_TO_KEEPER") {
        if (!repair.fromKeeperId && !repair.fromDepartmentId)
          throw new BadRequestException({ code: "REPAIR_KEEPER_REQUIRED" });
        set.usageStatus = ["IN_USE", "LENT"].includes(
          repair.fromUsageStatus ?? "",
        )
          ? repair.fromUsageStatus
          : "IN_USE";
        if (repair.fromKeeperId) set.keeperId = repair.fromKeeperId;
        if (repair.fromDepartmentId) set.departmentId = repair.fromDepartmentId;
        if (repair.fromLocationId) set.locationId = repair.fromLocationId;
        unset.warehouseId = 1;
      } else if (input.outcome === "RETURN_TO_WAREHOUSE") {
        set.usageStatus = "IN_STOCK";
        set.warehouseId = warehouseId;
        if (locationId) set.locationId = locationId;
        else unset.locationId = 1;
        unset.keeperId = 1;
        unset.departmentId = 1;
        unset.loanId = 1;
        unset.borrowedAt = 1;
        unset.loanDueDate = 1;
      } else {
        set.usageStatus = "REPAIRING";
        if (input.outcome === "PENDING_DISPOSAL") set.techCondition = "BROKEN";
      }
      const changed = await this.devices.updateOne(
        { _id: repair.deviceId, usageStatus: "REPAIRING" },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "REPAIR_DEVICE_STATE_CHANGED" });
      return;
    }
    if (repair.targetKind === "PART_SERIAL" && repair.partSerialId) {
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      if (input.outcome === "RETURN_TO_WAREHOUSE") {
        set.status = "IN_STOCK";
        set.warehouseId = warehouseId;
        if (locationId) set.locationId = locationId;
        else unset.locationId = 1;
      } else if (input.outcome === "RETURN_TO_KEEPER") {
        set.status =
          repair.fromPartSerialStatus === "ISSUED" ? "ISSUED" : "BROKEN";
        unset.warehouseId = 1;
        unset.locationId = 1;
      } else {
        set.status =
          input.outcome === "PENDING_DISPOSAL" ? "BROKEN" : "REPAIRING";
      }
      const changed = await this.partSerials.updateOne(
        { _id: repair.partSerialId, status: "REPAIRING" },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "REPAIR_DEVICE_STATE_CHANGED" });
    }
  }

  async cancel(id: string, input: CancelRepairDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const session = await this.repairs.db.startSession();
    let code = "";
    try {
      await session.withTransaction(async () => {
        const repair = await this.repairs.findById(id).session(session).exec();
        if (!repair)
          throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
        if (
          !(REPAIR_ACTIVE_STATUSES as readonly string[]).includes(repair.status)
        )
          throw new ConflictException({ code: "REPAIR_INVALID_STATUS" });
        code = repair.code;
        if (repair.status !== "DRAFT")
          await this.restoreTarget(repair, session);
        const at = new Date();
        const changed = await this.repairs.updateOne(
          { _id: repair._id, status: repair.status },
          {
            $set: {
              status: "CANCELLED",
              cancelReason: input.reason.trim(),
              cancelledAt: at,
              cancelledBy: actor.userId,
              updatedBy: actor.userId,
            },
            $unset: { activeTargetKey: 1 },
            $push: {
              statusHistory: {
                status: "CANCELLED",
                at,
                by: actor.userId,
                note: input.reason.trim(),
              },
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "REPAIR_CONCURRENT_UPDATE" });
      });
    } finally {
      await session.endSession();
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "REPAIR_CANCELLED",
      entityType: "RepairDocument",
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
      metadata: { code, reason: input.reason.trim() },
    });
    return this.get(id);
  }

  private async restoreTarget(
    repair: RepairDocumentType,
    session: ClientSession,
  ) {
    if (repair.targetKind === "DEVICE" && repair.deviceId) {
      const set: Record<string, unknown> = {
        usageStatus: repair.fromUsageStatus ?? "IN_STOCK",
      };
      const unset: Record<string, 1> = {};
      for (const [key, value] of [
        ["keeperId", repair.fromKeeperId],
        ["departmentId", repair.fromDepartmentId],
        ["warehouseId", repair.fromWarehouseId],
        ["locationId", repair.fromLocationId],
      ] as const) {
        if (value) set[key] = value;
        else unset[key] = 1;
      }
      const changed = await this.devices.updateOne(
        { _id: repair.deviceId, usageStatus: "REPAIRING" },
        { $set: set, $unset: unset },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "REPAIR_DEVICE_STATE_CHANGED" });
    } else if (repair.partSerialId) {
      const changed = await this.partSerials.updateOne(
        { _id: repair.partSerialId, status: "REPAIRING" },
        {
          $set: {
            status: repair.fromPartSerialStatus ?? "BROKEN",
            ...(repair.fromWarehouseId
              ? { warehouseId: repair.fromWarehouseId }
              : {}),
            ...(repair.fromLocationId
              ? { locationId: repair.fromLocationId }
              : {}),
          },
          ...(!repair.fromWarehouseId ? { $unset: { warehouseId: 1 } } : {}),
        },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ConflictException({ code: "REPAIR_DEVICE_STATE_CHANGED" });
    }
  }

  async removeDraft(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const repair = await this.repairs.findOneAndDelete({
      _id: id,
      status: "DRAFT",
    });
    if (!repair) {
      const exists = await this.repairs.exists({ _id: id });
      if (!exists) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      throw new ConflictException({ code: "REPAIR_NOT_EDITABLE" });
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "REPAIR_CANCELLED",
      entityType: "RepairDocument",
      entityId: repair._id,
      outcome: "SUCCESS",
      metadata: { code: repair.code, deletedDraft: true },
    });
    return { data: { deleted: true } };
  }

  async deviceHistory(deviceId: string) {
    if (!Types.ObjectId.isValid(deviceId))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!(await this.devices.exists({ _id: deviceId })))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const data = await this.repairs
      .find({ deviceId })
      .populate(populate)
      .sort({ repairDate: -1, createdAt: -1 })
      .lean()
      .exec();
    return { data };
  }
}
