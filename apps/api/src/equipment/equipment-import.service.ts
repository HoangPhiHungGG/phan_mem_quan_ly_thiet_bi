import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { randomUUID } from "node:crypto";
import type { ClientSession, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import {
  ComponentType,
  DeviceType,
  ItemModel,
  Supplier,
  Unit,
} from "../catalog/catalog.schemas";
import { DisplayCodeService } from "../display-codes/display-code.service";
import {
  Warehouse,
  type WarehouseDocument,
} from "../identity/identity.schemas";
import {
  AssetTransaction,
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import {
  CommitEquipmentImportDto,
  PreviewEquipmentImportDto,
} from "./equipment-import.dto";
import { EquipmentImportSession } from "./equipment-import.schemas";
import { Device, Part, PartSerial } from "./equipment.schemas";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

type ImportKind = "DEVICE" | "PART";
type ImportStatus = "VALID" | "WARNING" | "ERROR";
type PreviewRow = {
  rowNumber: number;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
  skip: boolean;
  original: Record<string, unknown>;
  data: Record<string, unknown>;
};

type RefRow = {
  _id: Types.ObjectId;
  name: string;
  entityType?: "DEVICE" | "COMPONENT";
  deviceTypeId?: Types.ObjectId;
  componentTypeId?: Types.ObjectId;
  warehouseId?: Types.ObjectId;
};

const MAX_ROWS = 5000;
const CONDITION_MAP: Record<string, string> = {
  good: "GOOD",
  tot: "GOOD",
  degraded: "DEGRADED",
  "binh thuong": "DEGRADED",
  broken: "BROKEN",
  "hu hong": "BROKEN",
};
const TRACKING_MAP: Record<string, "QUANTITY" | "SERIAL"> = {
  quantity: "QUANTITY",
  "theo so luong": "QUANTITY",
  serial: "SERIAL",
  "theo serial": "SERIAL",
};
const SOURCE_MAP: Record<string, string> = {
  opening: "OPENING",
  "ton dau ky": "OPENING",
  purchase: "PURCHASE",
  "mua sam": "PURCHASE",
  return: "RETURN",
  "thu hoi": "RETURN",
  transfer_in: "TRANSFER_IN",
  khac: "TRANSFER_IN",
};

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    return undefined;
  const normalized = `${value}`.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

function key(value: unknown): string {
  return (text(value) ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "d")
    .toLowerCase();
}

function serialList(value: unknown): string[] {
  return (text(value) ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || text(value) === undefined)
    return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const raw = String(value)
    .trim()
    .replace(/\s|₫|đ/gi, "");
  const normalized = /^-?\d{1,3}(?:\.\d{3})+$/.test(raw)
    ? raw.replace(/\./g, "")
    : raw.replace(/,/g, "");
  return Number(normalized);
}

function dateValue(value: unknown): Date | undefined | null {
  if (value === null || value === undefined || text(value) === undefined)
    return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const raw = String(value).trim();
  const vi = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vi) {
    const date = new Date(
      Date.UTC(Number(vi[3]), Number(vi[2]) - 1, Number(vi[1])),
    );
    return date.getUTCFullYear() === Number(vi[3]) &&
      date.getUTCMonth() === Number(vi[2]) - 1 &&
      date.getUTCDate() === Number(vi[1])
      ? date
      : null;
  }
  const iso = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) ? new Date(raw) : null;
  return iso && !Number.isNaN(iso.getTime()) ? iso : null;
}

function mapByName(rows: RefRow[]): Map<string, RefRow> {
  return new Map(rows.map((row) => [key(row.name), row]));
}

function status(errors: string[], warnings: string[]): ImportStatus {
  return errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID";
}

@Injectable()
export class EquipmentImportService {
  constructor(
    @InjectModel(EquipmentImportSession.name)
    private readonly sessions: Model<EquipmentImportSession>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(PartSerial.name)
    private readonly partSerials: Model<PartSerial>,
    @InjectModel(DeviceType.name)
    private readonly deviceTypes: Model<DeviceType>,
    @InjectModel(ComponentType.name)
    private readonly componentTypes: Model<ComponentType>,
    @InjectModel(ItemModel.name) private readonly itemModels: Model<ItemModel>,
    @InjectModel(Unit.name) private readonly units: Model<Unit>,
    @InjectModel(Supplier.name) private readonly suppliers: Model<Supplier>,
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    @InjectModel(AssetTransaction.name)
    private readonly assetTransactions: Model<AssetTransaction>,
    private readonly displayCodes: DisplayCodeService,
    private readonly audit: AuditService,
  ) {}

  async preview(
    kind: ImportKind,
    input: PreviewEquipmentImportDto,
    actor: CurrentActor,
  ) {
    if (!input.rows.length)
      throw new BadRequestException({ code: "IMPORT_FILE_EMPTY" });
    if (input.rows.length > MAX_ROWS)
      throw new BadRequestException({ code: "IMPORT_ROW_LIMIT_EXCEEDED" });
    const rows = input.rows.map((row, index) =>
      this.normalizeRow(kind, row, index + 2),
    );
    const previewRows = await this.validateRows(kind, rows, {
      autoCreateCatalog: input.autoCreateCatalog ?? false,
      duplicatePolicy: input.duplicatePolicy ?? "ERROR",
    });
    const preview = this.previewSummary(previewRows);
    const importSessionId = `IMP-${randomUUID()}`;
    await this.sessions.create({
      sessionId: importSessionId,
      kind,
      actorUserId: actor.userId,
      fileName: input.fileName,
      options: {
        autoCreateCatalog: input.autoCreateCatalog ?? false,
        duplicatePolicy: input.duplicatePolicy ?? "ERROR",
      },
      rows,
      preview,
      status: "PREVIEWED",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    return { importSessionId, ...preview };
  }

  async commit(
    kind: ImportKind,
    input: CommitEquipmentImportDto,
    actor: CurrentActor,
  ) {
    const existing = await this.sessions.findOne({
      sessionId: input.importSessionId,
      kind,
      actorUserId: actor.userId,
      expiresAt: { $gt: new Date() },
    });
    if (!existing)
      throw new NotFoundException({ code: "IMPORT_SESSION_NOT_FOUND" });
    if (existing.status === "COMPLETED") return existing.result;
    const locked = await this.sessions.findOneAndUpdate(
      { _id: existing._id, status: "PREVIEWED" },
      { $set: { status: "PROCESSING" } },
      { new: true },
    );
    if (!locked)
      throw new ConflictException({ code: "IMPORT_ALREADY_PROCESSING" });
    const preview = locked.preview as unknown as {
      rows: PreviewRow[];
      errorRows: number;
    };
    if (preview.errorRows && !input.importValidRows) {
      await this.sessions.updateOne(
        { _id: locked._id },
        { $set: { status: "PREVIEWED" } },
      );
      throw new BadRequestException({ code: "IMPORT_HAS_ERRORS" });
    }
    const selected = preview.rows.filter(
      (row) => !row.errors.length && !row.skip,
    );
    const importOptions = locked.options as unknown as {
      autoCreateCatalog?: boolean;
    };
    const autoCreateCatalog = importOptions.autoCreateCatalog ?? false;
    const atomic = input.atomic ?? true;
    let importedRows = 0;
    let failedRows = 0;
    try {
      if (atomic) {
        const session = await this.sessions.db.startSession();
        try {
          await session.withTransaction(async () => {
            await this.writeRows(
              kind,
              selected,
              actor,
              session,
              autoCreateCatalog,
              locked.sessionId,
            );
          });
          importedRows = selected.length;
        } finally {
          await session.endSession();
        }
      } else {
        for (const row of selected) {
          const session = await this.sessions.db.startSession();
          try {
            await session.withTransaction(async () => {
              await this.writeRows(
                kind,
                [row],
                actor,
                session,
                autoCreateCatalog,
                locked.sessionId,
              );
            });
            importedRows += 1;
          } catch {
            failedRows += 1;
          } finally {
            await session.endSession();
          }
        }
      }
      const result = {
        totalRows: preview.rows.length,
        importedRows,
        skippedRows: preview.rows.length - selected.length,
        failedRows,
      };
      await this.sessions.updateOne(
        { _id: locked._id, status: "PROCESSING" },
        { $set: { status: "COMPLETED", result } },
      );
      await this.audit.write({
        actorUserId: actor.userId,
        action:
          kind === "DEVICE"
            ? "DEVICE_IMPORT_COMPLETED"
            : "COMPONENT_IMPORT_COMPLETED",
        entityType: "EquipmentImportSession",
        entityId: locked._id,
        outcome: "SUCCESS",
        metadata: {
          fileName: locked.fileName,
          totalRows: preview.rows.length,
          importedRows,
          skippedRows: result.skippedRows,
          errorRows: preview.errorRows + failedRows,
        },
      });
      return result;
    } catch (error) {
      await this.sessions.updateOne(
        { _id: locked._id, status: "PROCESSING" },
        { $set: { status: "PREVIEWED" } },
      );
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === 11000
      )
        throw new ConflictException({ code: "IMPORT_CONCURRENT_DUPLICATE" });
      throw error;
    }
  }

  private normalizeRow(
    kind: ImportKind,
    source: Record<string, unknown>,
    rowNumber: number,
  ) {
    const common = { rowNumber, source };
    if (kind === "DEVICE") {
      return {
        ...common,
        data: {
          name: text(source.name),
          deviceType: text(source.deviceType),
          model: text(source.model),
          assetCode: text(source.assetCode)?.toUpperCase(),
          serial: text(source.serial)?.toUpperCase(),
          condition: text(source.condition),
          warehouse: text(source.warehouse),
          supplier: text(source.supplier),
          purchasedAt: source.purchasedAt,
          purchasePrice: source.purchasePrice,
          warrantyUntil: source.warrantyUntil,
          notes: text(source.notes),
        },
      };
    }
    return {
      ...common,
      data: {
        name: text(source.name),
        code: text(source.code)?.toUpperCase(),
        trackingMode: text(source.trackingMode),
        componentType: text(source.componentType),
        model: text(source.model),
        unit: text(source.unit),
        supplier: text(source.supplier),
        spec: text(source.spec),
        minQty: source.minQty,
        warehouse: text(source.warehouse),
        quantity: source.quantity,
        serials: serialList(source.serials),
        source: text(source.source),
        notes: text(source.notes),
      },
    };
  }

  private async catalogMaps() {
    const [deviceTypes, componentTypes, models, units, suppliers, warehouses] =
      await Promise.all([
        this.deviceTypes.find({ isActive: true }).lean(),
        this.componentTypes.find({ isActive: true }).lean(),
        this.itemModels.find({ isActive: true }).lean(),
        this.units.find({ isActive: true }).lean(),
        this.suppliers.find({ isActive: true }).lean(),
        this.warehouses.find({ isActive: true }).lean(),
      ]);
    return {
      deviceTypes: mapByName(deviceTypes),
      componentTypes: mapByName(componentTypes),
      deviceModels: models.filter((item) => item.entityType === "DEVICE"),
      componentModels: models.filter((item) => item.entityType === "COMPONENT"),
      units: mapByName(units),
      suppliers: mapByName(suppliers),
      warehouses: mapByName(warehouses),
    };
  }

  private async validateRows(
    kind: ImportKind,
    rows: Array<{
      rowNumber: number;
      source: Record<string, unknown>;
      data: Record<string, unknown>;
    }>,
    options: { autoCreateCatalog: boolean; duplicatePolicy: "ERROR" | "SKIP" },
  ): Promise<PreviewRow[]> {
    const catalogs = await this.catalogMaps();
    const assetCodes = rows
      .map((r) => text(r.data.assetCode))
      .filter(Boolean) as string[];
    const deviceSerials = rows
      .map((r) => text(r.data.serial))
      .filter(Boolean) as string[];
    const partCodes = rows
      .map((r) => text(r.data.code))
      .filter(Boolean) as string[];
    const allPartSerials = rows.flatMap(
      (r) => (r.data.serials as string[] | undefined) ?? [],
    );
    const [
      existingAssets,
      existingDeviceSerials,
      existingParts,
      existingPartSerials,
    ] = await Promise.all([
      this.devices.distinct("assetCode", { assetCode: { $in: assetCodes } }),
      this.devices.distinct("serial", { serial: { $in: deviceSerials } }),
      this.parts.distinct("code", { code: { $in: partCodes } }),
      this.partSerials.distinct("serial", { serial: { $in: allPartSerials } }),
    ]);
    const dbAssets = new Set(existingAssets.map(String));
    const dbDeviceSerials = new Set(existingDeviceSerials.map(String));
    const dbParts = new Set(existingParts.map(String));
    const dbPartSerials = new Set(existingPartSerials.map(String));
    const seenAssets = new Set<string>();
    const seenDeviceSerials = new Set<string>();
    const seenPartCodes = new Set<string>();
    const seenPartSerials = new Set<string>();

    return rows.map((row) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      let skip = false;
      const d = row.data;
      const duplicate = (message: string) => {
        if (options.duplicatePolicy === "SKIP") {
          warnings.push(`${message} Dòng này sẽ được bỏ qua.`);
          skip = true;
        } else errors.push(message);
      };
      const missingCatalog = (label: string, value: string | undefined) => {
        if (!value) return;
        if (options.autoCreateCatalog)
          warnings.push(`${label} "${value}" chưa tồn tại và sẽ được tạo mới.`);
        else errors.push(`${label} "${value}" chưa tồn tại.`);
      };
      if (!text(d.name))
        errors.push(
          kind === "DEVICE" ? "Thiếu tên thiết bị." : "Thiếu tên linh kiện.",
        );

      if (kind === "DEVICE") {
        const typeName = text(d.deviceType);
        const modelName = text(d.model);
        const assetCode = text(d.assetCode);
        const serial = text(d.serial);
        if (!assetCode) errors.push("Thiếu mã tài sản.");
        if (!typeName) errors.push("Thiếu loại thiết bị.");
        else if (!catalogs.deviceTypes.has(key(typeName)))
          missingCatalog("Loại thiết bị", typeName);
        if (modelName) {
          const deviceType = typeName
            ? catalogs.deviceTypes.get(key(typeName))
            : undefined;
          const namedModels = catalogs.deviceModels.filter(
            (item) => key(item.name) === key(modelName),
          );
          const model = deviceType
            ? namedModels.find(
                (item) =>
                  !item.deviceTypeId ||
                  String(item.deviceTypeId) === String(deviceType._id),
              )
            : undefined;
          if (!deviceType) missingCatalog("Model thiết bị", modelName);
          else if (!model && namedModels.length)
            errors.push(
              `Model thiết bị "${modelName}" không thuộc loại "${typeName}".`,
            );
          else if (!model) missingCatalog("Model thiết bị", modelName);
        }
        if (text(d.supplier) && !catalogs.suppliers.has(key(d.supplier)))
          missingCatalog("Nhà cung cấp", text(d.supplier));
        const condition = CONDITION_MAP[key(d.condition)];
        if (!condition)
          errors.push(`Tình trạng "${text(d.condition) ?? ""}" không hợp lệ.`);
        else d.condition = condition;
        if (assetCode) {
          if (seenAssets.has(assetCode) || dbAssets.has(assetCode))
            duplicate(`Mã tài sản "${assetCode}" đã tồn tại.`);
          seenAssets.add(assetCode);
        }
        if (serial) {
          if (seenDeviceSerials.has(serial) || dbDeviceSerials.has(serial))
            duplicate(`Serial "${serial}" đã tồn tại.`);
          seenDeviceSerials.add(serial);
        }
        this.validateInitialWarehouse(d, catalogs, errors);
        for (const field of ["purchasedAt", "warrantyUntil"])
          if (d[field] !== undefined) {
            const parsed = dateValue(d[field]);
            if (parsed === null)
              errors.push(
                `${field === "purchasedAt" ? "Ngày mua" : "Bảo hành đến"} không hợp lệ.`,
              );
            else d[field] = parsed?.toISOString();
          }
        const price = numberValue(d.purchasePrice);
        if (price !== undefined && (!Number.isInteger(price) || price < 0))
          errors.push("Giá mua phải là số nguyên lớn hơn hoặc bằng 0.");
        else d.purchasePrice = price;
      } else {
        const typeName = text(d.componentType);
        const modelName = text(d.model);
        const unitName = text(d.unit);
        const tracking = TRACKING_MAP[key(d.trackingMode)];
        if (!tracking)
          errors.push(
            `Kiểu quản lý "${text(d.trackingMode) ?? ""}" không hợp lệ.`,
          );
        else d.trackingMode = tracking;
        if (!typeName) errors.push("Thiếu loại linh kiện.");
        else if (!catalogs.componentTypes.has(key(typeName)))
          missingCatalog("Loại linh kiện", typeName);
        if (modelName) {
          const componentType = typeName
            ? catalogs.componentTypes.get(key(typeName))
            : undefined;
          const namedModels = catalogs.componentModels.filter(
            (item) => key(item.name) === key(modelName),
          );
          const model = componentType
            ? namedModels.find(
                (item) =>
                  !item.componentTypeId ||
                  String(item.componentTypeId) === String(componentType._id),
              )
            : undefined;
          if (!componentType) missingCatalog("Model linh kiện", modelName);
          else if (!model && namedModels.length)
            errors.push(
              `Model linh kiện "${modelName}" không thuộc loại "${typeName}".`,
            );
          else if (!model) missingCatalog("Model linh kiện", modelName);
        }
        if (!unitName) errors.push("Thiếu đơn vị tính.");
        else if (!catalogs.units.has(key(unitName)))
          missingCatalog("Đơn vị tính", unitName);
        if (text(d.supplier) && !catalogs.suppliers.has(key(d.supplier)))
          missingCatalog("Nhà cung cấp", text(d.supplier));
        const code = text(d.code);
        if (code) {
          if (seenPartCodes.has(code) || dbParts.has(code))
            duplicate(`Mã linh kiện "${code}" đã tồn tại.`);
          seenPartCodes.add(code);
        }
        const minQty = numberValue(d.minQty) ?? 0;
        if (!Number.isInteger(minQty) || minQty < 0)
          errors.push("Tồn tối thiểu phải là số nguyên lớn hơn hoặc bằng 0.");
        d.minQty = minQty;
        const quantity = numberValue(d.quantity) ?? 0;
        const serials = (d.serials as string[]) ?? [];
        if (tracking === "QUANTITY") {
          if (!Number.isInteger(quantity) || quantity < 0)
            errors.push(
              "Số lượng ban đầu phải là số nguyên lớn hơn hoặc bằng 0.",
            );
          if (serials.length)
            errors.push(
              "Linh kiện theo số lượng không được có danh sách serial.",
            );
          d.quantity = quantity;
        } else if (tracking === "SERIAL") {
          d.quantity = serials.length;
          for (const serial of serials) {
            if (seenPartSerials.has(serial) || dbPartSerials.has(serial))
              duplicate(`Serial "${serial}" đã tồn tại.`);
            seenPartSerials.add(serial);
          }
        }
        const warehouse = text(d.warehouse);
        if (warehouse && !catalogs.warehouses.has(key(warehouse)))
          errors.push(`Kho "${warehouse}" không tồn tại.`);
        if (!warehouse && Number(d.quantity) > 0)
          errors.push("Phải nhập kho khi có tồn ban đầu.");
        if (warehouse && Number(d.quantity) <= 0)
          errors.push(
            tracking === "SERIAL"
              ? "Phải nhập ít nhất một serial khi đã chọn kho."
              : "Số lượng phải lớn hơn 0 khi đã chọn kho.",
          );
        const source = SOURCE_MAP[key(d.source) || "ton dau ky"];
        if (!source)
          errors.push(`Nguồn nhập "${text(d.source) ?? ""}" không hợp lệ.`);
        else d.source = source;
      }
      return {
        rowNumber: row.rowNumber,
        status: status(errors, warnings),
        errors,
        warnings,
        skip,
        original: row.source,
        data: d,
      };
    });
  }

  private validateInitialWarehouse(
    data: Record<string, unknown>,
    catalogs: Awaited<ReturnType<EquipmentImportService["catalogMaps"]>>,
    errors: string[],
  ) {
    const warehouseName = text(data.warehouse);
    const warehouse = warehouseName
      ? catalogs.warehouses.get(key(warehouseName))
      : undefined;
    if (!warehouseName) errors.push("Thiếu kho nhập ban đầu.");
    else if (!warehouse) errors.push(`Kho "${warehouseName}" không tồn tại.`);
  }

  private previewSummary(rows: PreviewRow[]) {
    return {
      totalRows: rows.length,
      validRows: rows.filter((row) => !row.errors.length && !row.skip).length,
      errorRows: rows.filter((row) => row.errors.length > 0).length,
      warningRows: rows.filter((row) => row.warnings.length > 0).length,
      skippedRows: rows.filter((row) => row.skip).length,
      rows,
    };
  }

  private async ensureCatalog(
    model: Model<any>,
    entity: string,
    name: string | undefined,
    extra: Record<string, unknown>,
    session: ClientSession,
    cache: Map<string, Types.ObjectId>,
    allowCreate: boolean,
    createExtra: Record<string, unknown> = {},
  ): Promise<Types.ObjectId | undefined> {
    if (!name) return undefined;
    const extraKey = Object.entries(extra)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => `${field}:${String(value)}`)
      .join("|");
    const cacheKey = `${model.collection.collectionName}:${key(name)}:${extraKey}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const regex = new RegExp(
      `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}$`,
      "i",
    );
    const existing = await model
      .findOne({ name: regex, ...extra })
      .session(session);
    if (existing) {
      const id = existing._id as Types.ObjectId;
      cache.set(cacheKey, id);
      return id;
    }
    if (!allowCreate)
      throw new ConflictException({ code: "IMPORT_CATALOG_CHANGED" });
    const code = await this.displayCodes.nextCode(
      entity,
      name,
      async (candidate) => Boolean(await model.exists({ code: candidate })),
    );
    const created = await model.create(
      [{ name, code, isActive: true, ...extra, ...createExtra }],
      { session },
    );
    const id = created[0]._id as Types.ObjectId;
    cache.set(cacheKey, id);
    return id;
  }

  private async findWarehouse(
    name: string | undefined,
    session: ClientSession,
    cache: Map<string, WarehouseDocument | null>,
  ): Promise<WarehouseDocument | undefined> {
    if (!name) return undefined;
    const cacheKey = key(name);
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? undefined;
    const warehouse = await this.warehouses
      .findOne({
        name: new RegExp(
          `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
        isActive: true,
      })
      .session(session);
    cache.set(cacheKey, warehouse ?? null);
    return warehouse ?? undefined;
  }

  private async writeRows(
    kind: ImportKind,
    rows: PreviewRow[],
    actor: CurrentActor,
    session: ClientSession,
    autoCreateCatalog: boolean,
    importSessionId: string,
  ) {
    if (kind === "DEVICE")
      await this.writeDevices(
        rows,
        actor,
        session,
        autoCreateCatalog,
        importSessionId,
      );
    else await this.writeParts(rows, actor, session, autoCreateCatalog);
  }

  private async writeDevices(
    rows: PreviewRow[],
    actor: CurrentActor,
    session: ClientSession,
    autoCreateCatalog: boolean,
    importSessionId: string,
  ) {
    const documents: Record<string, unknown>[] = [];
    const catalogCache = new Map<string, Types.ObjectId>();
    const warehouseCache = new Map<string, WarehouseDocument | null>();
    for (const row of rows) {
      const d = row.data;
      const deviceTypeId = await this.ensureCatalog(
        this.deviceTypes,
        "DEVICE_TYPE",
        text(d.deviceType),
        {},
        session,
        catalogCache,
        autoCreateCatalog,
      );
      const modelId = await this.ensureCatalog(
        this.itemModels,
        "DEVICE_MODEL",
        text(d.model),
        { entityType: "DEVICE", ...(deviceTypeId ? { deviceTypeId } : {}) },
        session,
        catalogCache,
        autoCreateCatalog,
      );
      const supplierId = await this.ensureCatalog(
        this.suppliers,
        "SUPPLIER",
        text(d.supplier),
        {},
        session,
        catalogCache,
        autoCreateCatalog,
      );
      const warehouse = await this.findWarehouse(
        text(d.warehouse),
        session,
        warehouseCache,
      );
      if (!warehouse)
        throw new ConflictException({ code: "IMPORT_CATALOG_CHANGED" });
      const assetCode = text(d.assetCode);
      if (!assetCode)
        throw new BadRequestException({ code: "DEVICE_ASSET_CODE_REQUIRED" });
      documents.push({
        name: text(d.name),
        assetCode,
        serial: text(d.serial),
        deviceTypeId,
        modelId,
        supplierId,
        purchasedAt: dateValue(d.purchasedAt),
        receivedAt: new Date(),
        purchasePrice: numberValue(d.purchasePrice),
        warrantyUntil: dateValue(d.warrantyUntil),
        techCondition: d.condition,
        notes: text(d.notes),
        warehouseId: warehouse?._id,
        locationId: undefined,
        departmentId: undefined,
        keeperId: undefined,
        usageStatus: "IN_STOCK",
        isActive: true,
      });
    }
    if (documents.length) {
      const created = await this.devices.insertMany(documents, {
        session,
        ordered: true,
      });
      await this.assetTransactions.insertMany(
        created.map((device, index) => ({
          deviceId: device._id,
          warehouseId: device.warehouseId,
          type: "INITIAL_RECEIPT",
          source: "DEVICE_IMPORT",
          quantity: 1,
          assetCode: device.assetCode,
          serial: device.serial,
          createdBy: actor.userId,
          importSessionId,
          note:
            text(rows[index]?.data.notes) || "Nhập kho ban đầu từ Import Excel",
        })),
        { session, ordered: true },
      );
    }
  }

  private async writeParts(
    rows: PreviewRow[],
    actor: CurrentActor,
    session: ClientSession,
    autoCreateCatalog: boolean,
  ) {
    const catalogCache = new Map<string, Types.ObjectId>();
    const warehouseCache = new Map<string, WarehouseDocument | null>();
    for (const row of rows) {
      const d = row.data;
      const componentTypeId = await this.ensureCatalog(
        this.componentTypes,
        "COMPONENT_TYPE",
        text(d.componentType),
        {},
        session,
        catalogCache,
        autoCreateCatalog,
      );
      const unitId = await this.ensureCatalog(
        this.units,
        "UNIT",
        text(d.unit),
        {},
        session,
        catalogCache,
        autoCreateCatalog,
      );
      const modelId = await this.ensureCatalog(
        this.itemModels,
        "COMPONENT_MODEL",
        text(d.model),
        {
          entityType: "COMPONENT",
          ...(componentTypeId ? { componentTypeId } : {}),
        },
        session,
        catalogCache,
        autoCreateCatalog,
        unitId ? { unitId } : {},
      );
      const supplierId = await this.ensureCatalog(
        this.suppliers,
        "SUPPLIER",
        text(d.supplier),
        {},
        session,
        catalogCache,
        autoCreateCatalog,
      );
      const code =
        text(d.code) ??
        (await this.displayCodes.nextCode(
          "COMPONENT",
          text(d.name) ?? "X",
          async (candidate) =>
            Boolean(await this.parts.exists({ code: candidate })),
        ));
      const created = await this.parts.create(
        [
          {
            code,
            name: text(d.name),
            trackingMode: d.trackingMode,
            componentTypeId,
            unitId,
            modelId,
            supplierId,
            spec: text(d.spec),
            note: text(d.notes),
            minQty: Number(d.minQty) || 0,
            stockQty: Number(d.quantity) || 0,
            isActive: true,
          },
        ],
        { session },
      );
      const warehouse = await this.findWarehouse(
        text(d.warehouse),
        session,
        warehouseCache,
      );
      const quantity = Number(d.quantity) || 0;
      if (warehouse && quantity > 0) {
        await this.balances.create(
          [{ partId: created[0]._id, warehouseId: warehouse._id, quantity }],
          { session },
        );
        await this.transactions.create(
          [
            {
              partId: created[0]._id,
              warehouseId: warehouse._id,
              type: d.source ?? "OPENING",
              quantity,
              note: text(d.notes) ?? "Nhập tồn ban đầu từ Excel",
              createdBy: actor.userId,
            },
          ],
          { session },
        );
        if (d.trackingMode === "SERIAL")
          await this.partSerials.create(
            ((d.serials as string[]) ?? []).map((serial) => ({
              partId: created[0]._id,
              warehouseId: warehouse._id,
              serial,
              status: "IN_STOCK",
            })),
            { session, ordered: true },
          );
      }
    }
  }
}
