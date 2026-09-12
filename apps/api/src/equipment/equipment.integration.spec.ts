import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Connection, createConnection, Model, Types } from "mongoose";
import type { Server } from "node:http";
import request from "supertest";
import { AuditService } from "../auth/audit.service";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import { PERMISSIONS_KEY } from "../auth/auth.constants";
import type { AuthenticatedRequest, CurrentActor } from "../auth/auth.types";
import {
  ComponentType,
  ComponentTypeSchema,
  DeviceType,
  DeviceTypeSchema,
  ItemModel,
  ItemModelSchema,
  Keeper,
  KeeperSchema,
  Location,
  LocationSchema,
  Supplier,
  SupplierSchema,
  Unit,
  UnitSchema,
} from "../catalog/catalog.schemas";
import {
  Department,
  DepartmentSchema,
  Warehouse,
  WarehouseSchema,
} from "../identity/identity.schemas";
import {
  AssetTransaction,
  AssetTransactionSchema,
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";
import { EquipmentController } from "./equipment.controller";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
  PartSerial,
  PartSerialSchema,
} from "./equipment.schemas";
import { EquipmentService } from "./equipment.service";
import { EquipmentImportService } from "./equipment-import.service";
import {
  EquipmentImportSession,
  EquipmentImportSessionSchema,
} from "./equipment-import.schemas";
import {
  DisplayCodeCounter,
  DisplayCodeCounterSchema,
} from "../display-codes/display-code.schemas";
import { DisplayCodeService } from "../display-codes/display-code.service";

// Opt-in, real MongoDB replica set. A unique database keeps application data untouched.
const integration = process.env.EQUIPMENT_TEST_MONGODB_URI
  ? describe
  : describe.skip;

integration("Parts API initial stock with real MongoDB transactions", () => {
  let connection: Connection;
  let app: INestApplication<Server>;
  let devices: Model<Device>;
  let parts: Model<Part>;
  let balances: Model<InventoryBalance>;
  let transactions: Model<InventoryTransaction>;
  let assetTransactions: Model<AssetTransaction>;
  let serials: Model<PartSerial>;
  let itemModels: Model<ItemModel>;
  let deviceTypes: Model<DeviceType>;
  let componentTypes: Model<ComponentType>;
  let warehouseId: string;
  let unitId: string;
  let componentTypeId: string;
  let deviceTypeId: string;
  const database = `pmqltb_equipment_test_${new Types.ObjectId().toHexString()}`;
  const actor = {
    userId: new Types.ObjectId(),
    sessionId: new Types.ObjectId(),
    employeeCode: "TEST",
    email: "test@example.com",
    displayName: "Người kiểm thử",
    status: "ACTIVE",
    roleCodes: [],
    permissions: [],
    scopes: [],
  } as CurrentActor;

  beforeAll(async () => {
    connection = await createConnection(
      process.env.EQUIPMENT_TEST_MONGODB_URI!,
      {
        dbName: database,
      },
    ).asPromise();
    devices = connection.model(Device.name, DeviceSchema);
    parts = connection.model(Part.name, PartSchema);
    serials = connection.model(PartSerial.name, PartSerialSchema);
    itemModels = connection.model(ItemModel.name, ItemModelSchema);
    deviceTypes = connection.model(DeviceType.name, DeviceTypeSchema);
    componentTypes = connection.model(ComponentType.name, ComponentTypeSchema);
    const suppliers = connection.model(Supplier.name, SupplierSchema);
    const units = connection.model(Unit.name, UnitSchema);
    const keepers = connection.model(Keeper.name, KeeperSchema);
    const locations = connection.model(Location.name, LocationSchema);
    const departments = connection.model(Department.name, DepartmentSchema);
    const warehouses = connection.model(Warehouse.name, WarehouseSchema);
    balances = connection.model(InventoryBalance.name, InventoryBalanceSchema);
    transactions = connection.model(
      InventoryTransaction.name,
      InventoryTransactionSchema,
    );
    assetTransactions = connection.model(
      AssetTransaction.name,
      AssetTransactionSchema,
    );
    const auditLogs = connection.model(AuditLog.name, AuditLogSchema);
    const audit = new AuditService(auditLogs);
    const displayCodes = new DisplayCodeService(
      connection.model(DisplayCodeCounter.name, DisplayCodeCounterSchema),
    );
    const importService = new EquipmentImportService(
      connection.model(
        EquipmentImportSession.name,
        EquipmentImportSessionSchema,
      ),
      devices,
      parts,
      serials,
      deviceTypes,
      componentTypes,
      itemModels,
      units,
      suppliers,
      warehouses,
      balances,
      transactions,
      assetTransactions,
      displayCodes,
      audit,
    );
    const service = new EquipmentService(
      devices,
      parts,
      serials,
      itemModels,
      deviceTypes,
      componentTypes,
      suppliers,
      units,
      keepers,
      locations,
      departments,
      warehouses,
      balances,
      transactions,
      assetTransactions,
      audit,
      displayCodes,
    );
    const module = await Test.createTestingModule({
      controllers: [EquipmentController],
      providers: [
        { provide: EquipmentService, useValue: service },
        { provide: EquipmentImportService, useValue: importService },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: AuthenticatedRequest, _res: unknown, next: () => void) => {
      req.actor = actor;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    const warehouse = await warehouses.create({
      code: "TEST-WH",
      name: "Kho IT kiểm thử",
    });
    const unit = await units.create({ code: "CAI", name: "Cái" });
    const componentType = await componentTypes.create({
      code: "SSD",
      name: "Ổ cứng SSD",
    });
    const deviceType = await deviceTypes.create({
      code: "PC",
      name: "Máy tính để bàn",
    });
    warehouseId = String(warehouse._id);
    unitId = String(unit._id);
    componentTypeId = String(componentType._id);
    deviceTypeId = String(deviceType._id);
  }, 20_000);

  afterAll(async () => {
    await app?.close();
    if (connection) {
      if (
        connection.name === database &&
        database.startsWith("pmqltb_equipment_test_")
      )
        await connection.dropDatabase();
      await connection.close();
    }
  });

  const payload = (code: string, trackingMode: "QUANTITY" | "SERIAL") => ({
    code,
    name: `Linh kiện ${code}`,
    trackingMode,
    unitId,
    componentTypeId,
    minQty: 0,
  });

  it("creates a device directly in its initial warehouse with asset history", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/devices")
      .send({
        assetCode: "IT-PC-001",
        serial: "PC001",
        techCondition: "GOOD",
        deviceTypeId,
        warehouseId,
        initialReceiptNote: "Nhập kho ban đầu",
      })
      .expect(201);
    const data = (
      response.body as {
        data: { _id: string; warehouseId: string; usageStatus: string };
      }
    ).data;
    expect(String(data.warehouseId)).toBe(warehouseId);
    expect(data.usageStatus).toBe("IN_STOCK");
    expect(
      await assetTransactions.findOne({
        deviceId: data._id,
        warehouseId,
        type: "INITIAL_RECEIPT",
        source: "DEVICE_CREATE",
        quantity: 1,
      }),
    ).toBeTruthy();
    expect(
      await devices.countDocuments({ warehouseId, usageStatus: "IN_STOCK" }),
    ).toBe(1);
    const available = await request(app.getHttpServer())
      .get(`/api/devices?available=true&warehouseId=${warehouseId}`)
      .expect(200);
    expect(
      (available.body as { data: Array<{ assetCode: string }> }).data.some(
        (item) => item.assetCode === "IT-PC-001",
      ),
    ).toBe(true);
  });

  it("rejects an invalid initial warehouse without creating the device", async () => {
    await request(app.getHttpServer())
      .post("/api/devices")
      .send({
        assetCode: "IT-PC-WRONG-WH",
        techCondition: "GOOD",
        deviceTypeId,
        warehouseId: new Types.ObjectId().toHexString(),
      })
      .expect(400);
    expect(await devices.exists({ assetCode: "IT-PC-WRONG-WH" })).toBeNull();
  });

  it("rejects duplicate device asset codes and serials", async () => {
    await request(app.getHttpServer())
      .post("/api/devices")
      .send({
        assetCode: "IT-PC-001",
        serial: "PC002",
        techCondition: "GOOD",
        deviceTypeId,
        warehouseId,
      })
      .expect(409);
    await request(app.getHttpServer())
      .post("/api/devices")
      .send({
        assetCode: "IT-PC-002",
        serial: "PC001",
        techCondition: "GOOD",
        deviceTypeId,
        warehouseId,
      })
      .expect(409);
    expect(await devices.exists({ assetCode: "IT-PC-002" })).toBeNull();
  });

  it("reports an invalid warehouse and duplicate asset during device preview", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/devices/import/preview")
      .send({
        fileName: "thiet-bi-loi.xlsx",
        rows: [
          {
            assetCode: "IT-PC-001",
            name: "Thiết bị trùng",
            deviceType: "Máy tính để bàn",
            condition: "Tốt",
            warehouse: "Kho không tồn tại",
          },
        ],
      })
      .expect(201);
    expect(response.body).toMatchObject({ validRows: 0, errorRows: 1 });
    expect(
      (response.body as { rows: Array<{ errors: string[] }> }).rows[0].errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("IT-PC-001"),
        expect.stringContaining("Kho không tồn tại"),
      ]),
    );
  });

  it("creates quantity stock, balance and transaction", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send({
        ...payload("TEST-QTY", "QUANTITY"),
        initialStock: {
          warehouseId,
          quantity: 5,
          type: "OPENING",
          note: "Tồn kiểm thử",
        },
      })
      .expect(201);
    const partId = String(
      (response.body as { data: { _id: string } }).data._id,
    );
    expect(
      (response.body as { data: { stockQty: number } }).data.stockQty,
    ).toBe(5);
    expect((await balances.findOne({ partId, warehouseId }))?.quantity).toBe(5);
    expect((await transactions.findOne({ partId }))?.quantity).toBe(5);
  });

  it("derives serial stock quantity and normalizes serials", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send({
        ...payload("TEST-SERIAL", "SERIAL"),
        initialStock: {
          warehouseId,
          quantity: 999,
          type: "OPENING",
          serials: [" a001 ", "A002", "a003"],
        },
      })
      .expect(201);
    const partId = String(
      (response.body as { data: { _id: string } }).data._id,
    );
    expect(
      (response.body as { data: { stockQty: number } }).data.stockQty,
    ).toBe(3);
    expect((await balances.findOne({ partId, warehouseId }))?.quantity).toBe(3);
    expect(await serials.countDocuments({ partId, status: "IN_STOCK" })).toBe(
      3,
    );
    expect((await transactions.findOne({ partId }))?.quantity).toBe(3);
  });

  it("rejects a selected warehouse without serials", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send({
        ...payload("TEST-EMPTY-SERIAL", "SERIAL"),
        initialStock: { warehouseId, type: "OPENING", serials: [] },
      })
      .expect(400);
    expect(response.body).toMatchObject({
      code: "INITIAL_STOCK_SERIALS_REQUIRED",
    });
    expect(await parts.exists({ code: "TEST-EMPTY-SERIAL" })).toBeNull();
  });

  it("returns the precise validation code for zero quantity in a selected warehouse", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send({
        ...payload("TEST-EMPTY-QTY", "QUANTITY"),
        initialStock: { warehouseId, quantity: 0, type: "OPENING" },
      })
      .expect(400);
    expect(response.body).toMatchObject({
      code: "INITIAL_STOCK_QUANTITY_REQUIRED",
    });
    expect(await parts.exists({ code: "TEST-EMPTY-QTY" })).toBeNull();
  });

  it("rejects duplicate serials without creating a partial component", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send({
        ...payload("TEST-DUP-SERIAL", "SERIAL"),
        initialStock: {
          warehouseId,
          type: "OPENING",
          serials: ["DUP-01", " dup-01 "],
        },
      })
      .expect(400);
    expect(response.body).toMatchObject({
      code: "PART_SERIAL_DUPLICATE_IN_INITIAL_STOCK",
    });
    expect(await parts.exists({ code: "TEST-DUP-SERIAL" })).toBeNull();
  });

  it("creates a component at zero stock when initialStock is omitted", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send(payload("TEST-ZERO", "QUANTITY"))
      .expect(201);
    const partId = String(
      (response.body as { data: { _id: string } }).data._id,
    );
    expect(
      (response.body as { data: { stockQty: number } }).data.stockQty,
    ).toBe(0);
    expect(await balances.countDocuments({ partId })).toBe(0);
    expect(await transactions.countDocuments({ partId })).toBe(0);
  });

  it("generates a short component code when code is omitted", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/parts")
      .send({
        name: "RAM tự sinh mã",
        trackingMode: "QUANTITY",
        unitId,
        componentTypeId,
      })
      .expect(201);
    expect((response.body as { data: { code: string } }).data.code).toMatch(
      /^R\d{4,}$/,
    );
  });

  it("previews, commits and idempotently returns a quantity-part import", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/parts/import/preview")
      .send({
        fileName: "linh-kien.xlsx",
        rows: [
          {
            name: "Cáp HDMI import",
            trackingMode: "Theo số lượng",
            componentType: "Ổ cứng SSD",
            unit: "Cái",
            warehouse: "Kho IT kiểm thử",
            quantity: 20,
            source: "Tồn đầu kỳ",
          },
        ],
      })
      .expect(201);
    expect(preview.body).toMatchObject({
      totalRows: 1,
      validRows: 1,
      errorRows: 0,
    });
    const sessionId = (preview.body as { importSessionId: string })
      .importSessionId;
    const committed = await request(app.getHttpServer())
      .post("/api/parts/import/commit")
      .send({ importSessionId: sessionId, atomic: true })
      .expect(201);
    expect(committed.body).toMatchObject({ importedRows: 1, failedRows: 0 });
    const part = await parts.findOne({ name: "Cáp HDMI import" }).orFail();
    expect(part.stockQty).toBe(20);
    expect((await balances.findOne({ partId: part._id }))?.quantity).toBe(20);
    expect((await transactions.findOne({ partId: part._id }))?.quantity).toBe(
      20,
    );
    await request(app.getHttpServer())
      .post("/api/parts/import/commit")
      .send({ importSessionId: sessionId, atomic: true })
      .expect(201);
    expect(await transactions.countDocuments({ partId: part._id })).toBe(1);
  });

  it("reports duplicate serials during part preview without writing data", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/parts/import/preview")
      .send({
        fileName: "serial.xlsx",
        rows: [
          {
            name: "SSD import trùng",
            trackingMode: "Theo serial",
            componentType: "Ổ cứng SSD",
            unit: "Cái",
            warehouse: "Kho IT kiểm thử",
            serials: "IMP-SN-01, IMP-SN-01",
          },
        ],
      })
      .expect(201);
    expect(preview.body).toMatchObject({ validRows: 0, errorRows: 1 });
    expect(
      (preview.body as { rows: Array<{ errors: string[] }> }).rows[0].errors,
    ).toEqual(expect.arrayContaining([expect.stringContaining("IMP-SN-01")]));
    expect(await parts.exists({ name: "SSD import trùng" })).toBeNull();
  });

  it("imports serial parts using the serial count as initial stock", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/parts/import/preview")
      .send({
        fileName: "serial-hop-le.xlsx",
        rows: [
          {
            name: "SSD serial import",
            trackingMode: "Theo serial",
            componentType: "Ổ cứng SSD",
            unit: "Cái",
            warehouse: "Kho IT kiểm thử",
            quantity: 999,
            serials: "IMP-SN-A, IMP-SN-B, IMP-SN-C",
          },
        ],
      })
      .expect(201);
    const sessionId = (preview.body as { importSessionId: string })
      .importSessionId;
    await request(app.getHttpServer())
      .post("/api/parts/import/commit")
      .send({ importSessionId: sessionId })
      .expect(201);
    const part = await parts.findOne({ name: "SSD serial import" }).orFail();
    expect(part.stockQty).toBe(3);
    expect((await balances.findOne({ partId: part._id }))?.quantity).toBe(3);
    expect(await serials.countDocuments({ partId: part._id })).toBe(3);
  });

  it("rolls back an atomic batch when a duplicate appears after preview", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/parts/import/preview")
      .send({
        fileName: "atomic.xlsx",
        rows: [
          {
            name: "Atomic 1",
            code: "ATOMIC-1",
            trackingMode: "Theo số lượng",
            componentType: "Ổ cứng SSD",
            unit: "Cái",
          },
          {
            name: "Atomic 2",
            code: "ATOMIC-2",
            trackingMode: "Theo số lượng",
            componentType: "Ổ cứng SSD",
            unit: "Cái",
          },
        ],
      })
      .expect(201);
    await parts.create({
      name: "Phát sinh sau preview",
      code: "ATOMIC-2",
      trackingMode: "QUANTITY",
      componentTypeId,
      unitId,
    });
    await request(app.getHttpServer())
      .post("/api/parts/import/commit")
      .send({
        importSessionId: (preview.body as { importSessionId: string })
          .importSessionId,
        atomic: true,
      })
      .expect(409);
    expect(await parts.exists({ code: "ATOMIC-1" })).toBeNull();
  });

  it("auto-creates only device catalogs and imports a warehouse device", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/devices/import/preview")
      .send({
        fileName: "thiet-bi.xlsx",
        autoCreateCatalog: true,
        rows: [
          {
            name: "Laptop import",
            assetCode: "IT-LT-IMPORT-001",
            deviceType: "Laptop nhập Excel",
            model: "Latitude Import 999",
            condition: "Tốt",
            warehouse: "Kho IT kiểm thử",
            serial: "DEV-IMP-SN-01",
          },
        ],
      })
      .expect(201);
    expect(preview.body).toMatchObject({
      validRows: 1,
      errorRows: 0,
      warningRows: 1,
    });
    const sessionId = (preview.body as { importSessionId: string })
      .importSessionId;
    await request(app.getHttpServer())
      .post("/api/devices/import/commit")
      .send({ importSessionId: sessionId })
      .expect(201);
    const device = await devices.findOne({ serial: "DEV-IMP-SN-01" }).orFail();
    expect(device.assetCode).toBe("IT-LT-IMPORT-001");
    expect(device.usageStatus).toBe("IN_STOCK");
    expect(
      await deviceTypes.exists({ name: "Laptop nhập Excel" }),
    ).toBeTruthy();
    expect(
      await itemModels.exists({
        name: "Latitude Import 999",
        entityType: "DEVICE",
      }),
    ).toBeTruthy();
    expect(
      await itemModels.exists({
        name: "Latitude Import 999",
        entityType: "COMPONENT",
      }),
    ).toBeNull();
    expect(
      await assetTransactions.exists({
        deviceId: device._id,
        warehouseId,
        source: "DEVICE_IMPORT",
      }),
    ).toBeTruthy();
  });

  it("imports 100 devices with unique generated asset codes", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/devices/import/preview")
      .send({
        fileName: "100-thiet-bi.xlsx",
        autoCreateCatalog: true,
        rows: Array.from({ length: 100 }, (_, index) => ({
          name: `Laptop kiểm thử ${index + 1}`,
          assetCode: `IT-BATCH-${String(index + 1).padStart(3, "0")}`,
          deviceType: "Laptop nhập Excel",
          model: "Latitude Import 999",
          condition: "Tốt",
          warehouse: "Kho IT kiểm thử",
        })),
      })
      .expect(201);
    expect(preview.body).toMatchObject({
      totalRows: 100,
      validRows: 100,
      errorRows: 0,
    });
    await request(app.getHttpServer())
      .post("/api/devices/import/commit")
      .send({
        importSessionId: (preview.body as { importSessionId: string })
          .importSessionId,
      })
      .expect(201);
    const imported = await devices
      .find({ name: /^Laptop kiểm thử / })
      .select("assetCode")
      .lean();
    expect(imported).toHaveLength(100);
    expect(new Set(imported.map((item) => item.assetCode)).size).toBe(100);
    expect(
      await assetTransactions.countDocuments({
        deviceId: { $in: imported.map((item) => item._id) },
        source: "DEVICE_IMPORT",
      }),
    ).toBe(100);
  });

  it("declares separate import permissions for device and component routes", () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        // Decorator metadata is attached to the controller method itself.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        EquipmentController.prototype.previewDevices,
      ),
    ).toEqual(["devices.import"]);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        EquipmentController.prototype.commitParts,
      ),
    ).toEqual(["components.import"]);
  });
});
