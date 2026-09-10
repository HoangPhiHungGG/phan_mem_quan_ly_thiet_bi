import { ConflictException } from "@nestjs/common";
import { Connection, createConnection, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import type { CurrentActor } from "../auth/auth.types";
import {
  ItemModel,
  ItemModelSchema,
  Keeper,
  KeeperSchema,
  Location,
  LocationSchema,
  Unit,
  UnitSchema,
} from "../catalog/catalog.schemas";
import {
  Device,
  DeviceSchema,
  Part,
  PartSchema,
  PartSerial,
  PartSerialSchema,
} from "../equipment/equipment.schemas";
import {
  Department,
  DepartmentSchema,
  User,
  UserSchema,
  Warehouse,
  WarehouseSchema,
} from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";
import type { CreateRepairDto } from "./repairs.dto";
import { RepairDocument, RepairDocumentSchema } from "./repairs.schemas";
import { RepairsService } from "./repairs.service";

jest.setTimeout(30_000);

const integration = process.env.REPAIR_TEST_MONGODB_URI
  ? describe
  : describe.skip;

integration("RepairsService with MongoDB transactions", () => {
  let connection: Connection;
  let service: RepairsService;
  let repairs: Model<RepairDocument>;
  let devices: Model<Device>;
  let parts: Model<Part>;
  let balances: Model<InventoryBalance>;
  let transactions: Model<InventoryTransaction>;
  let warehouseId: string;
  let locationId: string;
  let partId: string;
  let sequence = 0;
  const actor = {
    userId: new Types.ObjectId(),
    displayName: "Kiểm thử sửa chữa",
    employeeCode: "REPAIR-TEST",
  } as CurrentActor;
  const database = `pmqltb_repair_test_${new Types.ObjectId().toHexString()}`;

  const payload = (deviceId: string): CreateRepairDto => ({
    repairDate: "2026-09-09",
    targetKind: "DEVICE",
    deviceId,
    conditionBefore: "BROKEN",
    issueDescription: "Thiết bị không khởi động",
    severity: "MODERATE",
    repairType: "INTERNAL",
    inspectionCost: 100_000,
    repairCost: 200_000,
  });

  async function createDevice() {
    sequence += 1;
    return devices.create({
      assetCode: `REPAIR-DEVICE-${sequence}`,
      usageStatus: "IN_STOCK",
      techCondition: "BROKEN",
      warehouseId,
      locationId,
      isActive: true,
    });
  }

  beforeAll(async () => {
    connection = await createConnection(process.env.REPAIR_TEST_MONGODB_URI!, {
      dbName: database,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    repairs = connection.model(RepairDocument.name, RepairDocumentSchema);
    devices = connection.model(Device.name, DeviceSchema);
    parts = connection.model(Part.name, PartSchema);
    const partSerials = connection.model(PartSerial.name, PartSerialSchema);
    balances = connection.model(InventoryBalance.name, InventoryBalanceSchema);
    transactions = connection.model(
      InventoryTransaction.name,
      InventoryTransactionSchema,
    );
    const warehouses = connection.model(Warehouse.name, WarehouseSchema);
    const departments = connection.model(Department.name, DepartmentSchema);
    const keepers = connection.model(Keeper.name, KeeperSchema);
    const locations = connection.model(Location.name, LocationSchema);
    const itemModels = connection.model(ItemModel.name, ItemModelSchema);
    const audit = new AuditService(
      connection.model(AuditLog.name, AuditLogSchema),
    );
    connection.model(User.name, UserSchema);
    const units = connection.model(Unit.name, UnitSchema);
    await Promise.all(
      Object.values(connection.models).map((model) => model.init()),
    );
    await connection.collection("users").insertOne({
      _id: actor.userId,
      displayName: actor.displayName,
      employeeCode: actor.employeeCode,
    });
    const warehouse = await warehouses.create({
      code: "REPAIR-WH",
      name: "Kho sửa chữa",
    });
    warehouseId = String(warehouse._id);
    locationId = String(
      (
        await locations.create({
          code: "REPAIR-LOC",
          name: "Kệ sau sửa",
          warehouseId,
        })
      )._id,
    );
    const unit = await units.create({ code: "CAI", name: "Cái" });
    const part = await parts.create({
      code: "RAM-TEST",
      name: "RAM kiểm thử",
      trackingMode: "QUANTITY",
      unitId: unit._id,
      isActive: true,
    });
    partId = String(part._id);
    await balances.create({ partId, warehouseId, quantity: 2 });
    service = new RepairsService(
      repairs,
      devices,
      parts,
      partSerials,
      balances,
      transactions,
      warehouses,
      locations,
      keepers,
      departments,
      itemModels,
      audit,
    );
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
  });

  it("runs draft → receive → repair → complete atomically and records stock", async () => {
    const device = await createDevice();
    const created = await service.create(payload(String(device._id)), actor);
    expect(created.data.status).toBe("DRAFT");
    expect(created.data.totalCost).toBe(300_000);

    await service.update(
      String(created.data._id),
      {
        ...payload(String(device._id)),
        responsiblePerson: "Kỹ thuật viên A",
        expectedCompletionAt: "2026-09-12",
      },
      actor,
    );
    await service.receive(String(created.data._id), actor, {});
    expect((await devices.findById(device._id).lean())?.usageStatus).toBe(
      "REPAIRING",
    );

    await service.start(String(created.data._id), actor, {});
    await service.complete(
      String(created.data._id),
      {
        result: "Đã thay RAM, thiết bị hoạt động ổn định",
        repairContent: "Vệ sinh và thay RAM",
        conditionAfter: "GOOD",
        outcome: "RETURN_TO_WAREHOUSE",
        destinationWarehouseId: warehouseId,
        destinationLocationId: locationId,
        partsWarehouseId: warehouseId,
        parts: [{ partId, quantity: 1 }],
        inspectionCost: 100_000,
        repairCost: 200_000,
        partsCost: 500_000,
      },
      actor,
    );

    const [savedRepair, savedDevice, balance, transaction] = await Promise.all([
      repairs.findById(created.data._id).lean(),
      devices.findById(device._id).lean(),
      balances.findOne({ partId, warehouseId }).lean(),
      transactions.findOne({ repairId: created.data._id }).lean(),
    ]);
    expect(savedRepair?.status).toBe("COMPLETED");
    expect(savedRepair?.totalCost).toBe(800_000);
    expect(savedRepair?.activeTargetKey).toBeUndefined();
    expect(savedDevice?.usageStatus).toBe("IN_STOCK");
    expect(savedDevice?.techCondition).toBe("GOOD");
    expect(String(savedDevice?.warehouseId)).toBe(warehouseId);
    expect(balance?.quantity).toBe(1);
    expect(transaction?.type).toBe("ISSUE");
  });

  it("prevents two active repair documents for one device under concurrent requests", async () => {
    const device = await createDevice();
    const results = await Promise.allSettled([
      service.create(payload(String(device._id)), actor),
      service.create(payload(String(device._id)), actor),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("rolls back completion when replacement stock is insufficient", async () => {
    const device = await createDevice();
    const created = await service.create(payload(String(device._id)), actor);
    await service.receive(String(created.data._id), actor, {});
    await service.start(String(created.data._id), actor, {});

    await expect(
      service.complete(
        String(created.data._id),
        {
          result: "Thử thay linh kiện",
          conditionAfter: "GOOD",
          outcome: "RETURN_TO_WAREHOUSE",
          destinationWarehouseId: warehouseId,
          partsWarehouseId: warehouseId,
          parts: [{ partId, quantity: 99 }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await repairs.findById(created.data._id).lean())?.status).toBe(
      "REPAIRING",
    );
    expect((await devices.findById(device._id).lean())?.usageStatus).toBe(
      "REPAIRING",
    );
    expect(
      (await balances.findOne({ partId, warehouseId }).lean())?.quantity,
    ).toBe(1);
  });

  it("rejects a second completion request", async () => {
    const completed = await repairs.findOne({ status: "COMPLETED" }).lean();
    expect(completed).toBeTruthy();
    await expect(
      service.complete(
        String(completed!._id),
        {
          result: "Hoàn tất lần hai",
          conditionAfter: "GOOD",
          outcome: "PENDING",
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("restores the original device placement when an active repair is cancelled", async () => {
    const device = await createDevice();
    const created = await service.create(payload(String(device._id)), actor);
    await service.receive(String(created.data._id), actor, {});
    await service.cancel(
      String(created.data._id),
      { reason: "Nhà cung cấp xác nhận thiết bị không cần gửi sửa" },
      actor,
    );
    const [savedRepair, restoredDevice] = await Promise.all([
      repairs.findById(created.data._id).lean(),
      devices.findById(device._id).lean(),
    ]);
    expect(savedRepair?.status).toBe("CANCELLED");
    expect(savedRepair?.activeTargetKey).toBeUndefined();
    expect(restoredDevice?.usageStatus).toBe("IN_STOCK");
    expect(String(restoredDevice?.warehouseId)).toBe(warehouseId);
    expect(String(restoredDevice?.locationId)).toBe(locationId);
  });

  it("allows only one concurrent progress update", async () => {
    const device = await createDevice();
    const created = await service.create(payload(String(device._id)), actor);
    await service.receive(String(created.data._id), actor, {});
    await service.start(String(created.data._id), actor, {});
    const results = await Promise.allSettled([
      service.updateProgress(
        String(created.data._id),
        { repairContent: "Tiến độ A" },
        actor,
      ),
      service.updateProgress(
        String(created.data._id),
        { repairContent: "Tiến độ B" },
        actor,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});
