import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, Model, Types } from "mongoose";
import type { CurrentActor } from "../auth/auth.types";
import { AuditLog } from "../auth/auth.schemas";
import { DeviceType, Keeper } from "../catalog/catalog.schemas";
import { Device, Part } from "../equipment/equipment.schemas";
import { Department, User } from "../identity/identity.schemas";
import {
  InventoryBalance,
  InventoryTransaction,
} from "../inventory/inventory.schemas";
import { InventoryCountDocument } from "../inventory-counts/inventory-count.schemas";
import { LiquidationDocument } from "../liquidations/liquidation.schemas";
import { OperationDocument } from "../operations/operation.schemas";
import { LOAN_OPEN_STATUSES, loanDay } from "../operations/loan.constants";
import { PurchaseRequest } from "../purchases/purchase.schemas";
import { InboundReceipt } from "../receipts/receipt.schemas";
import { RepairDocument } from "../repairs/repairs.schemas";

type RangeKey = "30d" | "3m" | "6m" | "12m";
type Filter = Record<string, unknown>;

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "đăng nhập hệ thống",
  USER_CREATED: "tạo tài khoản",
  USER_UPDATED: "cập nhật tài khoản",
  RECEIPT_CREATED: "tạo phiếu nhập kho",
  RECEIPT_COMPLETED: "hoàn tất phiếu nhập kho",
  OPERATION_CREATED: "tạo phiếu nghiệp vụ",
  OPERATION_COMPLETED: "hoàn tất phiếu nghiệp vụ",
  LOAN_CREATED: "tạo phiếu mượn",
  LOAN_DISPATCHED: "bàn giao thiết bị mượn",
  LOAN_RETURNED: "ghi nhận trả thiết bị",
  REPAIR_CREATED: "tạo phiếu sửa chữa",
  REPAIR_COMPLETED: "hoàn tất sửa chữa",
  LIQUIDATION_CREATED: "tạo phiếu thanh lý",
  LIQUIDATION_COMPLETED: "hoàn tất thanh lý",
  INVENTORY_CREATED: "tạo phiếu kiểm kê",
  INVENTORY_STARTED: "bắt đầu kiểm kê",
  INVENTORY_COMPLETED: "hoàn tất kiểm kê",
};

function has(actor: CurrentActor, ...permissions: string[]) {
  return permissions.some((permission) =>
    actor.permissions.includes(
      permission as CurrentActor["permissions"][number],
    ),
  );
}

function objectIds(values: string[]) {
  return values
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

/** Build an OR of the actor's assignment scopes. Empty result intentionally matches nothing. */
export function scopedFilter(
  actor: CurrentActor,
  warehouseField: string,
  departmentField: string,
): Filter {
  if (actor.roleCodes.includes("SYSTEM_ADMIN")) return {};
  const clauses: Filter[] = [];
  for (const scope of actor.scopes) {
    const clause: Filter = {};
    let usable = false;
    if (scope.warehouseMode === "ALL_WAREHOUSES") {
      usable = true;
    } else if (scope.warehouseMode === "ASSIGNED_WAREHOUSES") {
      const ids = objectIds(scope.warehouseIds);
      if (ids.length) {
        clause[warehouseField] = { $in: ids };
        usable = true;
      }
    }
    if (scope.departmentMode === "ALL_DEPARTMENTS") {
      usable = true;
    } else {
      const ids = objectIds([
        ...scope.departmentIds,
        ...(scope.departmentMode === "OWN_DEPARTMENT" &&
        actor.primaryDepartmentId
          ? [actor.primaryDepartmentId]
          : []),
      ]);
      if (ids.length) {
        clause[departmentField] = { $in: ids };
        usable = true;
      }
    }
    if (usable) clauses.push(clause);
  }
  if (!clauses.length) return { _id: { $exists: false } };
  if (clauses.some((clause) => Object.keys(clause).length === 0)) return {};
  return { $or: clauses };
}

function departmentScope(actor: CurrentActor, field: string): Filter {
  if (
    actor.roleCodes.includes("SYSTEM_ADMIN") ||
    actor.scopes.some((scope) => scope.departmentMode === "ALL_DEPARTMENTS")
  )
    return {};
  const ids = objectIds([
    ...actor.scopes.flatMap((scope) => scope.departmentIds),
    ...(actor.primaryDepartmentId ? [actor.primaryDepartmentId] : []),
  ]);
  return ids.length ? { [field]: { $in: ids } } : { _id: { $exists: false } };
}

function rangeConfig(value?: string) {
  const range: RangeKey = ["30d", "3m", "6m", "12m"].includes(value ?? "")
    ? (value as RangeKey)
    : "30d";
  const now = new Date();
  const start = new Date(now);
  if (range === "30d") start.setDate(start.getDate() - 29);
  else start.setMonth(start.getMonth() - Number(range.slice(0, -1)) + 1, 1);
  start.setHours(0, 0, 0, 0);
  return { range, start, now, daily: range === "30d" };
}

export function bucketKeys(start: Date, now: Date, daily: boolean) {
  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor <= now) {
    result.push(
      daily
        ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
        : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    if (daily) cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return result;
}

export function dashboardLoanAttention(
  due: Date | undefined,
  today: Date,
  dueSoon: Date,
) {
  if (!due) return "ACTIVE" as const;
  if (due < today) return "OVERDUE" as const;
  if (due <= dueSoon) return "DUE_SOON" as const;
  return "ACTIVE" as const;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Part.name) private readonly parts: Model<Part>,
    @InjectModel(DeviceType.name)
    private readonly deviceTypes: Model<DeviceType>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(Keeper.name) private readonly keepers: Model<Keeper>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
    @InjectModel(OperationDocument.name)
    private readonly operations: Model<OperationDocument>,
    @InjectModel(RepairDocument.name)
    private readonly repairs: Model<RepairDocument>,
    @InjectModel(InboundReceipt.name)
    private readonly receipts: Model<InboundReceipt>,
    @InjectModel(PurchaseRequest.name)
    private readonly purchases: Model<PurchaseRequest>,
    @InjectModel(LiquidationDocument.name)
    private readonly liquidations: Model<LiquidationDocument>,
    @InjectModel(InventoryCountDocument.name)
    private readonly counts: Model<InventoryCountDocument>,
    @InjectModel(AuditLog.name) private readonly auditLogs: Model<AuditLog>,
    @InjectConnection() private readonly connection: Connection,
  ) {
    // Keep these registrations explicit: they also document every collection
    // participating in the aggregate endpoint.
    void this.parts;
    void this.deviceTypes;
    void this.departments;
    void this.keepers;
    void this.users;
  }

  async summary(actor: CurrentActor) {
    const canDevices = has(actor, "devices.read");
    const canParts = has(actor, "parts.read");
    const canOperations = has(actor, "operations.read");
    const canRepairs = has(actor, "repair.view");
    const canReceipts = has(actor, "receipts.read");
    const canPurchases = has(actor, "purchases.read");
    const canLiquidations = has(actor, "liquidation.view");
    const canInventory = has(actor, "inventory.view");
    const deviceScope = scopedFilter(actor, "warehouseId", "departmentId");
    const operationScope = scopedFilter(
      actor,
      "sourceWarehouseId",
      "receiverDepartmentId",
    );
    const actualNow = new Date();
    const loanToday = new Date(`${loanDay(actualNow)}T00:00:00+07:00`);
    const dueSoon = new Date(loanToday);
    dueSoon.setDate(dueSoon.getDate() + 7);
    const repairScope = scopedFilter(
      actor,
      "fromWarehouseId",
      "fromDepartmentId",
    );
    const transactionScope = this.transactionScope(actor);
    const countScope = scopedFilter(actor, "warehouseId", "departmentId");
    const liquidationScope = scopedFilter(
      actor,
      "warehouseId",
      "requestedDepartmentId",
    );

    const [
      assets,
      deviceStatus,
      deviceTypes,
      departments,
      alerts,
      loans,
      repairs,
      activities,
    ] = await Promise.all([
      this.assetKpis(
        canDevices,
        canParts,
        canRepairs,
        deviceScope,
        repairScope,
        transactionScope,
      ),
      canDevices ? this.deviceStatus(deviceScope) : Promise.resolve(undefined),
      canDevices
        ? this.deviceTypeDistribution(deviceScope)
        : Promise.resolve(undefined),
      canDevices
        ? this.departmentDistribution(deviceScope)
        : Promise.resolve(undefined),
      this.alerts(actor, {
        actualNow,
        loanToday,
        dueSoon,
        operationScope,
        repairScope,
        transactionScope,
        countScope,
        liquidationScope,
        purchaseScope: departmentScope(actor, "requestDepartmentId"),
      }),
      canOperations
        ? this.attentionLoans(operationScope, loanToday, dueSoon)
        : Promise.resolve(undefined),
      canRepairs
        ? this.attentionRepairs(repairScope, actualNow)
        : Promise.resolve(undefined),
      this.recentActivities(actor),
    ]);

    const admin =
      actor.roleCodes.includes("SYSTEM_ADMIN") || has(actor, "users.manage");
    return {
      data: {
        generatedAt: new Date().toISOString(),
        permissions: {
          devices: canDevices,
          parts: canParts,
          operations: canOperations,
          repairs: canRepairs,
          receipts: canReceipts,
          purchases: canPurchases,
          liquidations: canLiquidations,
          inventory: canInventory,
        },
        assets,
        deviceStatus,
        deviceTypes,
        departments,
        alerts,
        loans,
        repairs,
        recentActivities: activities,
        system: admin
          ? {
              api: "ok",
              database:
                Number(this.connection.readyState) === 1
                  ? "connected"
                  : "disconnected",
              uptime: Math.round(process.uptime()),
            }
          : undefined,
      },
    };
  }

  async inventoryTrend(actor: CurrentActor, value?: string) {
    if (!has(actor, "parts.read", "reports.read")) {
      return {
        data: { available: false, range: rangeConfig(value).range, points: [] },
      };
    }
    const { range, start, now, daily } = rangeConfig(value);
    const scope = scopedFilter(actor, "warehouseId", "departmentId");
    // Transactions have no department; retain only the warehouse part of scope.
    const warehouseScope = this.transactionScope(actor);
    const rows = await this.transactions.aggregate<{
      _id: string;
      inbound: number;
      outbound: number;
      returned: number;
    }>([
      { $match: { createdAt: { $gte: start }, ...warehouseScope } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: daily ? "%Y-%m-%d" : "%Y-%m",
              date: "$createdAt",
              timezone: "Asia/Ho_Chi_Minh",
            },
          },
          inbound: {
            $sum: {
              $cond: [
                { $in: ["$type", ["OPENING", "PURCHASE", "TRANSFER_IN"]] },
                "$quantity",
                0,
              ],
            },
          },
          outbound: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$type",
                    ["ISSUE", "TRANSFER_OUT", "DISPOSAL", "LIQUIDATION"],
                  ],
                },
                "$quantity",
                0,
              ],
            },
          },
          returned: {
            $sum: { $cond: [{ $eq: ["$type", "RETURN"] }, "$quantity", 0] },
          },
        },
      },
    ]);
    void scope;
    const byKey = new Map(rows.map((row) => [row._id, row]));
    return {
      data: {
        available: true,
        range,
        points: bucketKeys(start, now, daily).map((key) => ({
          key,
          inbound: byKey.get(key)?.inbound ?? 0,
          outbound: byKey.get(key)?.outbound ?? 0,
          returned: byKey.get(key)?.returned ?? 0,
        })),
      },
    };
  }

  private transactionScope(actor: CurrentActor): Filter {
    if (actor.roleCodes.includes("SYSTEM_ADMIN")) return {};
    if (actor.scopes.some((scope) => scope.warehouseMode === "ALL_WAREHOUSES"))
      return {};
    const ids = objectIds(actor.scopes.flatMap((scope) => scope.warehouseIds));
    return ids.length
      ? { warehouseId: { $in: ids } }
      : { _id: { $exists: false } };
  }

  private async assetKpis(
    canDevices: boolean,
    canParts: boolean,
    canRepairs: boolean,
    deviceScope: Filter,
    repairScope: Filter,
    transactionScope: Filter,
  ) {
    const active = {
      isActive: true,
      usageStatus: { $ne: "DISPOSED" },
      ...deviceScope,
    };
    const [total, inUse, inStock, repairingDevices, partRows, activeRepairs] =
      await Promise.all([
        canDevices ? this.devices.countDocuments(active) : undefined,
        canDevices
          ? this.devices.countDocuments({
              ...active,
              usageStatus: { $in: ["IN_USE", "LENT"] },
            })
          : undefined,
        canDevices
          ? this.devices.countDocuments({ ...active, usageStatus: "IN_STOCK" })
          : undefined,
        canDevices
          ? this.devices.countDocuments({ ...active, usageStatus: "REPAIRING" })
          : undefined,
        canParts
          ? this.balances.aggregate<{ total: number }>([
              { $match: transactionScope },
              { $group: { _id: null, total: { $sum: "$quantity" } } },
            ])
          : [],
        canRepairs
          ? this.repairs.countDocuments({
              status: { $in: ["RECEIVED", "REPAIRING"] },
              ...repairScope,
            })
          : undefined,
      ]);
    return {
      totalDevices: total,
      inUseDevices: inUse,
      inStockDevices: inStock,
      partStock: canParts ? (partRows[0]?.total ?? 0) : undefined,
      repairing: canRepairs ? activeRepairs : repairingDevices,
    };
  }

  private async deviceStatus(scope: Filter) {
    const rows = await this.devices.aggregate<{ _id: string; count: number }>([
      { $match: { isActive: true, ...scope } },
      { $group: { _id: "$usageStatus", count: { $sum: 1 } } },
    ]);
    const counts = new Map(rows.map((row) => [row._id, row.count]));
    const separateStatuses = new Set([
      "IN_STOCK",
      "IN_USE",
      "LENT",
      "IN_TRANSIT",
      "REPAIRING",
      "DISPOSED",
    ]);
    const other = rows
      .filter((row) => !separateStatuses.has(row._id))
      .reduce((sum, row) => sum + row.count, 0);
    const definitions = [
      ["IN_STOCK", "Trong kho"],
      ["IN_USE", "Đã cấp phát"],
      ["LENT", "Đang cho mượn"],
      ["IN_TRANSIT", "Đang điều chuyển"],
      ["REPAIRING", "Đang sửa chữa"],
      ["OTHER", "Khác"],
      ["DISPOSED", "Đã thanh lý"],
    ];
    return definitions.map(([key, label]) => ({
      key,
      label,
      count: key === "OTHER" ? other : (counts.get(key) ?? 0),
    }));
  }

  private deviceTypeDistribution(scope: Filter) {
    return this.devices.aggregate<{ id: string; name: string; count: number }>([
      {
        $match: { isActive: true, usageStatus: { $ne: "DISPOSED" }, ...scope },
      },
      { $group: { _id: "$deviceTypeId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "device_types",
          localField: "_id",
          foreignField: "_id",
          as: "ref",
        },
      },
      {
        $set: {
          name: { $ifNull: [{ $first: "$ref.name" }, "Chưa phân loại"] },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, count: 1 } },
    ]);
  }

  private departmentDistribution(scope: Filter) {
    return this.devices.aggregate<{ id: string; name: string; count: number }>([
      {
        $match: {
          isActive: true,
          usageStatus: { $ne: "DISPOSED" },
          departmentId: { $exists: true },
          ...scope,
        },
      },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "ref",
        },
      },
      {
        $set: { name: { $ifNull: [{ $first: "$ref.name" }, "Chưa xác định"] } },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, count: 1 } },
    ]);
  }

  private async alerts(
    actor: CurrentActor,
    context: {
      actualNow: Date;
      loanToday: Date;
      dueSoon: Date;
      operationScope: Filter;
      repairScope: Filter;
      transactionScope: Filter;
      countScope: Filter;
      liquidationScope: Filter;
      purchaseScope: Filter;
    },
  ) {
    const {
      actualNow,
      loanToday,
      dueSoon,
      operationScope,
      repairScope,
      transactionScope,
      countScope,
      liquidationScope,
      purchaseScope,
    } = context;
    const tasks: Promise<{
      key: string;
      label: string;
      count: number;
      severity: string;
      href: string;
    }>[] = [];
    const add = (
      key: string,
      label: string,
      severity: string,
      href: string,
      query: Promise<number>,
    ) =>
      tasks.push(
        query.then((count) => ({ key, label, count, severity, href })),
      );

    if (has(actor, "operations.read")) {
      const loan = {
        type: "LOAN",
        status: { $in: LOAN_OPEN_STATUSES },
        ...operationScope,
      };
      add(
        "overdue-loans",
        "Phiếu mượn quá hạn",
        "danger",
        "/muon-tra?attention=overdue",
        this.operations.countDocuments({
          ...loan,
          dueDate: { $lt: loanToday },
        }),
      );
      add(
        "due-soon-loans",
        "Phiếu mượn sắp đến hạn",
        "warning",
        "/muon-tra?attention=due-soon",
        this.operations.countDocuments({
          ...loan,
          dueDate: { $gte: loanToday, $lte: dueSoon },
        }),
      );
    }
    if (has(actor, "repair.view")) {
      add(
        "overdue-repairs",
        "Sửa chữa quá hạn",
        "danger",
        "/sua-chua?attention=overdue",
        this.repairs.countDocuments({
          status: { $in: ["RECEIVED", "REPAIRING"] },
          expectedCompletionAt: { $lt: actualNow },
          ...repairScope,
        }),
      );
    }
    const draftQueries: Promise<number>[] = [];
    const pendingQueries: Promise<number>[] = [];
    if (has(actor, "repair.view")) {
      draftQueries.push(
        this.repairs.countDocuments({ status: "DRAFT", ...repairScope }),
      );
    }
    if (has(actor, "operations.read")) {
      draftQueries.push(
        this.operations.countDocuments({ status: "DRAFT", ...operationScope }),
      );
      pendingQueries.push(
        this.operations.countDocuments({
          status: { $in: ["PENDING", "IN_TRANSIT"] },
          ...operationScope,
        }),
      );
    }
    if (has(actor, "receipts.read")) {
      draftQueries.push(
        this.receipts.countDocuments({
          status: "DRAFT",
          ...transactionScope,
        }),
      );
      pendingQueries.push(
        this.receipts.countDocuments({
          status: { $in: ["SUBMITTED", "APPROVED"] },
          ...transactionScope,
        }),
      );
    }
    if (has(actor, "purchases.read")) {
      draftQueries.push(
        this.purchases.countDocuments({ status: "DRAFT", ...purchaseScope }),
      );
      pendingQueries.push(
        this.purchases.countDocuments({
          status: {
            $in: ["SUBMITTED", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"],
          },
          ...purchaseScope,
        }),
      );
    }
    if (has(actor, "inventory.view"))
      draftQueries.push(
        this.counts.countDocuments({ status: "DRAFT", ...countScope }),
      );
    if (has(actor, "liquidation.view"))
      draftQueries.push(
        this.liquidations.countDocuments({
          status: "DRAFT",
          ...liquidationScope,
        }),
      );
    if (draftQueries.length)
      add(
        "drafts",
        "Phiếu nháp cần hoàn thiện",
        "neutral",
        "/",
        Promise.all(draftQueries).then((v) => v.reduce((a, b) => a + b, 0)),
      );
    if (pendingQueries.length)
      add(
        "pending",
        "Chứng từ chờ xử lý",
        "warning",
        "/",
        Promise.all(pendingQueries).then((v) => v.reduce((a, b) => a + b, 0)),
      );
    if (has(actor, "parts.read")) {
      add(
        "low-stock",
        "Linh kiện dưới định mức",
        "warning",
        "/linh-kien?stock=low",
        this.parts
          .aggregate<{ count: number }>([
            { $match: { isActive: true, minQty: { $gt: 0 } } },
            {
              $lookup: {
                from: "inventory_balances",
                let: { partId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$partId", "$$partId"] },
                      ...transactionScope,
                    },
                  },
                  { $group: { _id: null, quantity: { $sum: "$quantity" } } },
                ],
                as: "stock",
              },
            },
            {
              $set: {
                quantity: { $ifNull: [{ $first: "$stock.quantity" }, 0] },
              },
            },
            { $match: { $expr: { $lt: ["$quantity", "$minQty"] } } },
            { $count: "count" },
          ])
          .then((rows) => rows[0]?.count ?? 0),
      );
    }
    if (has(actor, "inventory.view")) {
      add(
        "inventory-discrepancies",
        "Chênh lệch kiểm kê đang mở",
        "danger",
        "/kiem-ke?status=RECONCILING",
        this.counts
          .aggregate<{ count: number }>([
            { $match: countScope },
            { $unwind: "$discrepancies" },
            { $match: { "discrepancies.status": "OPEN" } },
            { $count: "count" },
          ])
          .then((rows) => rows[0]?.count ?? 0),
      );
    }
    if (has(actor, "liquidation.view")) {
      add(
        "liquidation-pending",
        "Phiếu thanh lý chờ duyệt",
        "warning",
        "/thanh-ly?status=PENDING",
        this.liquidations.countDocuments({
          status: "PENDING",
          ...liquidationScope,
        }),
      );
    }
    return (await Promise.all(tasks)).filter((alert) => alert.count > 0);
  }

  private async attentionLoans(scope: Filter, now: Date, dueSoon: Date) {
    const rows = await this.operations
      .find({ type: "LOAN", status: { $in: LOAN_OPEN_STATUSES }, ...scope })
      .select(
        "code status dueDate receiverKeeperId lines.kind lines.deviceName lines.assetCode",
      )
      .populate("receiverKeeperId", "displayName employeeCode")
      .sort({ dueDate: 1, operationDate: -1 })
      .limit(5)
      .lean()
      .exec();
    return rows.map((row) => {
      const due = row.dueDate ? new Date(row.dueDate) : undefined;
      const keeper = row.receiverKeeperId as unknown as
        { displayName?: string; employeeCode?: string } | undefined;
      return {
        id: String(row._id),
        code: row.code,
        borrower:
          keeper?.displayName ?? keeper?.employeeCode ?? "Chưa xác định",
        devices: row.lines
          .filter((line) => line.kind === "DEVICE")
          .slice(0, 2)
          .map((line) => line.deviceName ?? line.assetCode ?? "Thiết bị")
          .join(", "),
        dueDate: due?.toISOString(),
        status: row.status,
        attention: dashboardLoanAttention(due, now, dueSoon),
      };
    });
  }

  private async attentionRepairs(scope: Filter, now: Date) {
    const rows = await this.repairs.aggregate<{
      _id: Types.ObjectId;
      code: string;
      targetName?: string;
      assetCode?: string;
      status: string;
      expectedCompletionAt?: Date;
      responsiblePerson?: string;
      vendor?: string;
    }>([
      { $match: { status: { $in: ["RECEIVED", "REPAIRING"] }, ...scope } },
      {
        $set: {
          attentionOrder: {
            $cond: [
              { $lt: ["$expectedCompletionAt", now] },
              0,
              {
                $cond: [
                  { $ne: [{ $type: "$expectedCompletionAt" }, "missing"] },
                  1,
                  2,
                ],
              },
            ],
          },
        },
      },
      { $sort: { attentionOrder: 1, expectedCompletionAt: 1, repairDate: -1 } },
      { $limit: 5 },
      {
        $project: {
          code: 1,
          targetName: 1,
          assetCode: 1,
          status: 1,
          expectedCompletionAt: 1,
          responsiblePerson: 1,
          vendor: 1,
        },
      },
    ]);
    return rows.map((row) => ({
      id: String(row._id),
      code: row.code,
      asset: row.targetName ?? row.assetCode ?? "Tài sản",
      status: row.status,
      expectedCompletionAt: row.expectedCompletionAt?.toISOString(),
      responsible: row.responsiblePerson ?? row.vendor ?? "Chưa xác định",
      overdue: Boolean(
        row.expectedCompletionAt && row.expectedCompletionAt < now,
      ),
    }));
  }

  private async recentActivities(actor: CurrentActor) {
    const allowedPrefixes: string[] = ["LOGIN_"];
    if (has(actor, "devices.read", "parts.read", "operations.read"))
      allowedPrefixes.push("OPERATION_", "LOAN_", "RECEIPT_");
    if (has(actor, "repair.view")) allowedPrefixes.push("REPAIR_");
    if (has(actor, "inventory.view")) allowedPrefixes.push("INVENTORY_");
    if (has(actor, "liquidation.view")) allowedPrefixes.push("LIQUIDATION_");
    if (has(actor, "users.read")) allowedPrefixes.push("USER_");
    const pattern = new RegExp(
      `^(${allowedPrefixes.map((item) => item.replace("_", "_.*")).join("|")})`,
    );
    const rows = await this.auditLogs
      .find({
        outcome: "SUCCESS",
        action: pattern,
        ...(actor.roleCodes.includes("SYSTEM_ADMIN")
          ? {}
          : { actorUserId: actor.userId }),
      })
      .select("actorUserId action entityType entityId metadata createdAt")
      .populate("actorUserId", "displayName employeeCode")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean()
      .exec();
    return rows.map((row) => {
      const user = row.actorUserId as unknown as
        { displayName?: string; employeeCode?: string } | undefined;
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const code = [
        metadata.code,
        metadata.documentCode,
        metadata.operationCode,
      ].find((value) => typeof value === "string");
      return {
        id: String(row._id),
        at: String((row as unknown as { createdAt: Date }).createdAt),
        actor: user?.displayName ?? user?.employeeCode ?? "Hệ thống",
        action: row.action,
        description:
          ACTION_LABELS[row.action] ?? "thực hiện thao tác nghiệp vụ",
        entityType: row.entityType,
        entityId: row.entityId ? String(row.entityId) : undefined,
        code,
      };
    });
  }
}
