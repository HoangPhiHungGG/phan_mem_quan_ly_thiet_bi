import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import { Keeper, Location } from "../catalog/catalog.schemas";
import { Device, Part } from "../equipment/equipment.schemas";
import { Department, Warehouse } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import type {
  CancelCountDto,
  CheckDeviceDto,
  CheckPartDto,
  CreateCountDto,
  RecordUnexpectedDto,
  ResolveDiscrepancyDto,
  UpdateCountDto,
} from "./inventory-count.dto";
import { InventoryCountDocument } from "./inventory-count.schemas";
const populate = [
  { path: "warehouseId", select: "code name" },
  { path: "departmentId", select: "code name" },
  { path: "locationId", select: "code name" },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  { path: "statusHistory.by", select: "displayName employeeCode" },
  {
    path: "deviceItems.expectedWarehouseId deviceItems.actualWarehouseId partItems.warehouseId",
    select: "code name",
  },
  {
    path: "deviceItems.expectedDepartmentId deviceItems.actualDepartmentId",
    select: "code name",
  },
  {
    path: "deviceItems.expectedKeeperId deviceItems.actualKeeperId",
    select: "displayName employeeCode",
  },
  {
    path: "deviceItems.expectedLocationId deviceItems.actualLocationId",
    select: "code name",
  },
  { path: "partItems.partId", select: "code name" },
  { path: "discrepancies.resolvedBy", select: "displayName employeeCode" },
  { path: "unexpectedItems.actualLocationId", select: "code name" },
];
@Injectable()
export class InventoryCountService {
  constructor(
    @InjectModel(InventoryCountDocument.name)
    private docs: Model<InventoryCountDocument>,
    @InjectModel(Device.name) private devices: Model<Device>,
    @InjectModel(Part.name) private parts: Model<Part>,
    @InjectModel(InventoryBalance.name)
    private balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private transactions: Model<InventoryTransaction>,
    @InjectModel(Warehouse.name) private warehouses: Model<Warehouse>,
    @InjectModel(Department.name) private departments: Model<Department>,
    @InjectModel(Location.name) private locations: Model<Location>,
    @InjectModel(Keeper.name) private keepers: Model<Keeper>,
    private audit: AuditService,
  ) {}
  async list(q: Record<string, string | undefined>) {
    const page = Math.max(1, Number(q.page) || 1),
      limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.scope) filter.scope = q.scope;
    if (q.q) {
      const p = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ code: p }, { name: p }, { responsiblePerson: p }];
    }
    const [data, total] = await Promise.all([
      this.docs
        .find(filter)
        .populate(populate)
        .sort({ countDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.docs.countDocuments(filter),
    ]);
    return {
      data: data.map((d) => ({ ...d, summary: this.summary(d) })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
  async get(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const data = await this.docs.findById(id).populate(populate).lean();
    if (!data) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: { ...data, summary: this.summary(data) } };
  }
  private summary(d: {
    deviceItems?: Array<{ checked: boolean; result?: string }>;
    partItems?: Array<{ checked: boolean; result?: string }>;
    discrepancies?: Array<{ status: string }>;
    unexpectedItems?: unknown[];
  }) {
    const items = [...(d.deviceItems ?? []), ...(d.partItems ?? [])];
    return {
      total: items.length + (d.unexpectedItems?.length ?? 0),
      checked: items.filter((i) => i.checked).length,
      unchecked: items.filter((i) => !i.checked).length,
      matched: items.filter((i) => i.result === "MATCHED").length,
      discrepancies: items.filter((i) => i.checked && i.result !== "MATCHED")
        .length,
      notFound: items.filter((i) => i.result === "NOT_FOUND").length,
      open: (d.discrepancies ?? []).filter((i) => i.status === "OPEN").length,
    };
  }
  private async validate(input: CreateCountDto) {
    if (
      (input.scope === "WAREHOUSE" && !input.warehouseId) ||
      (input.scope === "DEPARTMENT" && !input.departmentId) ||
      (input.scope === "LOCATION" && !input.locationId)
    )
      throw new BadRequestException({ code: "COUNT_SCOPE_REFERENCE_REQUIRED" });
    if (
      (input.warehouseId &&
        !(await this.warehouses.exists({
          _id: input.warehouseId,
          isActive: true,
        }))) ||
      (input.departmentId &&
        !(await this.departments.exists({
          _id: input.departmentId,
          isActive: true,
        }))) ||
      (input.locationId &&
        !(await this.locations.exists({
          _id: input.locationId,
          isActive: true,
        })))
    )
      throw new BadRequestException({ code: "COUNT_SCOPE_REFERENCE_INVALID" });
  }
  private async code() {
    const prefix = `COUNT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-`;
    const c = await this.docs.db
      .collection<{ _id: string; seq: number }>("operation_counters")
      .findOneAndUpdate(
        { _id: prefix },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" },
      );
    return `${prefix}${String(c!.seq).padStart(3, "0")}`;
  }
  async create(input: CreateCountDto, a: CurrentActor) {
    await this.validate(input);
    const at = new Date();
    const d = await this.docs.create({
      ...input,
      code: await this.code(),
      countDate: new Date(input.countDate),
      name: input.name.trim(),
      responsiblePerson: input.responsiblePerson.trim(),
      members: input.members?.map((x) => x.trim()).filter(Boolean) ?? [],
      status: "DRAFT",
      createdBy: a.userId,
      statusHistory: [{ status: "DRAFT", at, by: a.userId }],
    });
    await this.log("INVENTORY_CREATED", d._id, a, { code: d.code });
    return this.get(String(d._id));
  }
  async update(id: string, input: UpdateCountDto, a: CurrentActor) {
    await this.validate(input);
    const d = await this.docs.findOneAndUpdate(
      { _id: id, status: "DRAFT" },
      { $set: { ...input, countDate: new Date(input.countDate) } },
      { new: true },
    );
    if (!d) throw new ConflictException({ code: "COUNT_NOT_EDITABLE" });
    await this.log("INVENTORY_UPDATED", d._id, a, { code: d.code });
    return this.get(id);
  }
  async start(id: string, a: CurrentActor) {
    const session = await this.docs.db.startSession();
    try {
      await session.withTransaction(async () => {
        const d = await this.docs
          .findOne({ _id: id, status: "DRAFT" })
          .session(session);
        if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
        const filter: Record<string, unknown> = {
          isActive: true,
          usageStatus: { $nin: ["DISPOSED", "NOT_RECEIVED"] },
        };
        if (d.scope === "WAREHOUSE") filter.warehouseId = d.warehouseId;
        if (d.scope === "DEPARTMENT") filter.departmentId = d.departmentId;
        if (d.scope === "LOCATION") filter.locationId = d.locationId;
        const devices = await this.devices
          .find(filter)
          .populate({ path: "modelId", select: "name" })
          .session(session)
          .lean();
        const balanceFilter: Record<string, unknown> = {
          quantity: { $gte: 0 },
        };
        if (d.scope === "WAREHOUSE") balanceFilter.warehouseId = d.warehouseId;
        else if (d.scope !== "ALL") balanceFilter._id = { $exists: false };
        const balances = await this.balances
          .find(balanceFilter)
          .populate({
            path: "partId",
            select: "code name unitId",
            populate: { path: "unitId", select: "name" },
          })
          .session(session)
          .lean();
        const at = new Date();
        const changed = await this.docs.updateOne(
          { _id: id, status: "DRAFT" },
          {
            $set: {
              status: "IN_PROGRESS",
              snapshotAt: at,
              deviceItems: devices.map((v) => ({
                _id: new Types.ObjectId(),
                deviceId: v._id,
                assetCode: v.assetCode,
                name:
                  typeof v.modelId === "object"
                    ? (v.modelId as { name?: string }).name
                    : v.assetCode,
                serial: v.serial,
                expectedWarehouseId: v.warehouseId,
                expectedDepartmentId: v.departmentId,
                expectedKeeperId: v.keeperId,
                expectedLocationId: v.locationId,
                expectedCondition: v.techCondition,
                checked: false,
                revision: 0,
              })),
              partItems: balances.map((b) => {
                const p = b.partId as unknown as {
                  _id: Types.ObjectId;
                  code: string;
                  name: string;
                  unitId?: { name?: string };
                };
                return {
                  _id: new Types.ObjectId(),
                  partId: p._id,
                  warehouseId: b.warehouseId,
                  code: p.code,
                  name: p.name,
                  unit: p.unitId?.name,
                  expectedQuantity: b.quantity,
                  checked: false,
                  revision: 0,
                };
              }),
            },
            $push: {
              statusHistory: { status: "IN_PROGRESS", at, by: a.userId },
            },
          },
          { session },
        );
        if (changed.modifiedCount !== 1)
          throw new ConflictException({ code: "COUNT_CONCURRENT_UPDATE" });
      });
    } finally {
      await session.endSession();
    }
    await this.log("INVENTORY_STARTED", new Types.ObjectId(id), a);
    return this.get(id);
  }
  private deviceResult(
    i: {
      expectedLocationId?: Types.ObjectId;
      expectedKeeperId?: Types.ObjectId;
      expectedCondition: string;
    },
    x: CheckDeviceDto,
  ) {
    if (!x.found) return "NOT_FOUND";
    if (String(i.expectedLocationId ?? "") !== String(x.actualLocationId ?? ""))
      return "WRONG_LOCATION";
    if (String(i.expectedKeeperId ?? "") !== String(x.actualKeeperId ?? ""))
      return "WRONG_HOLDER";
    if (i.expectedCondition !== x.actualCondition) return "CONDITION_MISMATCH";
    return "MATCHED";
  }
  async checkDevice(
    id: string,
    itemId: string,
    x: CheckDeviceDto,
    a: CurrentActor,
  ) {
    const d = await this.docs.findOne({ _id: id, status: "IN_PROGRESS" });
    if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
    const item = d.deviceItems.find(
      (value) =>
        String((value as typeof value & { _id: Types.ObjectId })._id) ===
        itemId,
    );
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (item.revision !== x.revision)
      throw new ConflictException({ code: "COUNT_CONCURRENT_UPDATE" });
    if (
      (x.actualLocationId &&
        !(await this.locations.exists({
          _id: x.actualLocationId,
          isActive: true,
        }))) ||
      (x.actualKeeperId &&
        !(await this.keepers.exists({ _id: x.actualKeeperId, isActive: true })))
    )
      throw new BadRequestException({ code: "COUNT_ACTUAL_REFERENCE_INVALID" });
    const result = this.deviceResult(item, x);
    Object.assign(item, {
      ...x,
      result,
      checked: true,
      checkedAt: new Date(),
      checkedBy: a.userId,
      revision: item.revision + 1,
    });
    this.syncDiscrepancy(
      d,
      "DEVICE",
      new Types.ObjectId(itemId),
      result,
      {
        locationId: item.expectedLocationId,
        keeperId: item.expectedKeeperId,
        condition: item.expectedCondition,
      },
      {
        locationId: x.actualLocationId,
        keeperId: x.actualKeeperId,
        condition: x.actualCondition,
        found: x.found,
      },
    );
    try {
      await d.save();
    } catch {
      throw new ConflictException({ code: "COUNT_CONCURRENT_UPDATE" });
    }
    await this.log("INVENTORY_ITEM_CHECKED", d._id, a, { itemId, result });
    return this.get(id);
  }
  async checkPart(
    id: string,
    itemId: string,
    x: CheckPartDto,
    a: CurrentActor,
  ) {
    const d = await this.docs.findOne({ _id: id, status: "IN_PROGRESS" });
    if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
    const item = d.partItems.find(
      (value) =>
        String((value as typeof value & { _id: Types.ObjectId })._id) ===
        itemId,
    );
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (item.revision !== x.revision)
      throw new ConflictException({ code: "COUNT_CONCURRENT_UPDATE" });
    const difference = x.actualQuantity - item.expectedQuantity,
      result =
        difference === 0 ? "MATCHED" : difference < 0 ? "MISSING" : "SURPLUS";
    Object.assign(item, {
      ...x,
      difference,
      result,
      checked: true,
      checkedAt: new Date(),
      checkedBy: a.userId,
      revision: item.revision + 1,
    });
    this.syncDiscrepancy(
      d,
      "PART",
      new Types.ObjectId(itemId),
      result,
      { quantity: item.expectedQuantity },
      { quantity: x.actualQuantity, difference },
    );
    try {
      await d.save();
    } catch {
      throw new ConflictException({ code: "COUNT_CONCURRENT_UPDATE" });
    }
    await this.log("INVENTORY_ITEM_CHECKED", d._id, a, { itemId, result });
    return this.get(id);
  }
  async recordUnexpected(
    id: string,
    input: RecordUnexpectedDto,
    actor: CurrentActor,
  ) {
    const document = await this.docs.findOne({
      _id: id,
      status: "IN_PROGRESS",
    });
    if (!document)
      throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
    const assetCode = input.assetCode.trim().toUpperCase();
    if (document.deviceItems.some((item) => item.assetCode === assetCode))
      throw new ConflictException({ code: "COUNT_ASSET_ALREADY_EXPECTED" });
    if (document.unexpectedItems.some((item) => item.assetCode === assetCode))
      throw new ConflictException({ code: "COUNT_UNEXPECTED_DUPLICATE" });
    const known = await this.devices
      .findOne({ assetCode, isActive: true })
      .lean();
    const itemId = new Types.ObjectId();
    const result = known ? "WRONG_LOCATION" : "SURPLUS";
    document.unexpectedItems.push({
      _id: itemId,
      assetCode,
      serial: input.serial?.trim().toUpperCase(),
      name: input.name?.trim(),
      actualLocationId: input.actualLocationId
        ? new Types.ObjectId(input.actualLocationId)
        : undefined,
      result,
      note: input.note?.trim(),
      recordedAt: new Date(),
      recordedBy: actor.userId,
    });
    document.discrepancies.push({
      key: `UNEXPECTED:${String(itemId)}`,
      kind: "DEVICE",
      itemId,
      type: result,
      expected: known ? { locationId: known.locationId } : null,
      actual: {
        assetCode,
        serial: input.serial,
        locationId: input.actualLocationId,
      },
      status: "OPEN",
    });
    await document.save();
    await this.log("INVENTORY_ITEM_CHECKED", document._id, actor, {
      assetCode,
      unexpected: true,
      result,
    });
    return this.get(id);
  }

  private syncDiscrepancy(
    d: InventoryCountDocument,
    kind: "DEVICE" | "PART",
    itemId: Types.ObjectId,
    result: string,
    expected: unknown,
    actual: unknown,
  ) {
    const key = `${kind}:${String(itemId)}`;
    d.discrepancies = d.discrepancies.filter((v) => v.key !== key);
    if (result !== "MATCHED")
      d.discrepancies.push({
        key,
        kind,
        itemId,
        type: result as never,
        expected,
        actual,
        status: "OPEN",
      } as never);
  }
  async reconcile(id: string, a: CurrentActor) {
    const d = await this.docs.findOne({ _id: id, status: "IN_PROGRESS" });
    if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
    if ([...d.deviceItems, ...d.partItems].some((i) => !i.checked))
      throw new ConflictException({ code: "COUNT_ITEMS_UNCHECKED" });
    d.status = "RECONCILING";
    d.statusHistory.push({
      status: "RECONCILING",
      at: new Date(),
      by: a.userId,
    });
    await d.save();
    await this.log("INVENTORY_RECONCILED", d._id, a);
    return this.get(id);
  }
  async resolve(
    id: string,
    key: string,
    x: ResolveDiscrepancyDto,
    a: CurrentActor,
  ) {
    const session = await this.docs.db.startSession();
    try {
      await session.withTransaction(async () => {
        const d = await this.docs
          .findOne({ _id: id, status: "RECONCILING" })
          .session(session);
        if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
        const discrepancy = d.discrepancies.find((v) => v.key === key);
        if (!discrepancy || discrepancy.status !== "OPEN")
          throw new ConflictException({ code: "COUNT_DISCREPANCY_NOT_OPEN" });
        if (x.action === "ADJUST") {
          if (discrepancy.kind === "PART") {
            const item = d.partItems.find(
              (value) =>
                String(
                  (value as typeof value & { _id: Types.ObjectId })._id,
                ) === String(discrepancy.itemId),
            );
            if (!item)
              throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
            const delta = (item.actualQuantity ?? 0) - item.expectedQuantity;
            const balance = await this.balances.findOneAndUpdate(
              {
                partId: item.partId,
                warehouseId: item.warehouseId,
                quantity: { $gte: Math.max(0, -delta) },
              },
              { $inc: { quantity: delta } },
              { new: true, session },
            );
            if (!balance)
              throw new ConflictException({ code: "INSUFFICIENT_STOCK" });
            await this.transactions.create(
              [
                {
                  partId: item.partId,
                  warehouseId: item.warehouseId,
                  type: "INVENTORY_ADJUSTMENT",
                  quantity: delta,
                  inventoryCountId: d._id,
                  createdBy: a.userId,
                  note: `Điều chỉnh kiểm kê ${d.code}: ${x.cause}`,
                },
              ],
              { session },
            );
          } else {
            const item = d.deviceItems.find(
              (value) =>
                String(
                  (value as typeof value & { _id: Types.ObjectId })._id,
                ) === String(discrepancy.itemId),
            );
            if (!item)
              throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
            const set: Record<string, unknown> = {};
            if (item.actualLocationId) set.locationId = item.actualLocationId;
            if (item.actualKeeperId) set.keeperId = item.actualKeeperId;
            if (item.actualDepartmentId)
              set.departmentId = item.actualDepartmentId;
            if (item.actualWarehouseId)
              set.warehouseId = item.actualWarehouseId;
            if (item.actualCondition) set.techCondition = item.actualCondition;
            await this.devices.updateOne(
              { _id: item.deviceId },
              { $set: set },
              { session },
            );
          }
        }
        Object.assign(discrepancy, {
          status:
            x.action === "REJECT"
              ? "REJECTED"
              : x.action === "ACCEPT"
                ? "ACCEPTED"
                : "RESOLVED",
          cause: x.cause,
          resolution: x.resolution,
          note: x.note,
          resolvedBy: a.userId,
          resolvedAt: new Date(),
        });
        await d.save({ session });
      });
    } finally {
      await session.endSession();
    }
    await this.log("INVENTORY_ADJUSTED", new Types.ObjectId(id), a, {
      key,
      action: x.action,
    });
    return this.get(id);
  }
  async complete(id: string, a: CurrentActor) {
    const d = await this.docs.findOne({ _id: id, status: "RECONCILING" });
    if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
    if (d.discrepancies.some((v) => v.status === "OPEN"))
      throw new ConflictException({ code: "COUNT_DISCREPANCIES_OPEN" });
    const at = new Date();
    const changed = await this.docs.updateOne(
      { _id: id, status: "RECONCILING" },
      {
        $set: { status: "COMPLETED", completedAt: at, completedBy: a.userId },
        $push: { statusHistory: { status: "COMPLETED", at, by: a.userId } },
      },
    );
    if (changed.modifiedCount !== 1)
      throw new ConflictException({ code: "COUNT_CONCURRENT_UPDATE" });
    await this.log("INVENTORY_COMPLETED", new Types.ObjectId(id), a);
    return this.get(id);
  }
  async cancel(id: string, x: CancelCountDto, a: CurrentActor) {
    const at = new Date();
    const d = await this.docs.findOneAndUpdate(
      { _id: id, status: { $in: ["DRAFT", "IN_PROGRESS", "RECONCILING"] } },
      {
        $set: { status: "CANCELLED", cancelledAt: at, cancelledBy: a.userId },
        $push: {
          statusHistory: {
            status: "CANCELLED",
            at,
            by: a.userId,
            note: x.reason,
          },
        },
      },
      { new: true },
    );
    if (!d) throw new ConflictException({ code: "COUNT_INVALID_STATUS" });
    await this.log("INVENTORY_CANCELLED", d._id, a, { reason: x.reason });
    return this.get(id);
  }
  private async log(
    action: string,
    id: Types.ObjectId,
    a: CurrentActor,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.write({
      actorUserId: a.userId,
      action,
      entityType: "InventoryCountDocument",
      entityId: id,
      outcome: "SUCCESS",
      metadata,
    });
  }
}
