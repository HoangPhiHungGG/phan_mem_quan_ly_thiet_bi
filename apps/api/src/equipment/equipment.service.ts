import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types } from "mongoose";
import type { FilterQuery, Model } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import { Department, Warehouse } from "../identity/identity.schemas";
import {
  ComponentType,
  ItemModel,
  Keeper,
  Location,
  DeviceType,
  Supplier,
  Unit,
} from "../catalog/catalog.schemas";
import type {
  CreateDeviceDto,
  CreatePartDto,
  UpdateDeviceAttachmentsDto,
  UpdateDeviceDto,
  UpdatePartDto,
} from "./equipment.dto";
import {
  Device,
  type DeviceDocument,
  Part,
  type PartDocument,
  PartSerial,
  TECH_CONDITIONS,
  USAGE_STATUSES,
} from "./equipment.schemas";
import {
  AssetTransaction,
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { DisplayCodeService } from "../display-codes/display-code.service";

type AnyModel = Model<any>;

const DEVICE_POPULATE = [
  { path: "modelId", select: "code name" },
  { path: "deviceTypeId", select: "code name" },
  { path: "supplierId", select: "code name" },
  { path: "warehouseId", select: "code name" },
  { path: "locationId", select: "code name warehouseId" },
  { path: "departmentId", select: "code name" },
  { path: "keeperId", select: "code displayName employeeCode" },
];

const PART_POPULATE = [
  { path: "unitId", select: "code name" },
  { path: "componentTypeId", select: "code name" },
  { path: "modelId", select: "code name" },
  { path: "supplierId", select: "code name" },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

@Injectable()
export class EquipmentService {
  constructor(
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(PartSerial.name) private readonly partSerials: AnyModel,
    @InjectModel(ItemModel.name) private readonly itemModels: AnyModel,
    @InjectModel(DeviceType.name) private readonly deviceTypes: AnyModel,
    @InjectModel(ComponentType.name)
    private readonly componentTypes: AnyModel,
    @InjectModel(Supplier.name) private readonly suppliers: AnyModel,
    @InjectModel(Unit.name) private readonly units: AnyModel,
    @InjectModel(Keeper.name) private readonly keepers: AnyModel,
    @InjectModel(Location.name) private readonly locations: AnyModel,
    @InjectModel(Department.name) private readonly departments: AnyModel,
    @InjectModel(Warehouse.name) private readonly warehouses: AnyModel,
    @InjectModel(InventoryBalance.name)
    private readonly inventoryBalances: AnyModel,
    @InjectModel(InventoryTransaction.name)
    private readonly inventoryTransactions: AnyModel,
    @InjectModel(AssetTransaction.name)
    private readonly assetTransactions: Model<AssetTransaction>,
    private readonly audit: AuditService,
    private readonly displayCodes: DisplayCodeService,
  ) {}

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private duplicateField(error: unknown): string | undefined {
    if (
      typeof error !== "object" ||
      error === null ||
      !("keyPattern" in error)
    ) {
      return undefined;
    }
    const keyPattern = (error as { keyPattern?: Record<string, unknown> })
      .keyPattern;
    if (!keyPattern) return undefined;
    // Compound serial indexes normally start with partId. Prefer the field that
    // explains the conflict to the caller instead of the first index key.
    if ("serial" in keyPattern) return "serial";
    return Object.keys(keyPattern)[0];
  }

  private async assertRef(
    model: AnyModel,
    id: string | undefined,
    code: string,
  ): Promise<void> {
    if (!id) return;
    if (
      !Types.ObjectId.isValid(id) ||
      !(await model.exists({ _id: id, isActive: true }))
    ) {
      throw new BadRequestException({ code });
    }
  }

  async listDevices(query: {
    q?: string;
    deviceTypeId?: string;
    modelId?: string;
    available?: string;
    usageStatus?: string;
    techCondition?: string;
    departmentId?: string;
    keeperId?: string;
    warehouseId?: string;
    locationId?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: FilterQuery<Device> = { isActive: true };
    if (query.q?.trim()) {
      const pattern = new RegExp(escapeRegex(query.q.trim()), "i");
      filter.$or = [
        { assetCode: pattern },
        { serial: pattern },
        { notes: pattern },
      ];
    }
    if (query.deviceTypeId) filter.deviceTypeId = query.deviceTypeId;
    if (query.modelId) filter.modelId = query.modelId;
    if (
      query.usageStatus &&
      (USAGE_STATUSES as readonly string[]).includes(query.usageStatus)
    )
      filter.usageStatus = query.usageStatus;
    if (
      query.techCondition &&
      (TECH_CONDITIONS as readonly string[]).includes(query.techCondition)
    )
      filter.techCondition = query.techCondition;
    if (query.departmentId) filter.departmentId = query.departmentId;
    if (query.keeperId) filter.keeperId = query.keeperId;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.locationId) filter.locationId = query.locationId;
    if (query.available === "true")
      Object.assign(filter, {
        usageStatus: "IN_STOCK",
        techCondition: { $ne: "BROKEN" },
        keeperId: null,
      });
    const [items, total] = await Promise.all([
      this.devices
        .find(filter)
        .populate(DEVICE_POPULATE)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.devices.countDocuments(filter).exec(),
    ]);
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getDevice(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const device = await this.devices
      .findById(id)
      .populate(DEVICE_POPULATE)
      .lean()
      .exec();
    if (!device) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: device };
  }
  async createDevice(input: CreateDeviceDto, actor: CurrentActor) {
    await this.validateDeviceRefs(input);
    const session = await this.devices.db.startSession();
    let device: DeviceDocument | undefined;
    try {
      await session.withTransaction(async () => {
        const warehouse = (await this.warehouses
          .findOne({ _id: input.warehouseId, isActive: true })
          .session(session)
          .select("_id")
          .lean()) as { _id: Types.ObjectId } | null;
        if (!warehouse)
          throw new BadRequestException({
            code: "WAREHOUSE_REFERENCE_INVALID",
          });
        const created = await this.devices.create(
          [
            {
              assetCode: input.assetCode.trim().toUpperCase(),
              serial: emptyToUndefined(input.serial)?.toUpperCase(),
              modelId: input.modelId,
              deviceTypeId: input.deviceTypeId,
              supplierId: input.supplierId,
              purchasedAt: input.purchasedAt,
              receivedAt: new Date(),
              purchasePrice: input.purchasePrice,
              warrantyUntil: input.warrantyUntil,
              techCondition: input.techCondition,
              notes: input.notes?.trim(),
              warehouseId: warehouse._id,
              usageStatus: "IN_STOCK",
              departmentId: undefined,
              keeperId: undefined,
              locationId: undefined,
            },
          ],
          { session },
        );
        device = created[0];
        await this.assetTransactions.create(
          [
            {
              deviceId: device._id,
              warehouseId: warehouse._id,
              type: "INITIAL_RECEIPT",
              source: "DEVICE_CREATE",
              quantity: 1,
              assetCode: device.assetCode,
              serial: device.serial,
              createdBy: actor.userId,
              note:
                input.initialReceiptNote?.trim() ||
                "Nhập kho ban đầu khi tạo thiết bị",
            },
          ],
          { session },
        );
        await this.audit.write(
          {
            actorUserId: actor.userId,
            action: "DEVICE_CREATED",
            entityType: "Device",
            entityId: device._id,
            outcome: "SUCCESS",
            metadata: {
              assetCode: device.assetCode,
              warehouseId: input.warehouseId,
              initialReceipt: true,
            },
          },
          session,
        );
      });
      if (!device) throw new Error("DEVICE_CREATE_FAILED");
      return { data: device.toObject() };
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException({
          code:
            this.duplicateField(error) === "serial"
              ? "DEVICE_SERIAL_EXISTS"
              : "DEVICE_CODE_EXISTS",
        });
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Không cho sửa trực tiếp: người giữ, bộ phận, kho/vị trí, trạng thái sử dụng
  // (chỉ thay đổi qua nghiệp vụ cấp phát/thu hồi/điều chuyển ở bước sau)
  async updateDevice(id: string, input: UpdateDeviceDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.validateDeviceRefs(input);
    const update: Record<string, unknown> = {};
    if (input.serial !== undefined)
      update.serial = emptyToUndefined(input.serial)?.toUpperCase();
    if (input.modelId !== undefined) update.modelId = input.modelId;
    if (input.deviceTypeId !== undefined)
      update.deviceTypeId = input.deviceTypeId;
    if (input.supplierId !== undefined) update.supplierId = input.supplierId;
    if (input.purchasedAt !== undefined) update.purchasedAt = input.purchasedAt;
    if (input.purchasePrice !== undefined)
      update.purchasePrice = input.purchasePrice;
    if (input.warrantyUntil !== undefined)
      update.warrantyUntil = input.warrantyUntil;
    if (input.techCondition !== undefined)
      update.techCondition = input.techCondition;
    if (input.notes !== undefined) update.notes = input.notes.trim();
    try {
      const device = await this.devices
        .findByIdAndUpdate(id, { $set: update }, { new: true })
        .populate(DEVICE_POPULATE)
        .lean()
        .exec();
      if (!device) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "DEVICE_UPDATED",
        entityType: "Device",
        entityId: device._id,
        outcome: "SUCCESS",
      });
      return { data: device };
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "DEVICE_SERIAL_EXISTS" });
      throw error;
    }
  }
  async updateDeviceAttachments(
    id: string,
    input: UpdateDeviceAttachmentsDto,
    actor: CurrentActor,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const device = await this.devices
      .findByIdAndUpdate(
        id,
        {
          $set: {
            attachments: input.attachments.map((item) => ({
              name: item.name.trim(),
              url: item.url?.trim(),
              note: item.note?.trim(),
            })),
          },
        },
        { new: true },
      )
      .populate(DEVICE_POPULATE)
      .lean()
      .exec();
    if (!device) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "DEVICE_ATTACHMENTS_UPDATED",
      entityType: "Device",
      entityId: device._id,
      outcome: "SUCCESS",
      metadata: { count: input.attachments.length },
    });
    return { data: device };
  }

  async removeDevice(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const device = await this.devices
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .lean()
      .exec();
    if (!device) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "DEVICE_DEACTIVATED",
      entityType: "Device",
      entityId: device._id,
      outcome: "SUCCESS",
    });
    return { data: device };
  }

  async listParts(query: {
    q?: string;
    trackingMode?: string;
    componentTypeId?: string;
    modelId?: string;
    isActive?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: FilterQuery<Part> = {};
    if (query.q?.trim()) {
      const pattern = new RegExp(escapeRegex(query.q.trim()), "i");
      filter.$or = [{ code: pattern }, { name: pattern }, { spec: pattern }];
    }
    if (query.trackingMode === "QUANTITY" || query.trackingMode === "SERIAL")
      filter.trackingMode = query.trackingMode;
    if (query.componentTypeId) filter.componentTypeId = query.componentTypeId;
    if (query.modelId) filter.modelId = query.modelId;
    if (query.isActive === "true") filter.isActive = true;
    if (query.isActive === "false") filter.isActive = false;
    const [items, total] = await Promise.all([
      this.parts
        .find(filter)
        .populate(PART_POPULATE)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.parts.countDocuments(filter).exec(),
    ]);
    const balanceTotals = (await this.inventoryBalances
      .aggregate([{ $group: { _id: "$partId", total: { $sum: "$quantity" } } }])
      .exec()) as unknown as Array<{ _id: Types.ObjectId; total: number }>;
    const totalByPart = new Map(
      balanceTotals.map((item) => [item._id.toString(), item.total]),
    );
    return {
      // InventoryBalance là nguồn số dư duy nhất. stockQty chỉ được giữ trong
      // schema Part để tương thích dữ liệu cũ, không còn dùng để hiển thị/tính.
      data: items.map((item) => ({
        ...item,
        stockQty: totalByPart.get(item._id.toString()) ?? 0,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
  async getPart(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const [part, totals] = await Promise.all([
      this.parts.findById(id).populate(PART_POPULATE).lean().exec(),
      this.inventoryBalances.aggregate<{ total: number }>([
        { $match: { partId: new Types.ObjectId(id) } },
        { $group: { _id: null, total: { $sum: "$quantity" } } },
      ]),
    ]);
    if (!part) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: { ...part, stockQty: totals[0]?.total ?? 0 } };
  }

  async createPart(input: CreatePartDto, actor: CurrentActor) {
    await this.validatePartRefs(
      input.unitId,
      input.componentTypeId,
      input.modelId,
      input.supplierId,
    );
    const initial = input.initialStock;
    const hasWarehouse = Boolean(initial?.warehouseId);
    const serials = (initial?.serials ?? [])
      .map((serial) => serial.trim().toUpperCase())
      .filter(Boolean);
    const quantity =
      input.trackingMode === "SERIAL"
        ? serials.length
        : (initial?.quantity ?? 0);
    if (new Set(serials).size !== serials.length)
      throw new BadRequestException({
        code: "PART_SERIAL_DUPLICATE_IN_INITIAL_STOCK",
      });
    if (input.trackingMode === "SERIAL" && hasWarehouse && !serials.length)
      throw new BadRequestException({
        code: "INITIAL_STOCK_SERIALS_REQUIRED",
      });
    if (!hasWarehouse && quantity > 0)
      throw new BadRequestException({
        code: "INITIAL_STOCK_WAREHOUSE_REQUIRED",
      });
    if (input.trackingMode === "QUANTITY" && hasWarehouse && quantity <= 0)
      throw new BadRequestException({
        code: "INITIAL_STOCK_QUANTITY_REQUIRED",
      });
    if (input.trackingMode === "QUANTITY" && serials.length)
      throw new BadRequestException({ code: "PART_SERIAL_NOT_ALLOWED" });
    if (hasWarehouse)
      await this.assertRef(
        this.warehouses,
        initial!.warehouseId,
        "WAREHOUSE_REFERENCE_INVALID",
      );
    const incomingTypes = ["OPENING", "PURCHASE", "RETURN", "TRANSFER_IN"];
    if (initial?.type && !incomingTypes.includes(initial.type))
      throw new BadRequestException({ code: "INITIAL_STOCK_TYPE_INVALID" });
    const code =
      input.code?.trim().toUpperCase() ??
      (await this.displayCodes.nextCode(
        "COMPONENT",
        input.name,
        async (candidate) =>
          Boolean(await this.parts.exists({ code: candidate })),
      ));
    const session = await this.parts.db.startSession();
    try {
      let part: PartDocument | undefined;
      await session.withTransaction(async () => {
        const created = await this.parts.create(
          [
            {
              code,
              name: input.name.trim(),
              trackingMode: input.trackingMode,
              unitId: input.unitId,
              componentTypeId: input.componentTypeId,
              modelId: input.modelId,
              supplierId: input.supplierId,
              spec: input.spec?.trim(),
              note: input.note?.trim(),
              minQty: input.minQty ?? 0,
              stockQty: 0,
            },
          ],
          { session },
        );
        part = created[0];
        if (!hasWarehouse || !part) return;
        await this.inventoryBalances.create(
          [{ partId: part._id, warehouseId: initial!.warehouseId, quantity }],
          { session },
        );
        await this.inventoryTransactions.create(
          [
            {
              partId: part._id,
              warehouseId: initial!.warehouseId,
              type: initial!.type ?? "OPENING",
              quantity,
              note:
                initial!.note?.trim() || "Nhập kho ban đầu khi tạo linh kiện",
              createdBy: actor.userId,
            },
          ],
          { session },
        );
        if (input.trackingMode === "SERIAL") {
          await this.partSerials.create(
            serials.map((serial) => ({
              partId: part!._id,
              serial,
              warehouseId: initial!.warehouseId,
              status: "IN_STOCK",
            })),
            { session, ordered: true },
          );
        }
      });
      if (!part) throw new BadRequestException({ code: "PART_CREATE_FAILED" });
      await this.audit.write({
        actorUserId: actor.userId,
        action: "PART_CREATED",
        entityType: "Part",
        entityId: part._id,
        outcome: "SUCCESS",
        metadata: {
          code: part.code,
          trackingMode: part.trackingMode,
          initialQuantity: quantity,
          warehouseId: initial?.warehouseId,
        },
      });
      return { data: { ...part.toObject(), stockQty: quantity } };
    } catch (error) {
      if (this.isDuplicate(error)) {
        if (this.duplicateField(error) === "serial")
          throw new ConflictException({ code: "PART_SERIAL_ALREADY_EXISTS" });
        throw new ConflictException({ code: "PART_CODE_EXISTS" });
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async updatePart(id: string, input: UpdatePartDto, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const part = await this.parts.findById(id).lean().exec();
    if (!part) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.validatePartRefs(
      input.unitId ?? part.unitId.toString(),
      input.componentTypeId ?? part.componentTypeId?.toString(),
      input.modelId ?? part.modelId?.toString(),
      input.supplierId,
    );
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.unitId !== undefined) update.unitId = input.unitId;
    if (input.componentTypeId !== undefined)
      update.componentTypeId = input.componentTypeId;
    if (input.modelId !== undefined) update.modelId = input.modelId;
    if (input.supplierId !== undefined) update.supplierId = input.supplierId;
    if (input.spec !== undefined) update.spec = input.spec.trim();
    if (input.note !== undefined) update.note = input.note.trim();
    if (input.minQty !== undefined) update.minQty = input.minQty;
    const updated = await this.parts
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .populate(PART_POPULATE)
      .lean()
      .exec();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "PART_UPDATED",
      entityType: "Part",
      entityId: updated!._id,
      outcome: "SUCCESS",
    });
    return { data: updated };
  }
  async updatePartStatus(id: string, isActive: boolean, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const part = await this.parts
      .findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
      .lean()
      .exec();
    if (!part) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: isActive ? "PART_ACTIVATED" : "PART_DEACTIVATED",
      entityType: "Part",
      entityId: part._id,
      outcome: "SUCCESS",
    });
    return { data: part };
  }

  async removePart(id: string, actor: CurrentActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const [part, serialCount, balanceCount, transactionCount] =
      await Promise.all([
        this.parts.findById(id).lean().exec(),
        this.partSerials.countDocuments({ partId: id }).exec(),
        this.inventoryBalances.countDocuments({ partId: id }).exec(),
        this.inventoryTransactions.countDocuments({ partId: id }).exec(),
      ]);
    if (!part) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (serialCount || balanceCount || transactionCount) {
      throw new ConflictException({
        code: "PART_IN_USE",
        message:
          "Không thể xóa linh kiện vì đã có tồn kho, serial hoặc giao dịch. Hãy dùng Ngừng sử dụng.",
      });
    }
    await this.parts.deleteOne({ _id: id }).exec();
    await this.audit.write({
      actorUserId: actor.userId,
      action: "PART_DELETED",
      entityType: "Part",
      entityId: part._id,
      outcome: "SUCCESS",
    });
    return { data: { id } };
  }

  async listPartSerials(
    id: string,
    query: { status?: string; page?: string; limit?: string },
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    if (!(await this.parts.exists({ _id: id })))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const filter: Record<string, unknown> = { partId: id };
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      this.partSerials
        .find(filter)
        .populate([
          { path: "warehouseId", select: "code name" },
          { path: "locationId", select: "code name" },
        ])
        .sort({ serial: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.partSerials.countDocuments(filter).exec(),
    ]);
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
  private async validateDeviceRefs(
    input: CreateDeviceDto | UpdateDeviceDto,
  ): Promise<void> {
    await this.assertModelRef(input.modelId, "DEVICE");
    await this.assertRef(
      this.deviceTypes,
      input.deviceTypeId,
      "DEVICE_TYPE_REFERENCE_INVALID",
    );
    await this.assertRef(
      this.suppliers,
      input.supplierId,
      "SUPPLIER_REFERENCE_INVALID",
    );
    if (input.modelId && input.deviceTypeId) {
      const model = (await this.itemModels
        .findOne({ _id: input.modelId, isActive: true, entityType: "DEVICE" })
        .select("deviceTypeId")
        .lean()
        .exec()) as { deviceTypeId?: Types.ObjectId } | null;
      if (
        model?.deviceTypeId &&
        String(model.deviceTypeId) !== input.deviceTypeId
      ) {
        throw new BadRequestException({ code: "MODEL_DEVICE_TYPE_MISMATCH" });
      }
    }
  }

  private async validatePartRefs(
    unitId: string,
    componentTypeId?: string,
    modelId?: string,
    supplierId?: string,
  ): Promise<void> {
    await this.assertRef(this.units, unitId, "UNIT_REFERENCE_INVALID");
    await this.assertRef(
      this.componentTypes,
      componentTypeId,
      "COMPONENT_TYPE_REFERENCE_INVALID",
    );
    await this.assertModelRef(modelId, "COMPONENT");
    await this.assertRef(
      this.suppliers,
      supplierId,
      "SUPPLIER_REFERENCE_INVALID",
    );
    if (modelId && componentTypeId) {
      const model = (await this.itemModels
        .findOne({ _id: modelId, isActive: true, entityType: "COMPONENT" })
        .select("componentTypeId")
        .lean()
        .exec()) as { componentTypeId?: Types.ObjectId } | null;
      if (
        model?.componentTypeId &&
        String(model.componentTypeId) !== componentTypeId
      ) {
        throw new BadRequestException({
          code: "MODEL_COMPONENT_TYPE_MISMATCH",
        });
      }
    }
  }

  private async assertModelRef(
    id: string | undefined,
    entityType: "DEVICE" | "COMPONENT",
  ): Promise<void> {
    if (!id) return;
    if (
      !Types.ObjectId.isValid(id) ||
      !(await this.itemModels.exists({ _id: id, isActive: true, entityType }))
    ) {
      throw new BadRequestException({
        code:
          entityType === "DEVICE"
            ? "DEVICE_MODEL_REFERENCE_INVALID"
            : "COMPONENT_MODEL_REFERENCE_INVALID",
      });
    }
  }
}
