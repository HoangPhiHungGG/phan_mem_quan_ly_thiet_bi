import { ConflictException } from "@nestjs/common";
import { Connection, createConnection, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import type { CurrentActor } from "../auth/auth.types";
import {
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
import {
  InventoryCountDocument,
  InventoryCountDocumentSchema,
} from "./inventory-count.schemas";
import { InventoryCountService } from "./inventory-count.service";

jest.setTimeout(30_000);
const integration = process.env.COUNT_TEST_MONGODB_URI
  ? describe
  : describe.skip;
const itemId = (value: unknown) =>
  String((value as { _id: Types.ObjectId })._id);
integration("InventoryCountService snapshots and reconciliation", () => {
  let connection: Connection;
  let service: InventoryCountService;
  let warehouseId: string;
  let locationId: string;
  let otherLocationId: string;
  let keeperId: string;
  let otherKeeperId: string;
  let deviceId: string;
  let partId: string;
  const actor = {
    userId: new Types.ObjectId(),
    displayName: "Kiểm kê test",
    employeeCode: "COUNT-TEST",
  } as CurrentActor;
  const database = `pmqltb_count_test_${new Types.ObjectId().toHexString()}`;
  beforeAll(async () => {
    connection = await createConnection(process.env.COUNT_TEST_MONGODB_URI!, {
      dbName: database,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    const docs = connection.model(
        InventoryCountDocument.name,
        InventoryCountDocumentSchema,
      ),
      devices = connection.model(Device.name, DeviceSchema),
      parts = connection.model(Part.name, PartSchema),
      balances = connection.model(
        InventoryBalance.name,
        InventoryBalanceSchema,
      ),
      transactions = connection.model(
        InventoryTransaction.name,
        InventoryTransactionSchema,
      ),
      warehouses = connection.model(Warehouse.name, WarehouseSchema),
      departments = connection.model(Department.name, DepartmentSchema),
      locations = connection.model(Location.name, LocationSchema),
      keepers = connection.model(Keeper.name, KeeperSchema),
      units = connection.model(Unit.name, UnitSchema);
    connection.model(User.name, UserSchema);
    const audit = new AuditService(
      connection.model(AuditLog.name, AuditLogSchema),
    );
    await Promise.all(Object.values(connection.models).map((m) => m.init()));
    await connection.collection("users").insertOne({
      _id: actor.userId,
      displayName: actor.displayName,
      employeeCode: actor.employeeCode,
    });
    const wh = await warehouses.create({
      code: "COUNT-WH",
      name: "Kho kiểm kê",
    });
    warehouseId = String(wh._id);
    locationId = String(
      (await locations.create({ code: "L1", name: "Kệ 1", warehouseId }))._id,
    );
    otherLocationId = String(
      (await locations.create({ code: "L2", name: "Kệ 2", warehouseId }))._id,
    );
    keeperId = String(
      (await keepers.create({ displayName: "Người giữ A" }))._id,
    );
    otherKeeperId = String(
      (await keepers.create({ displayName: "Người giữ B" }))._id,
    );
    const unit = await units.create({ code: "CAI", name: "Cái" });
    const part = await parts.create({
      code: "RAM-COUNT",
      name: "RAM",
      trackingMode: "QUANTITY",
      unitId: unit._id,
    });
    partId = String(part._id);
    await balances.create({ partId, warehouseId, quantity: 10 });
    const device = await devices.create({
      assetCode: "COUNT-DEVICE",
      usageStatus: "IN_STOCK",
      techCondition: "GOOD",
      warehouseId,
      locationId,
      keeperId,
    });
    deviceId = String(device._id);
    service = new InventoryCountService(
      docs,
      devices,
      parts,
      balances,
      transactions,
      warehouses,
      departments,
      locations,
      keepers,
      audit,
    );
  });
  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
  });
  async function started() {
    const created = await service.create(
      {
        name: "Kiểm kê tháng 9",
        countDate: "2026-09-09",
        scope: "WAREHOUSE",
        warehouseId,
        responsiblePerson: "IT",
      },
      actor,
    );
    return service.start(String(created.data._id), actor);
  }
  it("keeps a frozen snapshot when stock changes and calculates discrepancies", async () => {
    const count = await started();
    expect(count.data.partItems[0].expectedQuantity).toBe(10);
    await connection
      .model(InventoryBalance.name)
      .updateOne({ partId, warehouseId }, { $set: { quantity: 8 } });
    const deviceItem = count.data.deviceItems[0],
      partItem = count.data.partItems[0];
    await service.checkDevice(
      String(count.data._id),
      itemId(deviceItem),
      {
        revision: 0,
        found: true,
        actualLocationId: otherLocationId,
        actualKeeperId: keeperId,
        actualCondition: "GOOD",
      },
      actor,
    );
    const checked = await service.checkPart(
      String(count.data._id),
      itemId(partItem),
      { revision: 0, actualQuantity: 8 },
      actor,
    );
    expect(checked.data.partItems[0].expectedQuantity).toBe(10);
    expect(checked.data.partItems[0].result).toBe("MISSING");
    expect(checked.data.deviceItems[0].result).toBe("WRONG_LOCATION");
    await service.reconcile(String(count.data._id), actor);
    for (const d of checked.data.discrepancies) {
      await service.resolve(
        String(count.data._id),
        d.key,
        {
          action: "ACCEPT",
          cause: "Đã xác minh",
          resolution: "Chấp nhận kết quả",
        },
        actor,
      );
    }
    const current = await service.get(String(count.data._id));
    for (const d of current.data.discrepancies.filter(
      (x: { status: string }) => x.status === "OPEN",
    )) {
      await service.resolve(
        String(count.data._id),
        d.key,
        {
          action: "ACCEPT",
          cause: "Đã xác minh",
          resolution: "Chấp nhận kết quả",
        },
        actor,
      );
    }
    const completed = await service.complete(String(count.data._id), actor);
    expect(completed.data.status).toBe("COMPLETED");
  });
  it("creates an inventory adjustment transaction only during discrepancy resolution", async () => {
    await connection
      .model(InventoryBalance.name)
      .updateOne({ partId, warehouseId }, { $set: { quantity: 10 } });
    const count = await started();
    const deviceItem = count.data.deviceItems[0],
      partItem = count.data.partItems[0];
    await service.checkDevice(
      String(count.data._id),
      itemId(deviceItem),
      {
        revision: 0,
        found: true,
        actualLocationId: locationId,
        actualKeeperId: keeperId,
        actualCondition: "GOOD",
      },
      actor,
    );
    await service.checkPart(
      String(count.data._id),
      itemId(partItem),
      { revision: 0, actualQuantity: 7 },
      actor,
    );
    expect(
      (
        (await connection
          .model(InventoryBalance.name)
          .findOne({ partId, warehouseId })
          .lean()) as unknown as { quantity: number }
      ).quantity,
    ).toBe(10);
    const reconciling = await service.reconcile(String(count.data._id), actor);
    const discrepancy = reconciling.data.discrepancies[0];
    await service.resolve(
      String(count.data._id),
      discrepancy.key,
      {
        action: "ADJUST",
        cause: "Mất 3 linh kiện",
        resolution: "Điều chỉnh tồn",
      },
      actor,
    );
    expect(
      (
        (await connection
          .model(InventoryBalance.name)
          .findOne({ partId, warehouseId })
          .lean()) as unknown as { quantity: number }
      ).quantity,
    ).toBe(7);
    expect(
      await connection.model(InventoryTransaction.name).exists({
        inventoryCountId: count.data._id,
        type: "INVENTORY_ADJUSTMENT",
        quantity: -3,
      }),
    ).toBeTruthy();
  });
  it("rejects two updates using the same item revision", async () => {
    const count = await started();
    const item =
      count.data.deviceItems.find(
        (x: { deviceId: unknown }) => String(x.deviceId) === deviceId,
      ) ?? count.data.deviceItems[0];
    const updates = await Promise.allSettled([
      service.checkDevice(
        String(count.data._id),
        itemId(item),
        { revision: 0, found: false },
        actor,
      ),
      service.checkDevice(
        String(count.data._id),
        itemId(item),
        {
          revision: 0,
          found: true,
          actualLocationId: locationId,
          actualKeeperId: otherKeeperId,
          actualCondition: "BROKEN",
        },
        actor,
      ),
    ]);
    expect(updates.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(updates.find((x) => x.status === "rejected")?.reason).toBeInstanceOf(
      ConflictException,
    );
  });
});
