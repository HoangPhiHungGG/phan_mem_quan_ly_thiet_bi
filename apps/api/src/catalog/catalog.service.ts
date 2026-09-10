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
import {
  Department,
  RoleAssignment,
  User,
  Warehouse,
} from "../identity/identity.schemas";
import { Device, Part, PartSerial } from "../equipment/equipment.schemas";
import { OperationDocument } from "../operations/operation.schemas";
import {
  DeviceType,
  ItemModel,
  Keeper,
  Location,
  Position,
  Supplier,
  Unit,
} from "./catalog.schemas";
import type {
  CatalogType,
  CreateCatalogDto,
  UpdateCatalogDto,
} from "./catalog.dto";

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
type AnyModel = Model<any>;

type ReferenceCheck = { model: AnyModel; path: string; label: string };

type CatalogEntry = {
  model: AnyModel;
  label: string;
  codeRequired: boolean;
  searchFields: string[];
  nameField: string;
  populates: { path: string; select: string }[];
  references: ReferenceCheck[];
};

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Keeper.name) private readonly keepers: AnyModel,
    @InjectModel(Position.name) private readonly positions: AnyModel,
    @InjectModel(Supplier.name) private readonly suppliers: AnyModel,
    @InjectModel(DeviceType.name) private readonly deviceTypes: AnyModel,
    @InjectModel(Unit.name) private readonly units: AnyModel,
    @InjectModel(ItemModel.name) private readonly itemModels: AnyModel,
    @InjectModel(Location.name) private readonly locations: AnyModel,
    @InjectModel(Department.name) private readonly departments: AnyModel,
    @InjectModel(Warehouse.name) private readonly warehouses: AnyModel,
    @InjectModel(Device.name) private readonly devices: AnyModel,
    @InjectModel(Part.name) private readonly parts: AnyModel,
    @InjectModel(PartSerial.name) private readonly partSerials: AnyModel,
    @InjectModel(User.name) private readonly users: AnyModel,
    @InjectModel(RoleAssignment.name)
    private readonly roleAssignments: AnyModel,
    @InjectModel(OperationDocument.name)
    private readonly operations: AnyModel,
    private readonly audit: AuditService,
  ) {}
  private readonly entries: Record<CatalogType, CatalogEntry> = {
    departments: {
      label: "Bộ phận",
      model: this.departments,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [
        { path: "parentId", select: "code name" },
        { path: "managerKeeperId", select: "displayName employeeCode" },
      ],
      references: [
        { model: this.users, path: "primaryDepartmentId", label: "tài khoản" },
        { model: this.departments, path: "parentId", label: "bộ phận con" },
        { model: this.warehouses, path: "departmentId", label: "kho" },
        { model: this.devices, path: "departmentId", label: "thiết bị" },
        { model: this.keepers, path: "departmentId", label: "người giữ" },
      ],
    },
    warehouses: {
      label: "Kho",
      model: this.warehouses,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [{ path: "departmentId", select: "code name" }],
      references: [
        { model: this.locations, path: "warehouseId", label: "vị trí" },
        { model: this.devices, path: "warehouseId", label: "thiết bị" },
        {
          model: this.roleAssignments,
          path: "scope.warehouseIds",
          label: "phân quyền",
        },
      ],
    },
    locations: {
      label: "Vị trí",
      model: this.locations,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [{ path: "warehouseId", select: "code name" }],
      references: [
        { model: this.devices, path: "locationId", label: "thiết bị" },
        {
          model: this.partSerials,
          path: "locationId",
          label: "linh kiện serial",
        },
      ],
    },
    keepers: {
      label: "Người giữ",
      model: this.keepers,
      codeRequired: false,
      searchFields: [
        "code",
        "displayName",
        "employeeCode",
        "email",
      ],
      nameField: "displayName",
      populates: [
        { path: "departmentId", select: "code name" },
        { path: "positionId", select: "code name" },
      ],
      references: [
        { model: this.devices, path: "keeperId", label: "thiết bị" },
        {
          model: this.departments,
          path: "managerKeeperId",
          label: "bộ phận (người phụ trách)",
        },
        {
          model: this.operations,
          path: "receiverKeeperId",
          label: "chứng từ",
        },
        {
          model: this.operations,
          path: "senderKeeperId",
          label: "chứng từ",
        },
      ],
    },
    positions: {
      label: "Chức vụ",
      model: this.positions,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [],
      references: [
        { model: this.keepers, path: "positionId", label: "người giữ" },
      ],
    },
    suppliers: {
      label: "Nhà cung cấp",
      model: this.suppliers,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [],
      references: [
        { model: this.devices, path: "supplierId", label: "thiết bị" },
        { model: this.parts, path: "supplierId", label: "linh kiện" },
      ],
    },
    "device-types": {
      label: "Loại thiết bị",
      model: this.deviceTypes,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [],
      references: [
        { model: this.devices, path: "deviceTypeId", label: "thiết bị" },
        { model: this.parts, path: "deviceTypeId", label: "linh kiện" },
        { model: this.itemModels, path: "deviceTypeId", label: "mã hàng" },
      ],
    },
    units: {
      label: "Đơn vị tính",
      model: this.units,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [],
      references: [
        { model: this.parts, path: "unitId", label: "linh kiện" },
        { model: this.itemModels, path: "unitId", label: "mã hàng" },
      ],
    },
    "item-models": {
      label: "Mã hàng / model",
      model: this.itemModels,
      codeRequired: true,
      searchFields: ["code", "name"],
      nameField: "name",
      populates: [
        { path: "deviceTypeId", select: "code name" },
        { path: "unitId", select: "code name" },
      ],
      references: [
        { model: this.devices, path: "modelId", label: "thiết bị" },
        { model: this.parts, path: "modelId", label: "linh kiện" },
      ],
    },
  };

  private entry(type: string): CatalogEntry {
    if (!Object.prototype.hasOwnProperty.call(this.entries, type)) {
      throw new NotFoundException({ code: "CATALOG_TYPE_NOT_FOUND" });
    }
    return this.entries[type as CatalogType];
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async assertRef(
    model: AnyModel,
    id: string,
    code: string,
  ): Promise<void> {
    if (
      !Types.ObjectId.isValid(id) ||
      !(await model.exists({ _id: id, isActive: true }))
    ) {
      throw new BadRequestException({ code });
    }
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  async list(
    type: string,
    query: {
      q?: string;
      isActive?: string;
      deviceTypeId?: string;
      departmentId?: string;
      positionId?: string;
      status?: string;
      page?: string;
      limit?: string;
    },
  ) {
    const entry = this.entry(type);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.isActive === "true") filter.isActive = true;
    if (query.isActive === "false") filter.isActive = false;
    if (type === "item-models" && query.deviceTypeId)
      filter.deviceTypeId = query.deviceTypeId;
    if (type === "keepers" && query.departmentId)
      filter.departmentId = query.departmentId;
    if (type === "keepers" && query.positionId)
      filter.positionId = query.positionId;
    if (type === "keepers" && query.status) filter.status = query.status;
    if (query.q?.trim()) {
      const pattern = new RegExp(this.escapeRegex(query.q.trim()), "i");
      filter.$or = entry.searchFields.map((field) => ({ [field]: pattern }));
    }
    const [items, total] = await Promise.all([
      entry.model
        .find(filter)
        .populate(entry.populates)
        .sort({ [entry.nameField]: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      entry.model.countDocuments(filter).exec(),
    ]);
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async get(type: string, id: string) {
    const entry = this.entry(type);
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const item = await entry.model
      .findById(id)
      .populate(entry.populates as any)
      .lean()
      .exec();
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: item };
  }

  async create(type: string, input: CreateCatalogDto, actor: CurrentActor) {
    const entry = this.entry(type);
    const name = input.name.trim();
    const doc: Record<string, unknown> = { isActive: true };
    const nameField = type === "keepers" ? "displayName" : "name";
    if (
      await entry.model.exists({
        [nameField]: new RegExp(`^${this.escapeRegex(name)}$`, "i"),
      })
    ) {
      throw new ConflictException({ code: "CATALOG_NAME_EXISTS" });
    }
    if (type === "keepers") {
      doc.displayName = name;
      if (input.employeeCode?.trim())
        doc.employeeCode = input.employeeCode.trim().toUpperCase();
      if (input.phone?.trim()) doc.phone = input.phone.trim();
      if (input.email?.trim()) doc.email = input.email.trim().toLowerCase();
      if (input.note?.trim()) doc.note = input.note.trim();
      if (input.joinedAt) doc.joinedAt = new Date(input.joinedAt);
      if (input.status) doc.status = input.status;
      if (input.departmentId) {
        await this.assertRef(
          this.departments,
          input.departmentId,
          "DEPARTMENT_REFERENCE_INVALID",
        );
        doc.departmentId = input.departmentId;
      }
      if (input.positionId) {
        await this.assertRef(
          this.positions,
          input.positionId,
          "POSITION_REFERENCE_INVALID",
        );
        doc.positionId = input.positionId;
      }
    } else {
      doc.name = name;
    }
    if (input.description?.trim()) doc.description = input.description.trim();
    if (input.code?.trim()) doc.code = input.code.trim().toUpperCase();
    else if (entry.codeRequired)
      throw new BadRequestException({ code: "CATALOG_CODE_REQUIRED" });

    switch (type) {
      case "locations": {
        if (!input.warehouseId)
          throw new BadRequestException({
            code: "WAREHOUSE_REFERENCE_INVALID",
          });
        await this.assertRef(
          this.warehouses,
          input.warehouseId,
          "WAREHOUSE_REFERENCE_INVALID",
        );
        doc.warehouseId = input.warehouseId;
        break;
      }
      case "item-models": {
        if (input.deviceTypeId) {
          await this.assertRef(
            this.deviceTypes,
            input.deviceTypeId,
            "DEVICE_TYPE_REFERENCE_INVALID",
          );
          doc.deviceTypeId = input.deviceTypeId;
        }
        if (input.unitId) {
          await this.assertRef(
            this.units,
            input.unitId,
            "UNIT_REFERENCE_INVALID",
          );
          doc.unitId = input.unitId;
        }
        if (input.manufacturer?.trim())
          doc.manufacturer = input.manufacturer.trim();
        break;
      }
      case "departments": {
        if (input.parentId) {
          await this.assertRef(
            this.departments,
            input.parentId,
            "DEPARTMENT_REFERENCE_INVALID",
          );
          doc.parentId = input.parentId;
        }
        if (input.managerKeeperId) {
          await this.assertRef(
            this.keepers,
            input.managerKeeperId,
            "KEEPER_REFERENCE_INVALID",
          );
          doc.managerKeeperId = input.managerKeeperId;
        }
        break;
      }
      case "warehouses": {
        if (input.departmentId) {
          await this.assertRef(
            this.departments,
            input.departmentId,
            "DEPARTMENT_REFERENCE_INVALID",
          );
          doc.departmentId = input.departmentId;
        }
        break;
      }
      case "suppliers": {
        if (input.phone?.trim()) doc.phone = input.phone.trim();
        if (input.email?.trim()) doc.email = input.email.trim().toLowerCase();
        if (input.address?.trim()) doc.address = input.address.trim();
        break;
      }
    }
    try {
      const item = await entry.model.create(doc);
      await this.audit.write({
        actorUserId: actor.userId,
        action: "CATALOG_ITEM_CREATED",
        entityType: type,
        entityId: item._id,
        outcome: "SUCCESS",
        metadata: { name },
      });
      return { data: item.toObject() };
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException({ code: "CATALOG_CODE_EXISTS" });
      throw error;
    }
  }
  async update(
    type: string,
    id: string,
    input: UpdateCatalogDto,
    actor: CurrentActor,
  ) {
    const entry = this.entry(type);
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const update: Record<string, unknown> = {};
    if (input.code !== undefined) {
      if (!input.code.trim() && entry.codeRequired)
        throw new BadRequestException({ code: "CATALOG_CODE_REQUIRED" });
      update.code = input.code.trim().toUpperCase() || undefined;
    }
    if (input.description !== undefined)
      update.description = input.description.trim();
    if (input.name !== undefined) {
      const nameField = type === "keepers" ? "displayName" : "name";
      if (
        await entry.model.exists({
          _id: { $ne: id },
          [nameField]: new RegExp(
            `^${this.escapeRegex(input.name.trim())}$`,
            "i",
          ),
        })
      ) {
        throw new ConflictException({ code: "CATALOG_NAME_EXISTS" });
      }
      if (type === "keepers") update.displayName = input.name.trim();
      else update.name = input.name.trim();
    }
    if (type === "keepers" || type === "suppliers") {
      if (input.phone !== undefined) update.phone = input.phone.trim();
      if (input.note !== undefined) update.note = input.note.trim();
    }
    if (type === "keepers") {
      if (input.employeeCode !== undefined)
        update.employeeCode = input.employeeCode.trim().toUpperCase() || undefined;
      if (input.email !== undefined)
        update.email = input.email.trim().toLowerCase() || undefined;
      if (input.joinedAt !== undefined)
        update.joinedAt = input.joinedAt ? new Date(input.joinedAt) : undefined;
      if (input.status !== undefined) update.status = input.status;
      if (input.departmentId !== undefined) {
        if (input.departmentId) {
          await this.assertRef(
            this.departments,
            input.departmentId,
            "DEPARTMENT_REFERENCE_INVALID",
          );
          update.departmentId = input.departmentId;
        } else update.departmentId = undefined;
      }
      if (input.positionId !== undefined) {
        if (input.positionId) {
          await this.assertRef(
            this.positions,
            input.positionId,
            "POSITION_REFERENCE_INVALID",
          );
          update.positionId = input.positionId;
        } else update.positionId = undefined;
      }
    }
    if (type === "suppliers") {
      if (input.email !== undefined)
        update.email = input.email.trim().toLowerCase();
      if (input.address !== undefined) update.address = input.address.trim();
    }
    switch (type) {
      case "locations": {
        if (input.warehouseId) {
          await this.assertRef(
            this.warehouses,
            input.warehouseId,
            "WAREHOUSE_REFERENCE_INVALID",
          );
          update.warehouseId = input.warehouseId;
        }
        break;
      }
      case "item-models": {
        if (input.deviceTypeId) {
          await this.assertRef(
            this.deviceTypes,
            input.deviceTypeId,
            "DEVICE_TYPE_REFERENCE_INVALID",
          );
          update.deviceTypeId = input.deviceTypeId;
        }
        if (input.unitId) {
          await this.assertRef(
            this.units,
            input.unitId,
            "UNIT_REFERENCE_INVALID",
          );
          update.unitId = input.unitId;
        }
        if (input.manufacturer !== undefined)
          update.manufacturer = input.manufacturer.trim();
        break;
      }
      case "departments": {
        if (input.parentId) {
          if (input.parentId === id)
            throw new BadRequestException({ code: "DEPARTMENT_PARENT_SELF" });
          await this.assertRef(
            this.departments,
            input.parentId,
            "DEPARTMENT_REFERENCE_INVALID",
          );
          update.parentId = input.parentId;
        }
        if (input.managerKeeperId !== undefined) {
          if (input.managerKeeperId) {
            await this.assertRef(
              this.keepers,
              input.managerKeeperId,
              "KEEPER_REFERENCE_INVALID",
            );
            update.managerKeeperId = input.managerKeeperId;
          } else update.managerKeeperId = undefined;
        }
        break;
      }
      case "warehouses": {
        if (input.departmentId) {
          await this.assertRef(
            this.departments,
            input.departmentId,
            "DEPARTMENT_REFERENCE_INVALID",
          );
          update.departmentId = input.departmentId;
        }
        break;
      }
    }
    const item: any = await entry.model
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .populate(entry.populates as any)
      .lean()
      .exec();
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "CATALOG_ITEM_UPDATED",
      entityType: type,
      entityId: item._id,
      outcome: "SUCCESS",
    });
    return { data: item };
  }

  async setStatus(
    type: string,
    id: string,
    isActive: boolean,
    actor: CurrentActor,
  ) {
    const entry = this.entry(type);
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const item: any = await entry.model
      .findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
      .lean()
      .exec();
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: isActive ? "CATALOG_ITEM_ACTIVATED" : "CATALOG_ITEM_DEACTIVATED",
      entityType: type,
      entityId: item._id,
      outcome: "SUCCESS",
    });
    return { data: item };
  }

  async remove(type: string, id: string, actor: CurrentActor) {
    const entry = this.entry(type);
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    for (const reference of entry.references) {
      const count = await reference.model
        .countDocuments({ [reference.path]: id })
        .exec();
      if (count > 0) {
        throw new ConflictException({
          code: "CATALOG_IN_USE",
          message: `${entry.label} đang được sử dụng trong ${reference.label}; hãy dùng chức năng ngừng sử dụng thay vì xóa.`,
        });
      }
    }
    const result = await entry.model.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0)
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    await this.audit.write({
      actorUserId: actor.userId,
      action: "CATALOG_ITEM_DELETED",
      entityType: type,
      entityId: new Types.ObjectId(id),
      outcome: "SUCCESS",
    });
    return { data: { id } };
  }
}
