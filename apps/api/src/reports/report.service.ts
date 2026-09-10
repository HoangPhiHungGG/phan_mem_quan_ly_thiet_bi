/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage, Types } from "mongoose";
import { AuditService } from "../auth/audit.service";
import type { CurrentActor } from "../auth/auth.types";
import { Keeper } from "../catalog/catalog.schemas";
import { scopedFilter } from "../dashboard/dashboard.service";
import { Device, Part } from "../equipment/equipment.schemas";
import { Department, Warehouse } from "../identity/identity.schemas";
import { InventoryBalance } from "../inventory/inventory.schemas";
import { InventoryCountDocument } from "../inventory-counts/inventory-count.schemas";
import { LiquidationDocument } from "../liquidations/liquidation.schemas";
import { loanDay } from "../operations/loan.constants";
import { OperationDocument } from "../operations/operation.schemas";
import { InboundReceipt } from "../receipts/receipt.schemas";
import { RepairDocument } from "../repairs/repairs.schemas";
import type { ReportQueryDto, ReportType } from "./report.dto";

type Column = {
  key: string;
  label: string;
  type?: "date" | "number" | "money" | "status";
  detail?: string;
};
type Definition = {
  title: string;
  model: Model<any>;
  pipeline: PipelineStage[];
  columns: Column[];
};
const oid = (id?: string) => (id ? new Types.ObjectId(id) : undefined);
const ref = (from: string, localField: string, as: string) =>
  [
    { $lookup: { from, localField, foreignField: "_id", as } },
    { $set: { [as]: { $first: `$${as}` } } },
  ] as PipelineStage[];
const value = (primary: string, fallback: unknown) => ({
  $ifNull: [primary, fallback],
});
const C = (
  key: string,
  label: string,
  type?: Column["type"],
  detail?: string,
): Column => ({ key, label, type, detail });

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Device.name) private devices: Model<any>,
    @InjectModel(Part.name) private parts: Model<any>,
    @InjectModel(InventoryBalance.name) private balances: Model<any>,
    @InjectModel(OperationDocument.name) private operations: Model<any>,
    @InjectModel(InboundReceipt.name) private receipts: Model<any>,
    @InjectModel(RepairDocument.name) private repairs: Model<any>,
    @InjectModel(InventoryCountDocument.name) private inventories: Model<any>,
    @InjectModel(LiquidationDocument.name) private liquidations: Model<any>,
    @InjectModel(Keeper.name) private keepers: Model<any>,
    @InjectModel(Department.name) private departments: Model<any>,
    @InjectModel(Warehouse.name) private warehouses: Model<any>,
    private audit: AuditService,
  ) {}

  async get(
    type: ReportType | undefined,
    q: ReportQueryDto,
    actor: CurrentActor,
  ) {
    if (!type) throw new BadRequestException({ code: "REPORT_TYPE_INVALID" });
    this.validate(q);
    const definition = this.definition(type, q, actor);
    const sort = this.sort(q.sort, definition.columns);
    const limit = q.export ? 10_000 : q.limit;
    const skip = q.export ? 0 : (q.page - 1) * q.limit;
    const result = await definition.model
      .aggregate([
        ...definition.pipeline,
        {
          $facet: {
            rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
            meta: [{ $count: "total" }],
            summary: [
              {
                $group: {
                  _id: null,
                  records: { $sum: 1 },
                  quantity: { $sum: { $ifNull: ["$quantity", 0] } },
                  amount: { $sum: { $ifNull: ["$amount", 0] } },
                },
              },
            ],
          },
        },
      ])
      .exec();
    const first = result[0] ?? { rows: [], meta: [], summary: [] };
    const total = first.meta[0]?.total ?? 0;
    if (q.export && q.format) {
      await this.audit.write({
        actorUserId: actor.userId,
        action: "REPORT_EXPORTED",
        entityType: "Report",
        outcome: "SUCCESS",
        metadata: {
          type,
          format: q.format,
          filters: this.safeFilters(q),
          rowCount: first.rows.length,
        },
      });
    }
    return {
      data: {
        type,
        title: definition.title,
        columns: definition.columns,
        rows: first.rows,
        summary: first.summary[0] ?? { records: 0, quantity: 0, amount: 0 },
      },
      meta: {
        page: q.export ? 1 : q.page,
        limit,
        total,
        totalPages: q.export ? 1 : Math.max(1, Math.ceil(total / q.limit)),
        truncated: q.export && total > limit,
      },
    };
  }

  private validate(q: ReportQueryDto) {
    if (q.from && !/^\d{4}-\d{2}-\d{2}$/.test(q.from))
      throw new BadRequestException({ code: "REPORT_DATE_INVALID" });
    if (q.to && !/^\d{4}-\d{2}-\d{2}$/.test(q.to))
      throw new BadRequestException({ code: "REPORT_DATE_INVALID" });
    if (q.from && q.to && q.from > q.to)
      throw new BadRequestException({ code: "REPORT_DATE_RANGE_INVALID" });
  }
  private safeFilters(q: ReportQueryDto) {
    return Object.fromEntries(
      Object.entries(q).filter(
        ([key, item]) =>
          item !== undefined &&
          !["export", "format", "page", "limit"].includes(key),
      ),
    );
  }
  private sort(
    raw: string | undefined,
    columns: Column[],
  ): Record<string, 1 | -1> {
    const [key = "date", direction = "desc"] = (raw ?? "date:desc").split(":");
    const allowed = new Set(["date", ...columns.map((column) => column.key)]);
    return allowed.has(key)
      ? { [key]: direction === "asc" ? 1 : -1, _id: -1 }
      : { date: -1, _id: -1 };
  }
  private dates(q: ReportQueryDto, field: string) {
    return q.from || q.to
      ? {
          [field]: {
            ...(q.from ? { $gte: new Date(`${q.from}T00:00:00+07:00`) } : {}),
            ...(q.to ? { $lte: new Date(`${q.to}T23:59:59.999+07:00`) } : {}),
          },
        }
      : {};
  }
  private search(q: ReportQueryDto, fields: string[]) {
    if (!q.q?.trim()) return {};
    const pattern = new RegExp(
      q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    return { $or: fields.map((field) => ({ [field]: pattern })) };
  }

  private definition(
    type: ReportType,
    q: ReportQueryDto,
    actor: CurrentActor,
  ): Definition {
    if (type === "assets") return this.assets(q, actor);
    if (type === "parts") return this.partsReport(q, actor);
    if (type === "inventory") return this.stock(q, actor);
    if (type === "receipts") return this.receipt(q, actor);
    if (
      ["issues", "loans", "overdue", "transfers", "recoveries"].includes(type)
    )
      return this.operation(type, q, actor);
    if (type === "repairs") return this.repair(q, actor);
    if (type === "inventories") return this.inventoryCount(q, actor);
    if (type === "liquidations") return this.liquidation(q, actor);
    if (type === "employees") return this.employee(q, actor);
    if (type === "departments") return this.department(q, actor);
    return this.summary(q, actor);
  }

  private assets(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = {
      isActive: true,
      ...scopedFilter(actor, "warehouseId", "departmentId"),
      ...this.dates(q, "purchasedAt"),
      ...this.search(q, ["assetCode", "serial"]),
    };
    if (q.warehouseId) match.warehouseId = oid(q.warehouseId);
    if (q.departmentId) match.departmentId = oid(q.departmentId);
    if (q.employeeId) match.keeperId = oid(q.employeeId);
    if (q.deviceTypeId) match.deviceTypeId = oid(q.deviceTypeId);
    if (q.modelId) match.modelId = oid(q.modelId);
    if (q.supplierId) match.supplierId = oid(q.supplierId);
    if (q.techCondition) match.techCondition = q.techCondition;
    if (q.status) match.usageStatus = q.status;
    return {
      title: "Danh sách thiết bị",
      model: this.devices,
      pipeline: [
        { $match: match },
        ...ref("device_types", "deviceTypeId", "deviceType"),
        ...ref("item_models", "modelId", "model"),
        ...ref("suppliers", "supplierId", "supplier"),
        ...ref("warehouses", "warehouseId", "warehouse"),
        ...ref("keepers", "keeperId", "keeper"),
        ...ref("departments", "departmentId", "department"),
        {
          $project: {
            assetCode: 1,
            name: value("$model.name", "$assetCode"),
            deviceType: "$deviceType.name",
            model: "$model.name",
            manufacturer: "$supplier.name",
            serial: 1,
            warehouse: "$warehouse.name",
            employee: "$keeper.displayName",
            department: "$department.name",
            condition: "$techCondition",
            status: "$usageStatus",
            date: "$purchasedAt",
            amount: actor.permissions.includes("purchases.read")
              ? "$purchasePrice"
              : "$$REMOVE",
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("assetCode", "Mã tài sản", undefined, "/thiet-bi/"),
        C("name", "Tên thiết bị"),
        C("deviceType", "Loại"),
        C("manufacturer", "Hãng"),
        C("model", "Model"),
        C("serial", "Serial"),
        C("warehouse", "Kho quản lý"),
        C("employee", "Người sử dụng"),
        C("department", "Bộ phận"),
        C("condition", "Tình trạng", "status"),
        C("status", "Trạng thái", "status"),
        C("date", "Ngày nhập", "date"),
        ...(actor.permissions.includes("purchases.read")
          ? [C("amount", "Giá trị", "money")]
          : []),
      ],
    };
  }

  private partsReport(q: ReportQueryDto, actor: CurrentActor): Definition {
    const scope = this.warehouseScope(actor);
    const match: any = { ...scope };
    if (q.warehouseId) match.warehouseId = oid(q.warehouseId);
    return {
      title: "Tồn linh kiện",
      model: this.balances,
      pipeline: [
        { $match: match },
        {
          $group: {
            _id: { partId: "$partId", warehouseId: "$warehouseId" },
            quantity: { $sum: "$quantity" },
          },
        },
        ...ref("parts", "_id.partId", "part"),
        ...ref("warehouses", "_id.warehouseId", "warehouse"),
        ...ref("units", "part.unitId", "unit"),
        ...ref("device_types", "part.deviceTypeId", "group"),
        {
          $match: {
            "part.isActive": true,
            ...this.search(q, ["part.code", "part.name"]),
          },
        },
        {
          $project: {
            code: "$part.code",
            name: "$part.name",
            group: "$group.name",
            warehouse: "$warehouse.name",
            unit: "$unit.name",
            quantity: 1,
            minQty: "$part.minQty",
            stockStatus: {
              $switch: {
                branches: [
                  { case: { $lte: ["$quantity", 0] }, then: "OUT" },
                  {
                    case: { $lte: ["$quantity", "$part.minQty"] },
                    then: "LOW",
                  },
                ],
                default: "AVAILABLE",
              },
            },
            date: "$part.createdAt",
          },
        },
      ],
      columns: [
        C("code", "Mã linh kiện"),
        C("name", "Tên linh kiện"),
        C("group", "Nhóm"),
        C("warehouse", "Kho"),
        C("unit", "Đơn vị"),
        C("quantity", "Tồn hiện tại", "number"),
        C("minQty", "Tồn tối thiểu", "number"),
        C("stockStatus", "Trạng thái tồn", "status"),
      ],
    };
  }

  private stock(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = { isActive: true };
    if (q.warehouseId) match._id = oid(q.warehouseId);
    if (!actor.roleCodes.includes("SYSTEM_ADMIN")) {
      const ids = this.warehouseIds(actor);
      match._id = { $in: ids };
    }
    return {
      title: "Tổng hợp tồn kho",
      model: this.warehouses,
      pipeline: [
        { $match: match },
        {
          $lookup: {
            from: "devices",
            let: { wid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$warehouseId", "$$wid"] },
                  isActive: true,
                },
              },
              { $group: { _id: "$usageStatus", count: { $sum: 1 } } },
            ],
            as: "devices",
          },
        },
        {
          $lookup: {
            from: "inventory_balances",
            let: { wid: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$warehouseId", "$$wid"] } } },
              { $group: { _id: "$partId", quantity: { $sum: "$quantity" } } },
              {
                $group: {
                  _id: null,
                  partTypes: { $sum: 1 },
                  quantity: { $sum: "$quantity" },
                },
              },
            ],
            as: "parts",
          },
        },
        {
          $project: {
            warehouse: "$name",
            available: {
              $sum: {
                $map: {
                  input: "$devices",
                  as: "d",
                  in: {
                    $cond: [{ $eq: ["$$d._id", "IN_STOCK"] }, "$$d.count", 0],
                  },
                },
              },
            },
            inUse: {
              $sum: {
                $map: {
                  input: "$devices",
                  as: "d",
                  in: {
                    $cond: [{ $eq: ["$$d._id", "IN_USE"] }, "$$d.count", 0],
                  },
                },
              },
            },
            lent: {
              $sum: {
                $map: {
                  input: "$devices",
                  as: "d",
                  in: { $cond: [{ $eq: ["$$d._id", "LENT"] }, "$$d.count", 0] },
                },
              },
            },
            repairing: {
              $sum: {
                $map: {
                  input: "$devices",
                  as: "d",
                  in: {
                    $cond: [{ $eq: ["$$d._id", "REPAIRING"] }, "$$d.count", 0],
                  },
                },
              },
            },
            partTypes: { $ifNull: [{ $first: "$parts.partTypes" }, 0] },
            quantity: { $ifNull: [{ $first: "$parts.quantity" }, 0] },
            date: "$createdAt",
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("warehouse", "Kho", undefined, "/kho/"),
        C("available", "Thiết bị khả dụng", "number"),
        C("inUse", "Đang sử dụng", "number"),
        C("lent", "Đang mượn", "number"),
        C("repairing", "Sửa chữa", "number"),
        C("partTypes", "Số loại linh kiện", "number"),
        C("quantity", "Tổng tồn linh kiện", "number"),
      ],
    };
  }

  private receipt(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = {
      ...this.warehouseScope(actor),
      ...this.dates(q, "receiptDate"),
      ...this.search(q, ["code"]),
    };
    if (q.warehouseId) match.warehouseId = oid(q.warehouseId);
    if (q.status) match.status = q.status;
    if (q.assetType) match["lines.type"] = q.assetType;
    return {
      title: "Nhập kho",
      model: this.receipts,
      pipeline: [
        { $match: match },
        { $unwind: { path: "$lines", includeArrayIndex: "lineIndex" } },
        ...ref("warehouses", "warehouseId", "warehouse"),
        ...ref("users", "completedBy", "user"),
        ...ref("parts", "lines.part.partId", "part"),
        {
          $project: {
            date: "$receiptDate",
            code: 1,
            warehouse: "$warehouse.name",
            object: "$lines.type",
            assetCode: "$lines.device.assetCode",
            serial: {
              $ifNull: [
                "$lines.device.serial",
                { $first: "$lines.part.serials" },
              ],
            },
            name: { $ifNull: ["$part.name", "$lines.device.assetCode"] },
            quantity: "$lines.quantity",
            unit: { $literal: "" },
            employee: "$user.displayName",
            status: 1,
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("date", "Ngày", "date"),
        C("code", "Mã phiếu", undefined, "/nhap-kho/"),
        C("warehouse", "Kho"),
        C("object", "Đối tượng", "status"),
        C("name", "Tài sản/linh kiện"),
        C("assetCode", "Mã tài sản"),
        C("serial", "Serial"),
        C("quantity", "Số lượng", "number"),
        C("unit", "Đơn vị"),
        C("employee", "Người thực hiện"),
        C("status", "Trạng thái", "status"),
      ],
    };
  }

  private operation(
    type: ReportType,
    q: ReportQueryDto,
    actor: CurrentActor,
  ): Definition {
    const opType =
      type === "issues"
        ? "ISSUE"
        : type === "transfers"
          ? "TRANSFER"
          : type === "recoveries"
            ? "RECOVERY"
            : "LOAN";
    const match: any = {
      type: opType,
      ...scopedFilter(actor, "sourceWarehouseId", "receiverDepartmentId"),
      ...this.dates(q, "operationDate"),
      ...this.search(q, ["code"]),
    };
    if (q.warehouseId) match.sourceWarehouseId = oid(q.warehouseId);
    if (q.departmentId) match.receiverDepartmentId = oid(q.departmentId);
    if (q.employeeId) match.receiverKeeperId = oid(q.employeeId);
    if (q.status) match.status = q.status;
    if (type === "overdue") {
      match.status = {
        $in: ["ACTIVE", "PARTIALLY_RETURNED", "COMPLETED", "PARTIAL"],
      };
      match.dueDate = {
        $lt: new Date(`${loanDay(new Date())}T00:00:00+07:00`),
      };
      match.lines = { $elemMatch: { kind: "DEVICE", returned: { $ne: true } } };
    }
    const titles: Record<string, string> = {
      issues: "Báo cáo cấp phát",
      loans: "Báo cáo mượn/trả",
      overdue: "Thiết bị mượn quá hạn",
      transfers: "Báo cáo điều chuyển",
      recoveries: "Báo cáo thu hồi",
    };
    const prefixes: Record<string, string> = {
      issues: "/cap-phat?id=",
      loans: "/muon-tra?id=",
      overdue: "/muon-tra?id=",
      transfers: "/dieu-chuyen?id=",
      recoveries: "/thu-hoi?id=",
    };
    return {
      title: titles[type],
      model: this.operations,
      pipeline: [
        { $match: match },
        { $unwind: "$lines" },
        ...ref("keepers", "receiverKeeperId", "receiver"),
        ...ref("keepers", "senderKeeperId", "sender"),
        ...ref("departments", "receiverDepartmentId", "department"),
        ...ref("warehouses", "sourceWarehouseId", "sourceWarehouse"),
        ...ref("warehouses", "destinationWarehouseId", "destinationWarehouse"),
        ...ref("devices", "lines.deviceId", "device"),
        ...ref("parts", "lines.partId", "part"),
        ...ref("operations", "issueId", "original"),
        {
          $project: {
            date: "$operationDate",
            code: 1,
            employee: "$receiver.displayName",
            employeeCode: "$receiver.employeeCode",
            contact: "$receiver.phone",
            sender: "$sender.displayName",
            department: "$department.name",
            source: "$sourceWarehouse.name",
            destination: "$destinationWarehouse.name",
            item: value(
              "$lines.deviceName",
              value("$part.name", "$device.assetCode"),
            ),
            assetCode: value("$lines.assetCode", "$device.assetCode"),
            serial: value("$lines.serial", "$device.serial"),
            quantity: "$lines.quantity",
            conditionOut: value(
              "$lines.conditionOut",
              "$lines.handoverCondition",
            ),
            conditionIn: "$lines.conditionIn",
            dueDate: "$dueDate",
            returnedAt: "$lines.returnedAt",
            overdueDays:
              type === "overdue"
                ? {
                    $dateDiff: {
                      startDate: "$dueDate",
                      endDate: new Date(),
                      unit: "day",
                      timezone: "Asia/Ho_Chi_Minh",
                    },
                  }
                : "$$REMOVE",
            originalCode: "$original.code",
            status: 1,
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns:
        type === "overdue"
          ? [
              C("employee", "Người mượn"),
              C("department", "Bộ phận"),
              C("item", "Thiết bị"),
              C("assetCode", "Mã tài sản"),
              C("serial", "Serial"),
              C("code", "Mã phiếu", undefined, prefixes[type]),
              C("date", "Ngày mượn", "date"),
              C("dueDate", "Hạn trả", "date"),
              C("overdueDays", "Số ngày quá hạn", "number"),
              C("contact", "Liên hệ"),
            ]
          : [
              C("code", "Mã phiếu", undefined, prefixes[type]),
              C("date", "Ngày", "date"),
              C(
                "employee",
                type === "recoveries" ? "Người bàn giao" : "Người nhận",
              ),
              C("employeeCode", "Mã nhân viên"),
              C("department", "Bộ phận"),
              C("source", "Nơi đi/Kho xuất"),
              C("destination", "Nơi đến/Kho nhận"),
              C("item", "Thiết bị/linh kiện"),
              C("assetCode", "Mã tài sản"),
              C("serial", "Serial"),
              C("quantity", "Số lượng", "number"),
              ...(type === "loans"
                ? [
                    C("dueDate", "Hạn trả", "date"),
                    C("returnedAt", "Ngày trả", "date"),
                  ]
                : []),
              ...(type === "recoveries"
                ? [
                    C("originalCode", "Phiếu cấp phát gốc"),
                    C("conditionOut", "Tình trạng lúc cấp", "status"),
                    C("conditionIn", "Khi thu hồi", "status"),
                  ]
                : []),
              C("status", "Trạng thái", "status"),
            ],
    };
  }

  private repair(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = {
      ...scopedFilter(actor, "fromWarehouseId", "fromDepartmentId"),
      ...this.dates(q, "repairDate"),
      ...this.search(q, ["code", "assetCode", "serial", "targetName"]),
    };
    if (q.status) match.status = q.status;
    return {
      title: "Báo cáo sửa chữa",
      model: this.repairs,
      pipeline: [
        { $match: match },
        {
          $project: {
            date: "$repairDate",
            code: 1,
            item: "$targetName",
            assetCode: 1,
            serial: 1,
            issue: "$issueDescription",
            receivedAt: 1,
            vendor: value("$vendor", "$responsiblePerson"),
            amount: actor.permissions.includes("purchases.read")
              ? "$totalCost"
              : "$$REMOVE",
            result: 1,
            completedAt: 1,
            status: 1,
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("code", "Mã phiếu", undefined, "/sua-chua?id="),
        C("item", "Thiết bị"),
        C("assetCode", "Mã tài sản"),
        C("serial", "Serial"),
        C("issue", "Mô tả lỗi"),
        C("receivedAt", "Ngày tiếp nhận", "date"),
        C("vendor", "Đơn vị sửa"),
        ...(actor.permissions.includes("purchases.read")
          ? [C("amount", "Chi phí", "money")]
          : []),
        C("result", "Kết quả"),
        C("completedAt", "Ngày hoàn tất", "date"),
        C("status", "Trạng thái", "status"),
      ],
    };
  }
  private inventoryCount(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = {
      ...scopedFilter(actor, "warehouseId", "departmentId"),
      ...this.dates(q, "countDate"),
      ...this.search(q, ["code", "name"]),
    };
    if (q.status) match.status = q.status;
    return {
      title: "Báo cáo kiểm kê",
      model: this.inventories,
      pipeline: [
        { $match: match },
        {
          $project: {
            date: "$countDate",
            code: 1,
            name: 1,
            scope: 1,
            total: {
              $add: [{ $size: "$deviceItems" }, { $size: "$partItems" }],
            },
            checked: {
              $add: [
                {
                  $size: {
                    $filter: {
                      input: "$deviceItems",
                      as: "x",
                      cond: "$$x.checked",
                    },
                  },
                },
                {
                  $size: {
                    $filter: {
                      input: "$partItems",
                      as: "x",
                      cond: "$$x.checked",
                    },
                  },
                },
              ],
            },
            matched: {
              $add: [
                {
                  $size: {
                    $filter: {
                      input: "$deviceItems",
                      as: "x",
                      cond: { $eq: ["$$x.result", "MATCHED"] },
                    },
                  },
                },
                {
                  $size: {
                    $filter: {
                      input: "$partItems",
                      as: "x",
                      cond: { $eq: ["$$x.result", "MATCHED"] },
                    },
                  },
                },
              ],
            },
            discrepancies: { $size: "$discrepancies" },
            missing: {
              $size: {
                $filter: {
                  input: "$discrepancies",
                  as: "x",
                  cond: { $eq: ["$$x.type", "MISSING"] },
                },
              },
            },
            surplus: {
              $size: {
                $filter: {
                  input: "$discrepancies",
                  as: "x",
                  cond: { $eq: ["$$x.type", "SURPLUS"] },
                },
              },
            },
            wrongLocation: {
              $size: {
                $filter: {
                  input: "$discrepancies",
                  as: "x",
                  cond: { $eq: ["$$x.type", "WRONG_LOCATION"] },
                },
              },
            },
            wrongHolder: {
              $size: {
                $filter: {
                  input: "$discrepancies",
                  as: "x",
                  cond: { $eq: ["$$x.type", "WRONG_HOLDER"] },
                },
              },
            },
            wrongCondition: {
              $size: {
                $filter: {
                  input: "$discrepancies",
                  as: "x",
                  cond: { $eq: ["$$x.type", "CONDITION_MISMATCH"] },
                },
              },
            },
            notFound: {
              $size: {
                $filter: {
                  input: "$deviceItems",
                  as: "x",
                  cond: { $eq: ["$$x.result", "NOT_FOUND"] },
                },
              },
            },
            status: 1,
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("code", "Mã phiếu", undefined, "/kiem-ke?id="),
        C("name", "Tên đợt"),
        C("date", "Ngày", "date"),
        C("scope", "Phạm vi", "status"),
        C("total", "Tổng tài sản", "number"),
        C("checked", "Đã kiểm", "number"),
        C("matched", "Khớp", "number"),
        C("discrepancies", "Sai lệch", "number"),
        C("notFound", "Không tìm thấy", "number"),
        C("missing", "Thiếu", "number"),
        C("surplus", "Thừa", "number"),
        C("wrongLocation", "Sai vị trí", "number"),
        C("wrongHolder", "Sai người giữ", "number"),
        C("wrongCondition", "Sai tình trạng", "number"),
        C("status", "Trạng thái", "status"),
      ],
    };
  }
  private liquidation(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = {
      ...scopedFilter(actor, "warehouseId", "requestedDepartmentId"),
      ...this.dates(q, "documentDate"),
      ...this.search(q, ["code"]),
    };
    if (q.status) match.status = q.status;
    return {
      title: "Báo cáo thanh lý",
      model: this.liquidations,
      pipeline: [
        { $match: match },
        { $unwind: "$lines" },
        ...ref("departments", "requestedDepartmentId", "department"),
        {
          $project: {
            date: "$documentDate",
            code: 1,
            item: "$lines.name",
            assetCode: "$lines.assetCode",
            serial: "$lines.serial",
            method: 1,
            reason: value("$lines.reason", "$reason"),
            department: "$department.name",
            amount: actor.permissions.includes("purchases.read")
              ? "$lines.liquidationValue"
              : "$$REMOVE",
            responsible: "$responsiblePerson",
            status: 1,
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("code", "Mã phiếu", undefined, "/thanh-ly?id="),
        C("date", "Ngày", "date"),
        C("item", "Tài sản"),
        C("assetCode", "Mã tài sản"),
        C("serial", "Serial"),
        C("method", "Hình thức", "status"),
        C("reason", "Lý do"),
        C("department", "Bộ phận đề nghị"),
        ...(actor.permissions.includes("purchases.read")
          ? [C("amount", "Giá trị thanh lý", "money")]
          : []),
        C("responsible", "Người phụ trách"),
        C("status", "Trạng thái", "status"),
      ],
    };
  }
  private employee(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = {
      isActive: true,
      ...this.search(q, ["displayName", "employeeCode", "email"]),
    };
    if (q.employeeId) match._id = oid(q.employeeId);
    if (q.departmentId) match.departmentId = oid(q.departmentId);
    if (!actor.roleCodes.includes("SYSTEM_ADMIN") && actor.primaryDepartmentId)
      match.departmentId = oid(actor.primaryDepartmentId);
    return {
      title: "Tài sản theo nhân viên",
      model: this.keepers,
      pipeline: [
        { $match: match },
        ...ref("departments", "departmentId", "department"),
        ...ref("positions", "positionId", "position"),
        {
          $lookup: {
            from: "devices",
            let: { kid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$keeperId", "$$kid"] },
                  isActive: true,
                  usageStatus: { $in: ["IN_USE", "LENT"] },
                },
              },
              { $group: { _id: "$usageStatus", count: { $sum: 1 } } },
            ],
            as: "assets",
          },
        },
        {
          $project: {
            employee: "$displayName",
            employeeCode: 1,
            department: "$department.name",
            position: "$position.name",
            held: {
              $sum: {
                $map: {
                  input: "$assets",
                  as: "x",
                  in: {
                    $cond: [{ $eq: ["$$x._id", "IN_USE"] }, "$$x.count", 0],
                  },
                },
              },
            },
            borrowed: {
              $sum: {
                $map: {
                  input: "$assets",
                  as: "x",
                  in: { $cond: [{ $eq: ["$$x._id", "LENT"] }, "$$x.count", 0] },
                },
              },
            },
            quantity: { $sum: "$assets.count" },
            date: "$createdAt",
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("employee", "Nhân viên"),
        C("employeeCode", "Mã nhân viên"),
        C("department", "Bộ phận"),
        C("position", "Chức vụ"),
        C("held", "Thiết bị đang giữ", "number"),
        C("borrowed", "Thiết bị đang mượn", "number"),
        C("quantity", "Tổng tài sản", "number"),
      ],
    };
  }
  private department(q: ReportQueryDto, actor: CurrentActor): Definition {
    const match: any = { isActive: true, ...this.search(q, ["code", "name"]) };
    if (q.departmentId) match._id = oid(q.departmentId);
    if (!actor.roleCodes.includes("SYSTEM_ADMIN") && actor.primaryDepartmentId)
      match._id = oid(actor.primaryDepartmentId);
    return {
      title: "Tài sản theo bộ phận",
      model: this.departments,
      pipeline: [
        { $match: match },
        {
          $lookup: {
            from: "keepers",
            localField: "_id",
            foreignField: "departmentId",
            as: "employees",
          },
        },
        {
          $lookup: {
            from: "devices",
            localField: "_id",
            foreignField: "departmentId",
            as: "devices",
          },
        },
        {
          $project: {
            department: "$name",
            employeeCount: { $size: "$employees" },
            inUse: {
              $size: {
                $filter: {
                  input: "$devices",
                  as: "x",
                  cond: { $eq: ["$$x.usageStatus", "IN_USE"] },
                },
              },
            },
            lent: {
              $size: {
                $filter: {
                  input: "$devices",
                  as: "x",
                  cond: { $eq: ["$$x.usageStatus", "LENT"] },
                },
              },
            },
            quantity: { $size: "$devices" },
            date: "$createdAt",
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("department", "Bộ phận"),
        C("employeeCount", "Số nhân viên", "number"),
        C("inUse", "Đang sử dụng", "number"),
        C("lent", "Đang mượn", "number"),
        C("quantity", "Tổng tài sản", "number"),
      ],
    };
  }
  private summary(q: ReportQueryDto, actor: CurrentActor): Definition {
    return {
      title: "Tổng hợp tài sản",
      model: this.devices,
      pipeline: [
        {
          $match: {
            isActive: true,
            ...scopedFilter(actor, "warehouseId", "departmentId"),
            ...this.dates(q, "createdAt"),
          },
        },
        {
          $project: {
            assetCode: 1,
            status: "$usageStatus",
            condition: "$techCondition",
            date: "$createdAt",
            quantity: { $literal: 1 },
            detailId: { $toString: "$_id" },
          },
        },
      ],
      columns: [
        C("assetCode", "Mã tài sản", undefined, "/thiet-bi/"),
        C("status", "Trạng thái", "status"),
        C("condition", "Tình trạng", "status"),
        C("date", "Ngày ghi nhận", "date"),
      ],
    };
  }
  private warehouseIds(actor: CurrentActor) {
    return [...new Set(actor.scopes.flatMap((s) => s.warehouseIds))]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => oid(id));
  }
  private warehouseScope(actor: CurrentActor) {
    return actor.roleCodes.includes("SYSTEM_ADMIN") ||
      actor.scopes.some((s) => s.warehouseMode === "ALL_WAREHOUSES")
      ? {}
      : { warehouseId: { $in: this.warehouseIds(actor) } };
  }
}
