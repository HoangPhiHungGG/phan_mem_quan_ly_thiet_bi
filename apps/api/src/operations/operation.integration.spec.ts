import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Connection, createConnection, Model, Types } from "mongoose";
import request from "supertest";
import type { Server } from "node:http";
type ApiRow = {
  _id: string;
  code: string;
  status: string;
  note?: string;
  lines: unknown[];
  createdBy: { displayName: string };
};
const responseData = (response: request.Response) =>
  (response.body as { data: ApiRow }).data;
import { WarehouseViewService } from "../inventory/warehouse-view.service";
import { WarehouseViewController } from "../inventory/warehouse-view.controller";
import {
  InboundReceipt,
  InboundReceiptSchema,
} from "../receipts/receipt.schemas";
import { LoanService } from "./loan.service";
import { OperationService } from "./operation.service";
import { OperationController } from "./operation.controller";
import {
  OperationDocument,
  OperationDocumentSchema,
} from "./operation.schemas";
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
  Warehouse,
  WarehouseSchema,
  User,
  UserSchema,
} from "../identity/identity.schemas";
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
  InventoryBalance,
  InventoryBalanceSchema,
  InventoryTransaction,
  InventoryTransactionSchema,
} from "../inventory/inventory.schemas";
import {
  IdempotencyKey,
  IdempotencyKeySchema,
} from "../receipts/receipt.schemas";
import { AuditLog, AuditLogSchema } from "../auth/auth.schemas";
import { AuditService } from "../auth/audit.service";
import { AuthenticatedRequest, CurrentActor } from "../auth/auth.types";
import { CreateOperationDto } from "./operation.dto";

// Opt-in, real MongoDB replica set. Never uses the application database.
const integration = process.env.ISSUE_TEST_MONGODB_URI
  ? describe
  : describe.skip;
integration("Operations API with real MongoDB transactions", () => {
  let connection: Connection;
  let app: INestApplication<Server>;
  let service: OperationService;
  let warehouseView: WarehouseViewService;
  let operations: Model<OperationDocument>;
  let devices: Model<Device>;
  let parts: Model<Part>;
  let balances: Model<InventoryBalance>;
  let transactions: Model<InventoryTransaction>;
  let serials: Model<PartSerial>;
  let warehouseId: string;
  let departmentId: string;
  let keeperId: string;
  let partId: string;
  let deviceIds: string[];
  const actor = {
    userId: new Types.ObjectId(),
    displayName: "Người kiểm thử",
    employeeCode: "TEST",
  } as CurrentActor;
  const database = `pmqltb_issue_test_${new Types.ObjectId().toHexString()}`;
  const payload = (
    lines?: CreateOperationDto["lines"],
  ): CreateOperationDto => ({
    type: "ISSUE",
    operationDate: "2026-09-08",
    sourceWarehouseId: warehouseId,
    receiverKeeperId: keeperId,
    receiverDepartmentId: departmentId,
    reason: "Cấp thiết bị kiểm thử",
    note: "Ghi chú phiếu",
    lines: lines ?? [
      {
        kind: "DEVICE",
        deviceId: deviceIds[0],
        quantity: 1,
        handoverCondition: "GOOD",
        note: "Bàn giao đủ phụ kiện",
      },
    ],
  });
  const mixed = () =>
    payload([
      ...payload().lines,
      { kind: "PART", partId, quantity: 2, handoverCondition: "GOOD" },
    ]);
  async function create(input = payload()) {
    const response = await request(app.getHttpServer())
      .post("/api/operations")
      .send(input)
      .expect(201);
    return responseData(response);
  }
  beforeAll(async () => {
    connection = await createConnection(process.env.ISSUE_TEST_MONGODB_URI!, {
      dbName: database,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    operations = connection.model(
      OperationDocument.name,
      OperationDocumentSchema,
    );
    devices = connection.model(Device.name, DeviceSchema);
    parts = connection.model(Part.name, PartSchema);
    balances = connection.model(InventoryBalance.name, InventoryBalanceSchema);
    transactions = connection.model(
      InventoryTransaction.name,
      InventoryTransactionSchema,
    );
    serials = connection.model(PartSerial.name, PartSerialSchema);
    const warehouses = connection.model(Warehouse.name, WarehouseSchema);
    const departments = connection.model(Department.name, DepartmentSchema);
    const keepers = connection.model(Keeper.name, KeeperSchema);
    const locations = connection.model(Location.name, LocationSchema);
    const keys = connection.model(IdempotencyKey.name, IdempotencyKeySchema);
    const audit = new AuditService(
      connection.model(AuditLog.name, AuditLogSchema),
    );
    connection.model(User.name, UserSchema);
    connection.model(InboundReceipt.name, InboundReceiptSchema);
    connection.model(ItemModel.name, ItemModelSchema);
    connection.model(Unit.name, UnitSchema);
    await Promise.all(
      Object.values(connection.models).map((model) => model.init()),
    );
    await connection.collection("users").insertOne({
      _id: actor.userId,
      displayName: actor.displayName,
      employeeCode: actor.employeeCode,
    });
    warehouseId = String(
      (await warehouses.create({ code: "TEST-WH", name: "Kho kiểm thử" }))._id,
    );
    departmentId = String(
      (
        await departments.create({
          code: "TEST-DEPT",
          name: "Bộ phận kiểm thử",
        })
      )._id,
    );
    keeperId = String(
      (
        await keepers.create({
          displayName: "Người nhận kiểm thử",
          departmentId,
        })
      )._id,
    );
    const unit = await connection
      .model<Unit>(Unit.name)
      .create({ code: "CAI", name: "Cái" });
    partId = String(
      (
        await parts.create({
          code: "TEST-PART",
          name: "RAM",
          trackingMode: "QUANTITY",
          unitId: unit._id,
        })
      )._id,
    );
    service = new OperationService(
      operations,
      devices,
      parts,
      balances,
      transactions,
      warehouses,
      departments,
      keepers,
      locations,
      keys,
      audit,
      serials,
      new LoanService(
        operations,
        devices,
        warehouses,
        keepers,
        departments,
        locations,
        keys,
        audit,
      ),
    );
    warehouseView = new WarehouseViewService(
      warehouses,
      devices,
      balances,
      transactions,
    );
    const module = await Test.createTestingModule({
      controllers: [OperationController, WarehouseViewController],
      providers: [
        { provide: OperationService, useValue: service },
        { provide: WarehouseViewService, useValue: warehouseView },
      ],
    }).compile();
    app = module.createNestApplication();
    // Authentication is tested separately; these tests exercise controller, DTOs and real persistence.
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
  }, 20000);
  beforeEach(async () => {
    await operations.deleteMany({});
    await devices.deleteMany({});
    await balances.deleteMany({});
    await transactions.deleteMany({});
    await serials.deleteMany({});
    const created = await devices.create([
      { assetCode: "TEST-D1", warehouseId, locationId: new Types.ObjectId() },
      { assetCode: "TEST-D2", warehouseId },
    ]);
    deviceIds = created.map((item) => String(item._id));
    await balances.create({ partId, warehouseId, quantity: 5 });
  });
  afterAll(async () => {
    await app?.close();
    if (connection) {
      if (
        connection.name === database &&
        database.startsWith("pmqltb_issue_test_")
      )
        await connection.dropDatabase();
      await connection.close();
    }
  });
  it("creates an unfinished issue without changing assets or inventory, and reads persistent detail/list", async () => {
    const row = await create(mixed());
    expect(row.status).toBe("PENDING");
    expect(row.code).toMatch(/^ISSUE-\d{8}-\d{3,}$/);
    expect((await devices.findById(deviceIds[0]))?.usageStatus).toBe(
      "IN_STOCK",
    );
    expect((await balances.findOne({ partId }))?.quantity).toBe(5);
    const detail = await request(app.getHttpServer())
      .get(`/api/operations/${row._id}`)
      .expect(200);
    expect(responseData(detail).note).toBe("Ghi chú phiếu");
    expect(responseData(detail).lines).toHaveLength(2);
    expect(responseData(detail).createdBy.displayName).toBe(actor.displayName);
    const list = await request(app.getHttpServer())
      .get("/api/operations?type=ISSUE")
      .expect(200);
    expect((list.body as { data: ApiRow[] }).data[0]._id).toBe(row._id);
  });
  it("supports multiple devices and edits the same issue without changing its code", async () => {
    const row = await create();
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}`)
      .send({
        ...payload(
          deviceIds.map((deviceId) => ({
            kind: "DEVICE",
            deviceId,
            quantity: 1,
            handoverCondition: "GOOD",
          })),
        ),
        code: "MANUAL-CODE",
      })
      .expect(200);
    expect(await operations.countDocuments()).toBe(1);
    expect((await operations.findById(row._id))?.code).toBe(row.code);
    expect((await operations.findById(row._id))?.lines).toHaveLength(2);
  });
  it("deletes an unfinished issue without changing inventory", async () => {
    const row = await create(mixed());
    await request(app.getHttpServer())
      .delete(`/api/operations/${row._id}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/operations/${row._id}`)
      .expect(404);
    expect((await balances.findOne({ partId }))?.quantity).toBe(5);
  });
  it("completes mixed issue atomically and locks update/delete/recompletion", async () => {
    const row = await create(mixed());
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}/complete`)
      .expect(200);
    const device = await devices.findById(deviceIds[0]);
    expect(device?.usageStatus).toBe("IN_USE");
    expect(String(device?.keeperId)).toBe(keeperId);
    expect(String(device?.departmentId)).toBe(departmentId);
    expect(device?.locationId).toBeUndefined();
    expect((await balances.findOne({ partId }))?.quantity).toBe(3);
    const op = await operations.findById(row._id);
    expect(op?.status).toBe("COMPLETED");
    expect(op?.completedAt).toBeInstanceOf(Date);
    expect(String(op?.completedBy)).toBe(String(actor.userId));
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}`)
      .send(payload())
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/operations/${row._id}`)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}/complete`)
      .expect(409);
    expect(await transactions.countDocuments()).toBe(1);
  });
  it("rejects a device allocated by another issue", async () => {
    const first = await create();
    const second = await create();
    await service.complete(first._id, actor);
    await request(app.getHttpServer())
      .patch(`/api/operations/${second._id}/complete`)
      .expect(409);
    expect((await operations.findById(second._id))?.status).toBe("PENDING");
  });
  it.each([
    { techCondition: "BROKEN" },
    { keeperId: new Types.ObjectId() },
    { usageStatus: "LENT" },
    { usageStatus: "REPAIRING" },
    { usageStatus: "LOST" },
    { usageStatus: "DISPOSED" },
  ])(
    "rejects unavailable issue devices at save and completion: %j",
    async (patch) => {
      const row = await create();
      await devices.updateOne({ _id: deviceIds[0] }, { $set: patch });
      await request(app.getHttpServer())
        .post("/api/operations")
        .send(payload())
        .expect(409);
      await request(app.getHttpServer())
        .patch(`/api/operations/${row._id}`)
        .send(payload())
        .expect(409);
      await request(app.getHttpServer())
        .patch(`/api/operations/${row._id}/complete`)
        .expect(409);
      expect((await operations.findById(row._id))?.status).toBe("PENDING");
    },
  );
  it("rechecks reduced stock before completion", async () => {
    const row = await create(mixed());
    await balances.updateOne({ partId }, { $set: { quantity: 1 } });
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}/complete`)
      .expect(409);
    expect((await devices.findById(deviceIds[0]))?.usageStatus).toBe(
      "IN_STOCK",
    );
    expect((await balances.findOne({ partId }))?.quantity).toBe(1);
  });
  it("rolls back earlier device and balance writes if a later transaction insert fails", async () => {
    const row = await create(mixed());
    // Inject a database constraint only in this isolated test database.
    await transactions.collection.createIndex(
      { operationId: 1, lineIndex: 1, type: 1 },
      {
        unique: true,
        partialFilterExpression: { operationId: { $type: "objectId" } },
      },
    );
    // A real unique-index violation occurs after the asset and stock updates.
    const op = await operations.findById(row._id);
    await transactions.create({
      partId,
      warehouseId,
      quantity: 1,
      type: "ISSUE",
      createdBy: actor.userId,
      operationId: op!._id,
      lineIndex: 1,
    });
    await expect(service.complete(row._id, actor)).rejects.toThrow();
    expect((await devices.findById(deviceIds[0]))?.usageStatus).toBe(
      "IN_STOCK",
    );
    expect((await balances.findOne({ partId }))?.quantity).toBe(5);
    expect((await operations.findById(row._id))?.status).toBe("PENDING");
  });
  it("allows only one concurrent completion and never produces negative stock", async () => {
    const row = await create(mixed());
    const results = await Promise.allSettled([
      service.complete(row._id, actor),
      service.complete(row._id, actor),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await balances.findOne({ partId }))?.quantity).toBe(3);
  });
  it("generates unique codes for concurrent creates and ignores manually supplied codes", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.create({ ...payload(), code: "MANUAL" }, actor),
      ),
    );
    expect(new Set(results.map((result) => result.data.code)).size).toBe(8);
    expect(results.every((result) => result.data.code !== "MANUAL")).toBe(true);
  });
  it("rejects empty lines, whitespace reason, missing department, invalid condition and duplicate devices", async () => {
    for (const input of [
      { ...payload(), lines: [] },
      { ...payload(), reason: "   " },
      { ...payload(), receiverDepartmentId: undefined },
      payload([{ ...payload().lines[0], handoverCondition: undefined }]),
      payload([...payload().lines, ...payload().lines]),
    ])
      await request(app.getHttpServer())
        .post("/api/operations")
        .send(input)
        .expect(400);
  });
  it("validates combined part quantities across lines", async () => {
    const line = {
      kind: "PART" as const,
      partId,
      quantity: 3,
      handoverCondition: "GOOD" as const,
    };
    await request(app.getHttpServer())
      .post("/api/operations")
      .send(payload([line, line]))
      .expect(409);
  });
  it("rejects inactive warehouse and wrong-warehouse devices", async () => {
    await request(app.getHttpServer())
      .post("/api/operations")
      .send({ ...payload(), sourceWarehouseId: String(new Types.ObjectId()) })
      .expect(400);
    await devices.updateOne(
      { _id: deviceIds[0] },
      { $set: { warehouseId: new Types.ObjectId() } },
    );
    await request(app.getHttpServer())
      .post("/api/operations")
      .send(payload())
      .expect(409);
  });
  it("prevents changing issue type and handles invalid/missing IDs", async () => {
    const row = await create();
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}`)
      .send({ ...payload(), type: "LOAN" })
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/operations/invalid")
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/operations/${new Types.ObjectId().toHexString()}/complete`)
      .expect(404);
  });
  it("supports existing DRAFT issues and migrates them on edit", async () => {
    const row = await create();
    await operations.updateOne({ _id: row._id }, { $set: { status: "DRAFT" } });
    await request(app.getHttpServer())
      .patch(`/api/operations/${row._id}`)
      .send(payload())
      .expect(200);
    expect((await operations.findById(row._id))?.status).toBe("PENDING");
  });
  it("records actual serials in completed issue and marks serial stock as issued", async () => {
    await serials.create([
      { partId, serial: "S1", warehouseId },
      { partId, serial: "S2", warehouseId },
    ]);
    const row = await create(mixed());
    await service.complete(row._id, actor);
    expect((await operations.findById(row._id))?.lines[1].serials).toEqual([
      "S1",
      "S2",
    ]);
    expect(await serials.countDocuments({ status: "ISSUED" })).toBe(2);
  });

  describe("Loans and partial returns", () => {
    const date = (days = 0) => {
      const value = new Date();
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    const loanPayload = (ids = [deviceIds[0]]): CreateOperationDto => ({
      type: "LOAN",
      operationDate: date(-5),
      dueDate: date(2),
      sourceWarehouseId: warehouseId,
      receiverKeeperId: keeperId,
      receiverDepartmentId: departmentId,
      reason: "Mượn đi công tác",
      note: "Ghi chú mượn",
      lines: ids.map((deviceId) => ({
        kind: "DEVICE",
        deviceId,
        quantity: 1,
        conditionOut: "GOOD",
        accessoryNote: "Sạc, túi",
        note: "Giao đủ phụ kiện",
      })),
    });
    const returnPayload = (ids = [deviceIds[0]], conditionIn = "GOOD") => ({
      returnedAt: date(),
      note: "Lần nhận lại",
      items: ids.map((deviceId) => ({
        deviceId,
        conditionIn,
        note: "Ghi chú trả",
      })),
    });
    const handover = (id: string) =>
      request(app.getHttpServer())
        .patch(`/api/operations/${id}/complete`)
        .expect(200);
    const returnTo = (id: string, input = returnPayload()) =>
      request(app.getHttpServer())
        .patch(`/api/operations/${id}/return`)
        .send(input);
    afterEach(async () => {
      await connection.db!.command({ collMod: "devices", validator: {} });
    });
    it("creates one device, auto department, immutable generated code, no destination and no stock lock", async () => {
      const row = await create({
        ...loanPayload(),
        receiverDepartmentId: undefined,
        code: "MANUAL",
      });
      expect(row.code).toMatch(/^LOAN-\d{8}-\d{3,}$/);
      expect(row.status).toBe("PENDING");
      const op = await operations.findById(row._id);
      expect(String(op?.receiverDepartmentId)).toBe(departmentId);
      expect(op?.destinationWarehouseId).toBeUndefined();
      expect(op?.lines[0].accessoryNote).toBe("Sạc, túi");
      expect((await devices.findById(deviceIds[0]))?.usageStatus).toBe(
        "IN_STOCK",
      );
    });
    it("edits the same pending loan to multiple devices and preserves its code", async () => {
      const row = await create(loanPayload());
      await request(app.getHttpServer())
        .patch(`/api/operations/${row._id}`)
        .send({ ...loanPayload(deviceIds), code: "REWRITE" })
        .expect(200);
      const op = await operations.findById(row._id);
      expect(op?.code).toBe(row.code);
      expect(op?.lines).toHaveLength(2);
      expect(await operations.countDocuments()).toBe(1);
    });
    it("deletes only a pending loan", async () => {
      const row = await create(loanPayload());
      await request(app.getHttpServer())
        .delete(`/api/operations/${row._id}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/operations/${row._id}`)
        .expect(404);
      expect((await devices.findById(deviceIds[0]))?.usageStatus).toBe(
        "IN_STOCK",
      );
    });
    it("hands over multiple devices, retains individual conditions/accessories and borrower metadata", async () => {
      const input = loanPayload(deviceIds);
      input.lines[1].conditionOut = "OTHER";
      input.lines[1].conditionOutDescription = "Màn hình ngả vàng";
      const row = await create(input);
      await handover(row._id);
      for (const id of deviceIds) {
        const device = await devices.findById(id);
        expect(device?.usageStatus).toBe("LENT");
        expect(String(device?.keeperId)).toBe(keeperId);
        expect(String(device?.loanId)).toBe(row._id);
        expect(device?.borrowedAt).toBeInstanceOf(Date);
        expect(device?.loanDueDate).toBeInstanceOf(Date);
      }
      const op = await operations.findById(row._id);
      expect(op?.status).toBe("ACTIVE");
      expect(op?.lines[1].conditionOut).toBe("OTHER");
      expect(op?.lines[1].conditionOutDescription).toBe("Màn hình ngả vàng");
      expect(op?.lines[1].accessoryNote).toBe("Sạc, túi");
    });
    it("refuses another loan after handover and identifies the unavailable asset", async () => {
      const first = await create(loanPayload());
      const second = await create(loanPayload());
      await handover(first._id);
      const result = await request(app.getHttpServer())
        .patch(`/api/operations/${second._id}/complete`)
        .expect(409);
      expect((result.body as { message: string }).message).toContain("TEST-D1");
      expect((await operations.findById(second._id))?.status).toBe("PENDING");
      await request(app.getHttpServer())
        .post("/api/operations")
        .send(loanPayload())
        .expect(409);
    });
    it("returns all devices and clears current borrower data without erasing dueDate", async () => {
      const row = await create(loanPayload(deviceIds));
      await handover(row._id);
      await returnTo(row._id, returnPayload(deviceIds)).expect(200);
      const op = await operations.findById(row._id);
      expect(op?.status).toBe("RETURNED");
      expect(op?.dueDate).toBeInstanceOf(Date);
      expect(op?.returnHistory).toHaveLength(1);
      expect(op?.returnHistory?.[0].items).toHaveLength(2);
      for (const id of deviceIds) {
        const device = await devices.findById(id);
        expect(device?.usageStatus).toBe("IN_STOCK");
        expect(device?.keeperId).toBeUndefined();
        expect(device?.loanId).toBeUndefined();
        expect(device?.loanDueDate).toBeUndefined();
        expect(String(device?.warehouseId)).toBe(warehouseId);
      }
    });
    it("returns three devices in three batches and preserves every return history entry", async () => {
      const third = await devices.create({ assetCode: "TEST-D3", warehouseId });
      const ids = [...deviceIds, String(third._id)];
      const row = await create(loanPayload(ids));
      await handover(row._id);
      for (let i = 0; i < ids.length; i++) {
        await returnTo(row._id, returnPayload([ids[i]])).expect(200);
        const op = await operations.findById(row._id);
        expect(op?.status).toBe(i === 2 ? "RETURNED" : "PARTIALLY_RETURNED");
        expect(op?.returnHistory).toHaveLength(i + 1);
        expect(op?.lines.filter((line) => line.returned)).toHaveLength(i + 1);
      }
    });
    it.each([
      ["BROKEN", "REPAIRING"],
      ["LOST", "LOST"],
      ["MISSING_ACCESSORIES", "REPAIRING"],
      ["SCRATCHED", "IN_STOCK"],
      ["NORMAL", "IN_STOCK"],
    ])(
      "returns %s as %s and records its condition",
      async (condition, expected) => {
        const row = await create(loanPayload());
        await handover(row._id);
        await returnTo(row._id, returnPayload(undefined, condition)).expect(
          200,
        );
        expect((await devices.findById(deviceIds[0]))?.usageStatus).toBe(
          expected,
        );
        const op = await operations.findById(row._id);
        expect(op?.lines[0].conditionIn).toBe(condition);
        expect(op?.lines[0].returnReceivedBy).toEqual(actor.userId);
        expect(op?.lines[0].returnNote).toBe("Ghi chú trả");
        if (expected !== "IN_STOCK")
          await request(app.getHttpServer())
            .post("/api/operations")
            .send(loanPayload())
            .expect(409);
      },
    );
    it("requires an explanation for OTHER and notes for missing/lost items", async () => {
      const input = loanPayload();
      input.lines[0].conditionOut = "OTHER";
      await request(app.getHttpServer())
        .post("/api/operations")
        .send(input)
        .expect(400);
      const row = await create(loanPayload());
      await handover(row._id);
      for (const conditionIn of ["OTHER", "LOST", "MISSING_ACCESSORIES"])
        await returnTo(row._id, {
          returnedAt: date(),
          note: "",
          items: [{ deviceId: deviceIds[0], conditionIn, note: "" }],
        }).expect(400);
    });
    it("derives overdue from date and remaining devices, retaining partial status", async () => {
      const row = await create({
        ...loanPayload(deviceIds),
        dueDate: date(-2),
      });
      await handover(row._id);
      await returnTo(row._id).expect(200);
      const detail = await request(app.getHttpServer())
        .get(`/api/operations/${row._id}`)
        .expect(200);
      expect(
        (
          detail.body as {
            data: {
              overdueDays: number;
              status: string;
              returnedCount: number;
              remainingCount: number;
            };
          }
        ).data,
      ).toMatchObject({
        overdueDays: 2,
        status: "PARTIALLY_RETURNED",
        returnedCount: 1,
        remainingCount: 1,
      });
      await returnTo(row._id, returnPayload([deviceIds[1]])).expect(200);
      const last = await request(app.getHttpServer())
        .get(`/api/operations/${row._id}`)
        .expect(200);
      expect(
        (last.body as { data: { overdueDays: number } }).data.overdueDays,
      ).toBe(0);
    });
    it("does not mark today's due date overdue", async () => {
      const row = await create({ ...loanPayload(), dueDate: date() });
      await handover(row._id);
      const detail = await request(app.getHttpServer())
        .get(`/api/operations/${row._id}`)
        .expect(200);
      expect(
        (detail.body as { data: { overdueDays: number } }).data.overdueDays,
      ).toBe(0);
    });
    it("blocks editing/deleting/re-delivering after handover and after partial/full return", async () => {
      const row = await create(loanPayload(deviceIds));
      await handover(row._id);
      for (const next of [null, deviceIds[0], deviceIds[1]]) {
        if (next) await returnTo(row._id, returnPayload([next])).expect(200);
        await request(app.getHttpServer())
          .patch(`/api/operations/${row._id}`)
          .send(loanPayload())
          .expect(409);
        await request(app.getHttpServer())
          .delete(`/api/operations/${row._id}`)
          .expect(409);
        await request(app.getHttpServer())
          .patch(`/api/operations/${row._id}/complete`)
          .expect(409);
      }
    });
    it("rejects duplicate, foreign, already returned devices and pending returns", async () => {
      const row = await create(loanPayload());
      await returnTo(row._id).expect(409);
      await handover(row._id);
      await returnTo(
        row._id,
        returnPayload([deviceIds[0], deviceIds[0]]),
      ).expect(400);
      await returnTo(row._id, returnPayload([deviceIds[1]])).expect(409);
      await returnTo(row._id).expect(200);
      await returnTo(row._id).expect(409);
      expect((await operations.findById(row._id))?.returnHistory).toHaveLength(
        1,
      );
    });
    it("validates dates, required fields, empty/duplicate devices and rejects loan destination/parts", async () => {
      for (const input of [
        { ...loanPayload(), dueDate: date(-6) },
        { ...loanPayload(), lines: [] },
        { ...loanPayload(), reason: "  " },
        { ...loanPayload(), receiverKeeperId: undefined },
        { ...loanPayload(), destinationWarehouseId: warehouseId },
        loanPayload([deviceIds[0], deviceIds[0]]),
        {
          ...loanPayload(),
          lines: [{ kind: "PART", partId, quantity: 1, conditionOut: "GOOD" }],
        },
      ])
        await request(app.getHttpServer())
          .post("/api/operations")
          .send(input)
          .expect(400);
      const row = await create(loanPayload());
      await handover(row._id);
      for (const returnedAt of [date(-6), date(1)])
        await returnTo(row._id, { ...returnPayload(), returnedAt }).expect(400);
      await returnTo(row._id, { ...returnPayload(), items: [] }).expect(400);
    });
    it("rejects unavailable, lost and physically broken devices", async () => {
      for (const usageStatus of [
        "LENT",
        "IN_USE",
        "REPAIRING",
        "DISPOSED",
        "LOST",
      ]) {
        await devices.updateOne(
          { _id: deviceIds[0] },
          { $set: { usageStatus } },
        );
        await request(app.getHttpServer())
          .post("/api/operations")
          .send(loanPayload())
          .expect(409);
      }
      await devices.updateOne(
        { _id: deviceIds[0] },
        { $set: { usageStatus: "IN_STOCK", techCondition: "BROKEN" } },
      );
      await request(app.getHttpServer())
        .post("/api/operations")
        .send(loanPayload())
        .expect(409);
    });
    it("rolls back earlier device writes if the second handover write fails at the database", async () => {
      const row = await create(loanPayload(deviceIds));
      await connection.db!.command({
        collMod: "devices",
        validator: {
          $or: [
            { assetCode: { $ne: "TEST-D2" } },
            { usageStatus: { $ne: "LENT" } },
          ],
        },
      });
      await expect(service.complete(row._id, actor)).rejects.toThrow();
      expect(await devices.countDocuments({ usageStatus: "LENT" })).toBe(0);
      expect((await operations.findById(row._id))?.status).toBe("PENDING");
    });
    it("rolls back earlier returns and history when the second return write fails", async () => {
      const row = await create(loanPayload(deviceIds));
      await handover(row._id);
      await connection.db!.command({
        collMod: "devices",
        validator: {
          $or: [
            { assetCode: { $ne: "TEST-D2" } },
            { usageStatus: { $ne: "IN_STOCK" } },
          ],
        },
      });
      await expect(
        service.returnDevices(row._id, returnPayload(deviceIds), actor),
      ).rejects.toThrow();
      expect(await devices.countDocuments({ usageStatus: "LENT" })).toBe(2);
      const op = await operations.findById(row._id);
      expect(op?.status).toBe("ACTIVE");
      expect(op?.returnHistory?.length ?? 0).toBe(0);
      expect(op?.lines.some((line) => line.returned)).toBe(false);
    });
    it("handles concurrent handover and return exactly once", async () => {
      const row = await create(loanPayload());
      const complete = await Promise.allSettled([
        service.complete(row._id, actor),
        service.complete(row._id, actor),
      ]);
      expect(
        complete.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const returns = await Promise.allSettled([
        service.returnDevices(row._id, returnPayload(), actor),
        service.returnDevices(row._id, returnPayload(), actor),
      ]);
      expect(
        returns.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect((await operations.findById(row._id))?.returnHistory).toHaveLength(
        1,
      );
    });
    it("generates unique codes under concurrent creation and honors idempotency replay", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => service.create(loanPayload(), actor)),
      );
      expect(new Set(results.map((result) => result.data.code)).size).toBe(6);
      const key = `LOAN-TEST-${new Types.ObjectId().toHexString()}`;
      const row = await service.create(loanPayload(), actor, key);
      await service.complete(String(row.data._id), actor);
      const replay = await service.create(loanPayload(), actor, key);
      expect(String(replay.data._id)).toBe(String(row.data._id));
    });
    it("searches returnable loans by borrower, department, asset and serial and reloads complete history", async () => {
      await devices.updateOne(
        { _id: deviceIds[0] },
        { $set: { serial: "SEARCH-SERIAL" } },
      );
      const row = await create(loanPayload(deviceIds));
      await handover(row._id);
      await returnTo(row._id).expect(200);
      for (const q of [
        row.code,
        "Người nhận kiểm thử",
        "Bộ phận kiểm thử",
        "TEST-D1",
        "SEARCH-SERIAL",
      ]) {
        const result = await request(app.getHttpServer())
          .get("/api/operations")
          .query({ type: "LOAN", returnable: "true", q })
          .expect(200);
        expect(
          (result.body as { data: { _id: string }[] }).data.map(
            (item) => item._id,
          ),
        ).toContain(row._id);
      }
      const detail = await request(app.getHttpServer())
        .get(`/api/operations/${row._id}`)
        .expect(200);
      expect(
        (detail.body as { data: { returnHistory: unknown[] } }).data
          .returnHistory,
      ).toHaveLength(1);
    });
    it("keeps legacy receive endpoint safe by requiring return conditions", async () => {
      const row = await create(loanPayload());
      await handover(row._id);
      await request(app.getHttpServer())
        .patch(`/api/operations/${row._id}/receive`)
        .send({ deviceIds: [deviceIds[0]] })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/api/operations/${row._id}/receive`)
        .send(returnPayload())
        .expect(200);
    });
    it("supports legacy drafts and returns to the original location instead of a destination warehouse", async () => {
      const location = await connection
        .model<Location>(Location.name)
        .create({ code: "RETURN-LOCATION", name: "Kệ ban đầu", warehouseId });
      await devices.updateOne(
        { _id: deviceIds[0] },
        { $set: { locationId: location._id } },
      );
      const row = await create(loanPayload());
      await operations.updateOne(
        { _id: row._id },
        {
          $set: {
            status: "DRAFT",
            destinationWarehouseId: new Types.ObjectId(),
          },
        },
      );
      await handover(row._id);
      await returnTo(row._id).expect(200);
      expect(String((await devices.findById(deviceIds[0]))?.locationId)).toBe(
        String(location._id),
      );
    });
  });

  describe("Warehouse detail read APIs", () => {
    type HistoryRow = {
      _id: string;
      type: string;
      time: string;
      quantityIn: number;
      quantityOut: number;
      balanceAfter: number | null;
      balanceStatus: string;
      referenceState: string;
      document?: { id: string; code: string };
      object: { kind: string; code: string; name: string };
      actor?: { displayName: string };
    };
    const history = async (
      query: Record<string, string> = {},
      id = warehouseId,
    ) => {
      const response = await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${id}/history`)
        .query(query)
        .expect(200);
      return response.body as {
        data: HistoryRow[];
        meta: { total: number; totalPages: number };
      };
    };
    beforeEach(async () => {
      await parts.deleteMany({ _id: { $ne: new Types.ObjectId(partId) } });
      await parts.updateOne({ _id: partId }, { $set: { minQty: 0 } });
      await connection.model(InboundReceipt.name).deleteMany({});
    });
    it("returns accurate warehouse information and custody summaries", async () => {
      await devices.updateOne(
        { _id: deviceIds[0] },
        { $set: { usageStatus: "LENT", keeperId } },
      );
      await devices.updateOne(
        { _id: deviceIds[1] },
        { $set: { usageStatus: "IN_USE", keeperId } },
      );
      await devices.create({
        assetCode: "BROKEN-IN-STOCK",
        warehouseId,
        techCondition: "BROKEN",
      });
      const response = await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${warehouseId}`)
        .expect(200);
      const result = response.body as {
        data: {
          warehouse: { code: string };
          devices: {
            total: number;
            available: number;
            lent: number;
            inUse: number;
          };
          parts: { types: number };
        };
      };
      expect(result.data.warehouse.code).toBe("TEST-WH");
      expect(result.data.devices).toMatchObject({
        total: 3,
        available: 0,
        lent: 1,
        inUse: 1,
      });
      expect(result.data.parts.types).toBe(1);
    });
    it("filters managed devices by model name, serial, type and usage, and includes the current keeper", async () => {
      const model = await connection.model<ItemModel>(ItemModel.name).create({
        code: "WAREHOUSE-MODEL",
        name: "Laptop tìm kiếm",
        manufacturer: "Hãng kiểm thử",
      });
      const typeId = new Types.ObjectId();
      await devices.updateOne(
        { _id: deviceIds[0] },
        {
          $set: {
            modelId: model._id,
            deviceTypeId: typeId,
            serial: "WAREHOUSE-SERIAL",
            usageStatus: "LENT",
            keeperId,
          },
        },
      );
      const response = await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${warehouseId}/devices`)
        .query({
          q: "Laptop tìm kiếm",
          status: "LENT",
          deviceTypeId: String(typeId),
        })
        .expect(200);
      const result = response.body as {
        data: {
          _id: string;
          serial: string;
          keeper: { displayName: string };
          model: { manufacturer: string };
        }[];
      };
      expect(result.data).toHaveLength(1);
      expect(result.data[0].serial).toBe("WAREHOUSE-SERIAL");
      expect(result.data[0].keeper.displayName).toBe("Người nhận kiểm thử");
      expect(result.data[0].model.manufacturer).toBe("Hãng kiểm thử");
      const other = await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${warehouseId}/devices`)
        .query({ status: "AVAILABLE" })
        .expect(200);
      expect((other.body as { data: unknown[] }).data).toHaveLength(1);
    });
    it("paginates devices on the server without including another warehouse", async () => {
      await devices.create(
        Array.from({ length: 23 }, (_, index) => ({
          assetCode: `PAGE-DEVICE-${index}`,
          warehouseId,
        })),
      );
      await devices.create({
        assetCode: "FOREIGN-DEVICE",
        warehouseId: new Types.ObjectId(),
      });
      const response = await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${warehouseId}/devices`)
        .query({ page: "2", limit: "20" })
        .expect(200);
      const result = response.body as {
        data: unknown[];
        meta: { total: number; totalPages: number };
      };
      expect(result.data).toHaveLength(5);
      expect(result.meta).toMatchObject({ total: 25, totalPages: 2 });
    });
    it("classifies out/low/available stock at the exact minimum threshold", async () => {
      await parts.updateOne({ _id: partId }, { $set: { minQty: 5 } });
      for (const [quantity, status] of [
        [0, "OUT"],
        [5, "LOW"],
        [6, "AVAILABLE"],
      ] as const) {
        await balances.updateOne({ partId }, { $set: { quantity } });
        const response = await request(app.getHttpServer())
          .get(`/api/inventory/warehouses/${warehouseId}/parts`)
          .query({ status, q: "RAM" })
          .expect(200);
        const result = response.body as {
          data: { quantity: number; stockStatus: string }[];
        };
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toMatchObject({ quantity, stockStatus: status });
      }
    });
    it("paginates part balances and counts real low/out stock in summaries", async () => {
      const unit = await connection.model<Unit>(Unit.name).findOne();
      const extra = await parts.create(
        Array.from({ length: 21 }, (_, index) => ({
          code: `PAGE-PART-${index}`,
          name: `Part ${index}`,
          trackingMode: "QUANTITY",
          unitId: unit!._id,
          minQty: 2,
        })),
      );
      await balances.create(
        extra.map((part, index) => ({
          partId: part._id,
          warehouseId,
          quantity: index === 0 ? 0 : 2,
        })),
      );
      const response = await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${warehouseId}/parts`)
        .query({ page: "2", limit: "20" })
        .expect(200);
      expect((response.body as { data: unknown[] }).data).toHaveLength(2);
      const summary = await warehouseView.summary(warehouseId);
      expect(summary.data.parts).toMatchObject({ types: 22, out: 1, low: 20 });
    });
    it("shows real receipt/issue references and reconciled balances after each part transaction", async () => {
      const receipt = await connection
        .model<InboundReceipt>(InboundReceipt.name)
        .create({
          code: "WAREHOUSE-RECEIPT",
          warehouseId,
          receiptDate: new Date(),
          source: "OPENING",
          status: "COMPLETED",
          createdBy: actor.userId,
          completedBy: actor.userId,
          completedAt: new Date(Date.now() - 60000),
          lines: [{ type: "PART", quantity: 5, part: { partId, serials: [] } }],
        });
      await transactions.create({
        partId,
        warehouseId,
        quantity: 5,
        type: "OPENING",
        receiptId: receipt._id,
        createdBy: actor.userId,
        createdAt: new Date(Date.now() - 60000),
      });
      const issue = await create(mixed());
      await service.complete(issue._id, actor);
      const result = await history();
      const partRows = result.data.filter((row) => row.object.kind === "PART");
      expect(partRows.find((row) => row.type === "ISSUE")).toMatchObject({
        document: { code: issue.code },
        quantityOut: 2,
        balanceAfter: 3,
        referenceState: "LINKED",
        actor: { displayName: actor.displayName },
      });
      expect(partRows.find((row) => row.type === "OPENING")).toMatchObject({
        document: { code: receipt.code },
        quantityIn: 5,
        balanceAfter: 5,
      });
      expect(
        result.data.find((row) => row.object.kind === "DEVICE"),
      ).toMatchObject({
        type: "ISSUE",
        quantityOut: 1,
        balanceAfter: null,
        balanceStatus: "NOT_APPLICABLE",
      });
      expect((await history({ partId })).data).toHaveLength(2);
      expect((await history({ q: issue.code })).data).toHaveLength(2);
    });
    it("does not invent balances or hide broken document references", async () => {
      await transactions.create({
        partId,
        warehouseId,
        quantity: 1,
        type: "ISSUE",
        operationId: new Types.ObjectId(),
        createdBy: actor.userId,
        note: "ISSUE missing",
      });
      const result = await history();
      expect(result.data[0]).toMatchObject({
        balanceAfter: null,
        balanceStatus: "UNKNOWN",
        referenceState: "MISSING",
      });
    });
    it("keeps manual adjustments without a document and handles negative adjustments", async () => {
      await transactions.create([
        {
          partId,
          warehouseId,
          quantity: 7,
          type: "OPENING",
          createdBy: actor.userId,
          createdAt: new Date(Date.now() - 60000),
        },
        {
          partId,
          warehouseId,
          quantity: -2,
          type: "ADJUSTMENT",
          createdBy: actor.userId,
        },
      ]);
      const result = await history({ type: "ADJUSTMENT_OUT" });
      expect(result.data[0]).toMatchObject({
        type: "ADJUSTMENT_OUT",
        quantityIn: 0,
        quantityOut: 2,
        balanceAfter: 5,
        referenceState: "NONE",
      });
    });
    it("shows separate loan and return events including the actual return recipient", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const loan = await create({
        type: "LOAN",
        operationDate: today,
        dueDate: today,
        sourceWarehouseId: warehouseId,
        receiverKeeperId: keeperId,
        receiverDepartmentId: departmentId,
        reason: "Warehouse loan history",
        lines: [
          {
            kind: "DEVICE",
            deviceId: deviceIds[0],
            quantity: 1,
            conditionOut: "GOOD",
          },
        ],
      });
      await service.complete(loan._id, actor);
      await service.returnDevices(
        loan._id,
        {
          returnedAt: today,
          items: [{ deviceId: deviceIds[0], conditionIn: "GOOD" }],
        },
        actor,
      );
      const result = await history({ q: loan.code });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        type: "RETURN",
        quantityIn: 1,
        actor: { displayName: actor.displayName },
      });
      expect(result.data[1]).toMatchObject({ type: "LOAN", quantityOut: 1 });
    });
    it("distinguishes transfer out from transfer in between warehouses", async () => {
      const destination = await connection
        .model<Warehouse>(Warehouse.name)
        .create({ code: "HISTORY-DEST", name: "Kho đích" });
      const transfer = await create({
        type: "TRANSFER",
        code: "TRANSFER-HISTORY",
        operationDate: new Date().toISOString(),
        sourceWarehouseId: warehouseId,
        destinationWarehouseId: String(destination._id),
        reason: "Điều chuyển kiểm thử",
        lines: [
          {
            kind: "DEVICE",
            deviceId: deviceIds[0],
            quantity: 1,
            handoverCondition: "GOOD",
          },
        ],
      });
      await service.complete(transfer._id, actor);
      await service.receive(transfer._id, {}, actor);
      expect((await history()).data[0]).toMatchObject({
        type: "TRANSFER_OUT",
        quantityOut: 1,
      });
      expect(
        (await history({}, String(destination._id))).data[0],
      ).toMatchObject({ type: "TRANSFER_IN", quantityIn: 1 });
    });
    it("lists device receipts and reversals without double-counting part receipt rows", async () => {
      await connection.model<InboundReceipt>(InboundReceipt.name).create({
        code: "DEVICE-HISTORY",
        warehouseId,
        receiptDate: new Date(),
        source: "PURCHASE",
        status: "REVERSED",
        createdBy: actor.userId,
        completedBy: actor.userId,
        completedAt: new Date(Date.now() - 60000),
        reversedAt: new Date(),
        reversedBy: actor.userId,
        lines: [
          {
            type: "DEVICE",
            quantity: 1,
            device: {
              deviceId: deviceIds[0],
              assetCode: "TEST-D1",
              techCondition: "GOOD",
            },
          },
        ],
      });
      const result = await history();
      expect(result.data).toHaveLength(2);
      expect(result.data.map((row) => row.type)).toEqual([
        "ADJUSTMENT_OUT",
        "RECEIPT",
      ]);
    });
    it("filters dates/types and paginates newest-first without mutating any balances", async () => {
      await transactions.create(
        Array.from({ length: 25 }, (_, index) => ({
          partId,
          warehouseId,
          type: "ADJUSTMENT",
          quantity: 1,
          createdBy: actor.userId,
          createdAt: new Date(Date.now() - index * 60000),
        })),
      );
      const before = await balances.findOne({ partId }).lean();
      const result = await history({
        limit: "10",
        page: "2",
        type: "ADJUSTMENT_IN",
      });
      expect(result.data).toHaveLength(10);
      expect(result.meta.total).toBe(25);
      expect(new Date(result.data[0].time).getTime()).toBeGreaterThan(
        new Date(result.data[9].time).getTime(),
      );
      expect((await history({ to: "2000-01-01" })).data).toHaveLength(0);
      expect(await balances.findOne({ partId }).lean()).toEqual(before);
      expect(await transactions.countDocuments()).toBe(25);
      expect(await operations.countDocuments()).toBe(0);
    });
    it("validates IDs, invalid date ranges and missing warehouses", async () => {
      await request(app.getHttpServer())
        .get("/api/inventory/warehouses/not-an-id")
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${new Types.ObjectId().toHexString()}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/inventory/warehouses/${warehouseId}/history`)
        .query({ from: "2026-09-10", to: "2026-09-01" })
        .expect(400);
    });
  });
});
