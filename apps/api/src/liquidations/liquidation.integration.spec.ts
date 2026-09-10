import { ConflictException } from "@nestjs/common";
import { Connection, createConnection, Model, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import type { CurrentActor } from "../auth/auth.types";
import {
  ItemModel,
  ItemModelSchema,
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
import {
  RepairDocument,
  RepairDocumentSchema,
} from "../repairs/repairs.schemas";
import {
  LiquidationDocument,
  LiquidationDocumentSchema,
} from "./liquidation.schemas";
import { LiquidationService } from "./liquidation.service";

jest.setTimeout(30_000);
const integration = process.env.LIQUIDATION_TEST_MONGODB_URI
  ? describe
  : describe.skip;
integration("LiquidationService transactions", () => {
  let connection: Connection;
  let service: LiquidationService;
  let warehouseId: string;
  let partId: string;
  let deviceId: string;
  const actor = {
    userId: new Types.ObjectId(),
    displayName: "Admin test",
    employeeCode: "TEST",
  } as CurrentActor;
  const database = `pmqltb_liquidation_test_${new Types.ObjectId().toHexString()}`;
  beforeAll(async () => {
    connection = await createConnection(
      process.env.LIQUIDATION_TEST_MONGODB_URI!,
      { dbName: database, serverSelectionTimeoutMS: 5000 },
    ).asPromise();
    const documents = connection.model(
      LiquidationDocument.name,
      LiquidationDocumentSchema,
    );
    const devices = connection.model(Device.name, DeviceSchema);
    const parts = connection.model(Part.name, PartSchema);
    const serials = connection.model(PartSerial.name, PartSerialSchema);
    const repairs = connection.model(RepairDocument.name, RepairDocumentSchema);
    const balances = connection.model(
      InventoryBalance.name,
      InventoryBalanceSchema,
    );
    const transactions = connection.model(
      InventoryTransaction.name,
      InventoryTransactionSchema,
    );
    const warehouses = connection.model(Warehouse.name, WarehouseSchema);
    const departments = connection.model(Department.name, DepartmentSchema);
    const models = connection.model(ItemModel.name, ItemModelSchema);
    const units = connection.model(Unit.name, UnitSchema);
    connection.model(User.name, UserSchema);
    const audit = new AuditService(
      connection.model(AuditLog.name, AuditLogSchema),
    );
    await Promise.all(
      Object.values(connection.models).map((model) => model.init()),
    );
    await connection.collection("users").insertOne({
      _id: actor.userId,
      displayName: actor.displayName,
      employeeCode: actor.employeeCode,
    });
    const warehouse = await warehouses.create({
      code: "TL-KHO",
      name: "Kho thanh lý",
    });
    warehouseId = String(warehouse._id);
    const unit = await units.create({ code: "CAI", name: "Cái" });
    const part = await parts.create({
      code: "TL-RAM",
      name: "RAM cũ",
      trackingMode: "QUANTITY",
      unitId: unit._id,
    });
    partId = String(part._id);
    await balances.create({ partId, warehouseId, quantity: 3 });
    const device = await devices.create({
      assetCode: "TL-DEVICE",
      usageStatus: "IN_STOCK",
      techCondition: "BROKEN",
      warehouseId,
      purchasePrice: 5_000_000,
    });
    deviceId = String(device._id);
    service = new LiquidationService(
      documents,
      devices,
      parts,
      serials,
      repairs,
      balances,
      transactions,
      warehouses,
      departments,
      models,
      audit,
    );
  });
  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
  });
  const payload = () => ({
    documentDate: "2026-09-09",
    warehouseId,
    reason: "Hết vòng đời",
    method: "DESTROY" as const,
    lines: [
      {
        kind: "DEVICE" as const,
        deviceId,
        quantity: 1,
        liquidationValue: 100_000,
      },
      { kind: "PART" as const, partId, quantity: 2, liquidationValue: 10_000 },
    ],
  });
  it("runs draft, submit, approve and completes device plus inventory atomically", async () => {
    const created = await service.create(payload(), actor);
    const id = String(created.data._id);
    expect(created.data.status).toBe("DRAFT");
    await service.submit(id, actor);
    await service.approve(id, actor);
    await service.complete(id, {}, actor);
    const [document, device, balance, transaction] = await Promise.all([
      connection.model(LiquidationDocument.name).findById(id).lean(),
      connection.model(Device.name).findById(deviceId).lean(),
      connection
        .model(InventoryBalance.name)
        .findOne({ partId, warehouseId })
        .lean(),
      connection
        .model(InventoryTransaction.name)
        .findOne({ liquidationId: id })
        .lean(),
    ]);
    const savedDocument = document as unknown as {
      status: string;
      totalValue: number;
    };
    const savedDevice = device as unknown as {
      usageStatus: string;
      warehouseId?: unknown;
    };
    const savedBalance = balance as unknown as { quantity: number };
    const savedTransaction = transaction as unknown as { type: string };
    expect(savedDocument.status).toBe("COMPLETED");
    expect(savedDocument.totalValue).toBe(120_000);
    expect(savedDevice.usageStatus).toBe("DISPOSED");
    expect(savedDevice.warehouseId).toBeUndefined();
    expect(savedBalance.quantity).toBe(1);
    expect(savedTransaction.type).toBe("LIQUIDATION");
    await expect(service.complete(id, {}, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const balanceAfterDuplicate = await connection
      .model(InventoryBalance.name)
      .findOne({ partId, warehouseId })
      .lean();
    expect(
      (balanceAfterDuplicate as unknown as { quantity: number }).quantity,
    ).toBe(1);
  });
  it("rejects assets that are assigned, lent or under repair", async () => {
    for (const usageStatus of ["IN_USE", "LENT", "REPAIRING"]) {
      const device = await (
        connection.model(Device.name) as Model<Device>
      ).create({
        assetCode: `BLOCK-${usageStatus}`,
        usageStatus,
        techCondition: "BROKEN",
        warehouseId,
      });
      await expect(
        service.create(
          {
            ...payload(),
            lines: [
              { kind: "DEVICE", deviceId: String(device._id), quantity: 1 },
            ],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });
  it("rolls back when component stock is insufficient", async () => {
    const created = await service.create(
      { ...payload(), lines: [{ kind: "PART", partId, quantity: 99 }] },
      actor,
    );
    const id = String(created.data._id);
    await service.submit(id, actor);
    await service.approve(id, actor);
    await expect(service.complete(id, {}, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const failedDocument = await connection
      .model(LiquidationDocument.name)
      .findById(id)
      .lean();
    const balanceAfterFailure = await connection
      .model(InventoryBalance.name)
      .findOne({ partId, warehouseId })
      .lean();
    expect((failedDocument as unknown as { status: string }).status).toBe(
      "APPROVED",
    );
    expect(
      (balanceAfterFailure as unknown as { quantity: number }).quantity,
    ).toBe(1);
  });
});
