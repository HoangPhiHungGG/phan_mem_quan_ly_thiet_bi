/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types } from "mongoose";
import type { Model } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import { User } from "../identity/identity.schemas";
import { Department } from "../identity/identity.schemas";
import {
  DeviceType,
  ItemModel,
  Supplier,
  Unit,
} from "../catalog/catalog.schemas";
import { Part } from "../equipment/equipment.schemas";
import type { CreatePurchaseDto, ReceiveDto } from "./purchase.dto";
import {
  PurchaseRequest,
  type PURCHASE_ACTIONS,
  type PURCHASE_STATUSES,
} from "./purchase.schemas";

type AnyModel = Model<any>;

const POPULATE = [
  { path: "requestedBy", select: "displayName employeeCode" },
  { path: "requestDepartmentId", select: "code name" },
  { path: "supplierId", select: "code name" },
  { path: "createdBy", select: "displayName employeeCode" },
  { path: "updatedBy", select: "displayName employeeCode" },
  { path: "completedBy", select: "displayName employeeCode" },
  { path: "items.deviceTypeId", select: "code name" },
  { path: "items.componentTypeId", select: "code name" },
  { path: "items.modelId", select: "code name" },
  { path: "items.unitId", select: "code name" },
  { path: "items.partId", select: "code name trackingMode spec" },
  { path: "history.actorUserId", select: "displayName employeeCode" },
];

const isObjectId = (value: unknown): boolean =>
  typeof value === "string" && Types.ObjectId.isValid(value);
@Injectable()
export class PurchaseService {
  constructor(
    @InjectModel(PurchaseRequest.name)
    private readonly purchases: Model<PurchaseRequest>,
    @InjectModel(User.name) private readonly users: AnyModel,
    @InjectModel(Department.name) private readonly departments: AnyModel,
    @InjectModel(Supplier.name) private readonly suppliers: AnyModel,
    @InjectModel(Part.name) private readonly parts: AnyModel,
    @InjectModel(DeviceType.name) private readonly deviceTypes: AnyModel,
    @InjectModel(ItemModel.name) private readonly itemModels: AnyModel,
    @InjectModel(Unit.name) private readonly units: AnyModel,
    private readonly audit: AuditService,
  ) {}

  private async assertDepartment(id?: string) {
    if (id && !(await this.departments.exists({ _id: id, isActive: true })))
      throw new BadRequestException({ code: "DEPARTMENT_REFERENCE_INVALID" });
  }
  private async assertSupplier(id?: string) {
    if (id && !(await this.suppliers.exists({ _id: id, isActive: true })))
      throw new BadRequestException({ code: "SUPPLIER_REFERENCE_INVALID" });
  }

  // Autofill snapshots dòng hàng từ danh mục/linh kiện + tin thành tiền.
  private async enrichItems(
    input: CreatePurchaseDto,
  ): Promise<PurchaseRequest["items"]> {
    if (!input.items.length)
      throw new BadRequestException({ code: "PURCHASE_ITEMS_REQUIRED" });
    const items: PurchaseRequest["items"] = [];
    for (const it of input.items) {
      if (it.kind === "PART") {
        const part = it.partId
          ? await this.parts.findById(it.partId).exec()
          : undefined;
        if (!part)
          throw new BadRequestException({ code: "PART_REFERENCE_INVALID" });
        const unit = part.unitId
          ? await this.units.findById(part.unitId).exec()
          : undefined;
        items.push({
          kind: "PART",
          partId: part._id,
          componentTypeId: part.componentTypeId,
          modelId: part.modelId,
          unitId: part.unitId,
          name: it.name?.trim() || part.name || "",
          modelCode: it.modelCode?.trim() || part.code || "",
          spec: it.spec?.trim() || part.spec?.trim() || "",
          unitName: it.unitName?.trim() || unit?.name || "",
          requestedQty: it.requestedQty,
          approvedQty: 0,
          orderedQty: 0,
          receivedQty: 0,
          unitPrice: it.unitPrice,
          amount: r2(it.requestedQty * it.unitPrice),
          note: it.note?.trim(),
        });
      } else {
        if (!it.deviceTypeId)
          throw new BadRequestException({
            code: "DEVICE_TYPE_REFERENCE_INVALID",
          });
        const type = await this.deviceTypes.findOne({
          _id: it.deviceTypeId,
          isActive: true,
        });
        if (!type)
          throw new BadRequestException({
            code: "DEVICE_TYPE_REFERENCE_INVALID",
          });
        let modelName = "";
        let modelCode = "";
        if (it.modelId) {
          const model = await this.itemModels.findOne({
            _id: it.modelId,
            isActive: true,
            entityType: "DEVICE",
          });
          if (!model)
            throw new BadRequestException({
              code: "MODEL_REFERENCE_INVALID",
            });
          modelName = model.name || "";
          modelCode = it.modelCode?.trim() || model.code || "";
        }
        const unit = it.unitId
          ? await this.units.findOne({ _id: it.unitId, isActive: true })
          : undefined;
        items.push({
          kind: "DEVICE",
          deviceTypeId: type._id,
          modelId: it.modelId ? new Types.ObjectId(it.modelId) : undefined,
          unitId: it.unitId ? new Types.ObjectId(it.unitId) : undefined,
          name: it.name?.trim() || type.name || modelName,
          modelCode,
          spec: it.spec?.trim(),
          unitName: it.unitName?.trim() || unit?.name,
          requestedQty: it.requestedQty,
          approvedQty: 0,
          orderedQty: 0,
          receivedQty: 0,
          unitPrice: it.unitPrice,
          amount: r2(it.requestedQty * it.unitPrice),
          note: it.note?.trim(),
        });
      }
    }
    return items;
  }

  private totals(items: PurchaseRequest["items"], input: CreatePurchaseDto) {
    const subtotal = r2(
      items.reduce((sum, item) => sum + item.requestedQty * item.unitPrice, 0),
    );
    const discount = r2(Math.max(0, input.discount ?? 0));
    const tax = r2(Math.max(0, input.tax ?? 0));
    const otherCost = r2(Math.max(0, input.otherCost ?? 0));
    return {
      subtotal,
      discount,
      tax,
      otherCost,
      totalAmount: r2(subtotal - discount + tax + otherCost),
    };
  }

  private async genCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const suffix = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 36),
      )
        .map((v) => v.toString(36).toUpperCase())
        .join("");
      const code = `MS-${date}-${suffix}`;
      const exists = await this.purchases.exists({ code });
      if (!exists) return code;
    }
    throw new ConflictException({ code: "CODE_GENERATION_FAILED" });
  }
  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.requestDepartmentId)
      filter.requestDepartmentId = query.requestDepartmentId;
    if (query.requestedBy) filter.requestedBy = query.requestedBy;
    if (query.supplierId) filter.supplierId = query.supplierId;
    if (query.from) filter.requestDate = { $gte: new Date(query.from) };
    if (query.until) {
      filter.requestDate = {
        ...(filter.requestDate as object),
        $lte: new Date(`${query.until}T23:59:59`),
      };
    }
    if (query.q?.trim())
      filter.code = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
    const [data, total] = await Promise.all([
      this.purchases
        .find(filter)
        .populate(POPULATE)
        .sort({ requestDate: -1, code: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.purchases.countDocuments(filter).exec(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  private async getRaw(id: string) {
    if (!isObjectId(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return this.purchases.findById(id).exec();
  }

  async get(id: string) {
    if (!isObjectId(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const doc = await this.purchases
      .findById(id)
      .populate(POPULATE)
      .lean()
      .exec();
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: doc };
  }

  async getForIn(id: string) {
    const result = await this.get(id);
    return { in: true, ...result };
  }
  async create(input: CreatePurchaseDto, actor: CurrentActor) {
    await this.assertDepartment(input.requestDepartmentId);
    await this.assertSupplier(input.supplierId);
    const items = await this.enrichItems(input);
    const money = this.totals(items, input);
    const code = await this.genCode();
    const proponentId = input.requestedBy
      ? new Types.ObjectId(input.requestedBy)
      : actor.userId;
    try {
      const doc = await this.purchases.create({
        code,
        status: "DRAFT",
        requestDate: new Date(input.requestDate),
        requestedBy: proponentId,
        requestDepartmentId: input.requestDepartmentId
          ? new Types.ObjectId(input.requestDepartmentId)
          : undefined,
        supplierId: input.supplierId
          ? new Types.ObjectId(input.supplierId)
          : undefined,
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : undefined,
        reason: input.reason.trim(),
        note: input.note?.trim(),
        items,
        ...money,
        history: [
          {
            action: "CREATED",
            to: "DRAFT",
            actorUserId: actor.userId,
            at: new Date(),
          },
        ],
        createdBy: actor.userId,
        updatedBy: actor.userId,
      });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "PURCHASE_CREATED",
        entityType: "PurchaseRequest",
        entityId: doc._id,
        outcome: "SUCCESS",
        metadata: { code: doc.code },
      });
      return this.get(String(doc._id));
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "PURCHASE_CODE_EXISTS" });
      throw error;
    }
  }

  async update(id: string, input: CreatePurchaseDto, actor: CurrentActor) {
    const doc = await this.getRaw(id);
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (doc.status !== "DRAFT")
      throw new ConflictException({
        code: "PURCHASE_NOT_EDITABLE",
        message: "Chỉ phiếu nháp được chỉnh sửa trực tiếp.",
      });
    await this.assertDepartment(input.requestDepartmentId);
    await this.assertSupplier(input.supplierId);
    const items = await this.enrichItems(input);
    const money = this.totals(items, input);
    doc.requestDate = new Date(input.requestDate);
    doc.requestDepartmentId = input.requestDepartmentId
      ? new Types.ObjectId(input.requestDepartmentId)
      : undefined;
    doc.supplierId = input.supplierId
      ? new Types.ObjectId(input.supplierId)
      : undefined;
    doc.expectedDeliveryDate = input.expectedDeliveryDate
      ? new Date(input.expectedDeliveryDate)
      : undefined;
    doc.reason = input.reason.trim();
    doc.note = input.note?.trim();
    doc.items = items;
    doc.subtotal = money.subtotal;
    doc.discount = money.discount;
    doc.tax = money.tax;
    doc.otherCost = money.otherCost;
    doc.totalAmount = money.totalAmount;
    doc.updatedBy = actor.userId;
    doc.history.push({
      action: "UPDATED",
      actorUserId: actor.userId,
      at: new Date(),
    });
    try {
      await doc.save();
    } catch (error) {
      if (this.isVersion(error))
        throw new ConflictException({ code: "PURCHASE_CONCURRENT_UPDATE" });
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "PURCHASE_CODE_EXISTS" });
      throw error;
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: "PURCHASE_UPDATED",
      entityType: "PurchaseRequest",
      entityId: doc._id,
      outcome: "SUCCESS",
      metadata: { code: doc.code },
    });
    return this.get(id);
  }

  async remove(id: string, actor: CurrentActor) {
    const doc = await this.getRaw(id);
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (doc.status !== "DRAFT")
      throw new ConflictException({
        code: "PURCHASE_NOT_EDITABLE",
        message:
          "Chỉ phiếu nháp được xóa; chứng từ đã gửi/hoàn tất không xóa vật lich.",
      });
    await this.purchases.deleteOne({ _id: doc._id }).exec();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "PURCHASE_DELETED",
      entityType: "PurchaseRequest",
      entityId: doc._id,
      outcome: "SUCCESS",
      metadata: { code: doc.code },
    });
    return { data: { id } };
  }
  private async transition(
    id: string,
    from: (typeof PURCHASE_STATUSES)[number],
    to: (typeof PURCHASE_STATUSES)[number],
    action: (typeof PURCHASE_ACTIONS)[number],
    actor: CurrentActor,
    note?: string,
  ) {
    const doc = await this.getRaw(id);
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    // Idempotent: đòr gửi trùng trạ trạng cư (không xử dwa lần)
    if (doc.status === to) return this.get(id);
    if (doc.status !== from)
      throw new ConflictException({ code: "PURCHASE_STATUS_INVALID" });
    doc.status = to;
    doc.updatedBy = actor.userId;
    if (to === "APPROVED") {
      doc.items = doc.items.map((item) => ({
        ...item,
        approvedQty: item.requestedQty,
      }));
    } else if (to === "ORDERED") {
      doc.items = doc.items.map((item) => ({
        ...item,
        orderedQty: item.approvedQty,
      }));
    } else if (to === "COMPLETED") {
      doc.completedBy = actor.userId;
      doc.completedAt = new Date();
    } else if (to === "REJECTED") {
      doc.rejectionReason = note;
    } else if (to === "CANCELLED") {
      doc.cancelledAt = new Date();
      doc.cancelReason = note;
    }
    doc.history.push({
      action,
      from,
      to,
      actorUserId: actor.userId,
      at: new Date(),
      note,
    });
    try {
      await doc.save();
    } catch (error) {
      if (this.isVersion(error))
        throw new ConflictException({ code: "PURCHASE_CONCURRENT_UPDATE" });
      throw error;
    }
    await this.audit.write({
      actorUserId: actor.userId,
      action: `PURCHASE_${action}`,
      entityType: "PurchaseRequest",
      entityId: doc._id,
      outcome: "SUCCESS",
      metadata: { code: doc.code, from, to, note },
    });
    return this.get(id);
  }

  async submit(id: string, actor: CurrentActor) {
    return this.transition(id, "DRAFT", "SUBMITTED", "SUBMITTED", actor);
  }
  async approve(id: string, actor: CurrentActor) {
    return this.transition(id, "SUBMITTED", "APPROVED", "APPROVED", actor);
  }
  async reject(id: string, actor: CurrentActor, reason: string) {
    return this.transition(
      id,
      "SUBMITTED",
      "REJECTED",
      "REJECTED",
      actor,
      reason,
    );
  }
  async order(id: string, actor: CurrentActor) {
    return this.transition(id, "APPROVED", "ORDERED", "ORDERED", actor);
  }
  async cancel(id: string, actor: CurrentActor, reason: string) {
    const doc = await this.getRaw(id);
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (doc.status === "CANCELLED") return this.get(id);
    if (!["DRAFT", "SUBMITTED", "APPROVED", "ORDERED"].includes(doc.status))
      throw new ConflictException({ code: "PURCHASE_STATUS_INVALID" });
    return this.transition(
      id,
      doc.status,
      "CANCELLED",
      "CANCELLED",
      actor,
      reason,
    );
  }
  async receive(
    id: string,
    input: ReceiveDto,
    actor: CurrentActor,
    receiveKey?: string,
  ) {
    const doc = await this.getRaw(id);
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (["COMPLETED", "CANCELLED", "REJECTED"].includes(doc.status))
      throw new ConflictException({ code: "PURCHASE_STATUS_INVALID" });
    const key = receiveKey?.trim();
    if (key) {
      const already = doc.history.find((h) => h.receiveKey === key);
      if (already) return this.get(id);
    }
    const before = doc.status;
    const nextItems = [...doc.items];
    for (const r of input.items) {
      if (r.index < 0 || r.index >= nextItems.length)
        throw new BadRequestException({ code: "PURCHASE_LINE_INDEX_INVALID" });
      const item = nextItems[r.index];
      if (r.receivedQty < item.receivedQty)
        throw new BadRequestException({
          code: "PURCHASE_RECEIVE_DECREASE_FORBIDDEN",
        });
      if (r.receivedQty > item.approvedQty)
        throw new BadRequestException({ code: "PURCHASE_RECEIVE_EXCEEDS" });
      nextItems[r.index] = { ...item, receivedQty: r.receivedQty };
    }
    const allReceived = nextItems.every(
      (item) => item.approvedQty > 0 && item.receivedQty >= item.approvedQty,
    );
    doc.items = nextItems;
    doc.status = allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
    doc.updatedBy = actor.userId;
    doc.history.push({
      action: "RECEIVED",
      from: before,
      to: doc.status,
      actorUserId: actor.userId,
      at: new Date(),
      receiveKey: key,
    });
    await doc.save();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "PURCHASE_RECEIVED",
      entityType: "PurchaseRequest",
      entityId: doc._id,
      outcome: "SUCCESS",
      metadata: { code: doc.code, from: before, to: doc.status },
    });
    return this.get(id);
  }
  async complete(id: string, actor: CurrentActor) {
    const doc = await this.getRaw(id);
    if (!doc) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (doc.status === "COMPLETED") return this.get(id);
    if (doc.status !== "RECEIVED")
      throw new ConflictException({
        code: "PURCHASE_NOT_FULLY_RECEIVED",
        message:
          "Hoàn tất chỉ khi hàng đã nhận đủ và phiếu ở trạng tái RECEIVED.",
      });
    const allReceived = doc.items.every(
      (item) => item.approvedQty > 0 && item.receivedQty >= item.approvedQty,
    );
    if (!allReceived)
      throw new ConflictException({ code: "PURCHASE_NOT_FULLY_RECEIVED" });
    return this.transition(id, "RECEIVED", "COMPLETED", "COMPLETED", actor);
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
  private isVersion(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "VersionError"
    );
  }
}
const r2 = (value: number): number => Math.round(value * 100) / 100;
