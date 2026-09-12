import { Connection, createConnection, Types } from "mongoose";
import { Device, DeviceSchema } from "./equipment/equipment.schemas";
import { Warehouse, WarehouseSchema } from "./identity/identity.schemas";
import {
  AssetTransaction,
  AssetTransactionSchema,
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "./inventory/inventory.schemas";
import { WarehouseViewService } from "./inventory/warehouse-view.service";
import { migrateUnwarehousedDevices } from "./migrate-unwarehoused-devices";

const integration = process.env.EQUIPMENT_TEST_MONGODB_URI
  ? describe
  : describe.skip;

integration("Legacy unwarehoused device migration", () => {
  let connection: Connection;
  const database = `pmqltb_device_migration_test_${new Types.ObjectId().toHexString()}`;

  beforeAll(async () => {
    connection = await createConnection(
      process.env.EQUIPMENT_TEST_MONGODB_URI!,
      { dbName: database },
    ).asPromise();
  });

  afterAll(async () => {
    if (connection) {
      if (
        connection.name === database &&
        database.startsWith("pmqltb_device_migration_test_")
      )
        await connection.dropDatabase();
      await connection.close();
    }
  });

  it("moves only eligible devices to Kho IT and is idempotent", async () => {
    const warehouses = connection.model(Warehouse.name, WarehouseSchema);
    const devices = connection.model(Device.name, DeviceSchema);
    const transactions = connection.model(
      AssetTransaction.name,
      AssetTransactionSchema,
    );
    const target = await warehouses.create({ code: "KIT", name: "Kho IT" });
    const other = await warehouses.create({ code: "KHO2", name: "Kho khác" });
    const eligible = await devices.create([
      {
        assetCode: "LEGACY-001",
        techCondition: "GOOD",
        usageStatus: "NOT_RECEIVED",
      },
      {
        assetCode: "LEGACY-002",
        techCondition: "GOOD",
        usageStatus: "NOT_RECEIVED",
      },
    ]);
    const alreadyStored = await devices.create({
      assetCode: "STORED-001",
      techCondition: "GOOD",
      usageStatus: "IN_STOCK",
      warehouseId: other._id,
    });
    const inUse = await devices.create({
      assetCode: "IN-USE-001",
      techCondition: "GOOD",
      usageStatus: "IN_USE",
    });

    const dryRun = await migrateUnwarehousedDevices(connection, false);
    expect(dryRun).toMatchObject({ found: 2, migrated: 0 });
    expect(await devices.countDocuments({ usageStatus: "NOT_RECEIVED" })).toBe(
      2,
    );

    const first = await migrateUnwarehousedDevices(connection, true);
    expect(first).toMatchObject({ found: 2, migrated: 2, skipped: 0 });
    const migrated = await devices.find({
      _id: { $in: eligible.map((d) => d._id) },
    });
    expect(
      migrated.every((d) => String(d.warehouseId) === String(target._id)),
    ).toBe(true);
    expect(migrated.every((d) => d.usageStatus === "IN_STOCK")).toBe(true);
    expect(
      await transactions.countDocuments({ source: "LEGACY_MIGRATION" }),
    ).toBe(2);
    const warehouseView = new WarehouseViewService(
      warehouses,
      devices,
      connection.model(InventoryBalance.name, InventoryBalanceSchema),
      connection.model(InventoryTransaction.name, InventoryTransactionSchema),
    );
    const history = await warehouseView.history(String(target._id), {});
    const historyRows = history.data as Array<{
      object?: { code?: string };
      type?: string;
      actor?: { displayName?: string };
    }>;
    const migratedHistory = historyRows.filter(
      (item) =>
        item.object?.code === "LEGACY-001" ||
        item.object?.code === "LEGACY-002",
    );
    expect(migratedHistory).toHaveLength(2);
    expect(migratedHistory.every((item) => item.type === "OPENING")).toBe(true);
    expect(migratedHistory.map((item) => item.actor?.displayName)).toEqual([
      "Hệ thống migration",
      "Hệ thống migration",
    ]);
    expect(
      String((await devices.findById(alreadyStored._id))?.warehouseId),
    ).toBe(String(other._id));
    expect((await devices.findById(inUse._id))?.usageStatus).toBe("IN_USE");

    const second = await migrateUnwarehousedDevices(connection, true);
    expect(second).toMatchObject({ found: 0, migrated: 0, skipped: 0 });
    expect(
      await transactions.countDocuments({ source: "LEGACY_MIGRATION" }),
    ).toBe(2);
  });
});
