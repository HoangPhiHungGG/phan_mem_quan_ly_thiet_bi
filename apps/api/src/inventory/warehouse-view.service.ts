import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage, Types } from "mongoose";
import { Device } from "../equipment/equipment.schemas";
import { Warehouse } from "../identity/identity.schemas";
import { InventoryBalance, InventoryTransaction } from "./inventory.schemas";

type Query = Record<string, string | undefined>;
type PageResult = {
  data: Record<string, unknown>[];
  count: { total: number }[];
};
const regex = (text: string) =>
  new RegExp(text.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const one = (field: string) => ({ $arrayElemAt: [`$${field}`, 0] });
const lookup = (
  from: string,
  localField: string,
  as: string,
): PipelineStage.Lookup => ({
  $lookup: { from, localField, foreignField: "_id", as },
});
const validTypes = [
  "OPENING",
  "RECEIPT",
  "OUT",
  "ISSUE",
  "LOAN",
  "RETURN",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RECOVERY",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DISPOSAL",
  "LOST",
  "UNKNOWN",
];

@Injectable()
export class WarehouseViewService {
  constructor(
    @InjectModel(Warehouse.name) private readonly warehouses: Model<Warehouse>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(InventoryBalance.name)
    private readonly balances: Model<InventoryBalance>,
    @InjectModel(InventoryTransaction.name)
    private readonly transactions: Model<InventoryTransaction>,
  ) {}
  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException({ code: "WAREHOUSE_QUERY_INVALID" });
    return new Types.ObjectId(id);
  }
  private async warehouse(id: string) {
    const item = await this.warehouses
      .findById(this.objectId(id))
      .populate("managerKeeperId", "displayName employeeCode")
      .lean();
    if (!item) throw new NotFoundException({ code: "WAREHOUSE_NOT_FOUND" });
    return item;
  }
  private page(query: Query) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(
      100,
      Math.max(1, Math.trunc(Number(query.limit) || 20)),
    );
    return { page, limit };
  }
  private async paginated(
    model:
      Model<Device> | Model<InventoryBalance> | Model<InventoryTransaction>,
    pipeline: PipelineStage[],
    query: Query,
    sort: Record<string, 1 | -1>,
  ) {
    const { page, limit } = this.page(query);
    const [result] = await model
      .aggregate<PageResult>([
        ...pipeline,
        {
          $facet: {
            data: [
              { $sort: sort },
              { $skip: (page - 1) * limit },
              { $limit: limit },
            ],
            count: [{ $count: "total" }],
          },
        },
      ])
      .allowDiskUse(true);
    const total = result?.count[0]?.total ?? 0;
    return {
      data: result?.data ?? [],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
  private partBase(warehouseId: Types.ObjectId): PipelineStage[] {
    return [
      { $match: { warehouseId } },
      lookup("parts", "partId", "part"),
      { $set: { part: one("part") } },
      {
        $set: {
          stockStatus: {
            $switch: {
              branches: [
                { case: { $lt: ["$quantity", 0] }, then: "INVALID" },
                { case: { $eq: ["$quantity", 0] }, then: "OUT" },
                {
                  case: { $eq: [{ $ifNull: ["$part._id", null] }, null] },
                  then: "UNKNOWN",
                },
                { case: { $lte: ["$quantity", "$part.minQty"] }, then: "LOW" },
              ],
              default: "AVAILABLE",
            },
          },
        },
      },
    ];
  }
  async summary(id: string) {
    const warehouse = await this.warehouse(id);
    const [deviceCounts, partCounts, locations] = await Promise.all([
      this.devices.aggregate<{
        total: number;
        available: number;
        inUse: number;
        lent: number;
      }>([
        {
          $match: {
            warehouseId: warehouse._id,
            isActive: true,
            usageStatus: "IN_STOCK",
            keeperId: null,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            available: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$usageStatus", "IN_STOCK"] },
                      { $ne: ["$techCondition", "BROKEN"] },
                      { $eq: [{ $ifNull: ["$keeperId", null] }, null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            inUse: {
              $sum: { $cond: [{ $eq: ["$usageStatus", "IN_USE"] }, 1, 0] },
            },
            lent: {
              $sum: { $cond: [{ $eq: ["$usageStatus", "LENT"] }, 1, 0] },
            },
          },
        },
      ]),
      this.balances.aggregate<{
        types: number;
        quantity: number;
        low: number;
        out: number;
        missingParts: number;
        negativeBalances: number;
      }>([
        ...this.partBase(warehouse._id),
        {
          $group: {
            _id: null,
            types: {
              $sum: {
                $cond: [
                  { $ne: [{ $ifNull: ["$part._id", null] }, null] },
                  1,
                  0,
                ],
              },
            },
            quantity: {
              $sum: {
                $cond: [
                  { $ne: [{ $ifNull: ["$part._id", null] }, null] },
                  "$quantity",
                  0,
                ],
              },
            },
            low: { $sum: { $cond: [{ $eq: ["$stockStatus", "LOW"] }, 1, 0] } },
            out: { $sum: { $cond: [{ $eq: ["$stockStatus", "OUT"] }, 1, 0] } },
            missingParts: {
              $sum: {
                $cond: [
                  { $eq: [{ $ifNull: ["$part._id", null] }, null] },
                  1,
                  0,
                ],
              },
            },
            negativeBalances: {
              $sum: { $cond: [{ $lt: ["$quantity", 0] }, 1, 0] },
            },
          },
        },
      ]),
      this.warehouses.db
        .collection("locations")
        .countDocuments({ warehouseId: warehouse._id, isActive: true }),
    ]);
    return {
      data: {
        warehouse,
        storageLocationCount: locations,
        devices: deviceCounts[0] ?? {
          total: 0,
          available: 0,
          inUse: 0,
          lent: 0,
        },
        parts: partCounts[0] ?? {
          types: 0,
          quantity: 0,
          low: 0,
          out: 0,
          missingParts: 0,
          negativeBalances: 0,
        },
      },
    };
  }
  async listDevices(id: string, query: Query) {
    const warehouse = await this.warehouse(id);
    const filter: Record<string, unknown> = {
      warehouseId: warehouse._id,
      isActive: true,
      usageStatus: "IN_STOCK",
      keeperId: null,
    };
    if (query.status === "AVAILABLE")
      Object.assign(filter, {
        usageStatus: "IN_STOCK",
        techCondition: { $ne: "BROKEN" },
        keeperId: null,
      });
    else if (query.status && query.status !== "IN_STOCK")
      filter.usageStatus = "__NO_PHYSICAL_MATCH__";
    if (query.techCondition) filter.techCondition = query.techCondition;
    if (query.deviceTypeId)
      filter.deviceTypeId = this.objectId(query.deviceTypeId);
    const pipeline: PipelineStage[] = [
      { $match: filter },
      lookup("item_models", "modelId", "model"),
      lookup("device_types", "deviceTypeId", "deviceType"),
      lookup("keepers", "keeperId", "keeper"),
      lookup("locations", "locationId", "location"),
      {
        $set: {
          model: one("model"),
          deviceType: one("deviceType"),
          keeper: one("keeper"),
          location: one("location"),
        },
      },
    ];
    if (query.q?.trim()) {
      const match = regex(query.q);
      pipeline.push({
        $match: {
          $or: [
            { assetCode: match },
            { serial: match },
            { "model.name": match },
            { "model.code": match },
            { "model.manufacturer": match },
          ],
        },
      });
    }
    pipeline.push({
      $project: {
        assetCode: 1,
        serial: 1,
        techCondition: 1,
        usageStatus: 1,
        name: "$model.name",
        "model.name": 1,
        "model.code": 1,
        "model.manufacturer": 1,
        "deviceType._id": 1,
        "deviceType.name": 1,
        "keeper._id": 1,
        "keeper.displayName": 1,
        "location.name": 1,
        createdAt: 1,
      },
    });
    return this.paginated(this.devices, pipeline, query, {
      createdAt: -1,
      _id: -1,
    });
  }
  async listParts(id: string, query: Query) {
    const warehouse = await this.warehouse(id);
    const pipeline = this.partBase(warehouse._id);
    if (query.status) pipeline.push({ $match: { stockStatus: query.status } });
    if (query.componentTypeId)
      pipeline.push({
        $match: {
          "part.componentTypeId": this.objectId(query.componentTypeId),
        },
      });
    pipeline.push(lookup("item_models", "part.modelId", "model"), {
      $set: { model: one("model") },
    });
    if (query.q?.trim()) {
      const match = regex(query.q);
      pipeline.push({
        $match: {
          $or: [
            { "part.code": match },
            { "part.name": match },
            { "model.name": match },
            { "model.manufacturer": match },
          ],
        },
      });
    }
    pipeline.push(
      lookup("units", "part.unitId", "unit"),
      lookup("component_types", "part.componentTypeId", "componentType"),
      {
        $set: {
          unit: one("unit"),
          componentType: one("componentType"),
        },
      },
      {
        $project: {
          partId: 1,
          quantity: 1,
          stockStatus: 1,
          "part.code": 1,
          "part.name": 1,
          "part.minQty": 1,
          "part.isActive": 1,
          "unit.name": 1,
          "unit.code": 1,
          "componentType.name": 1,
          "model.name": 1,
          "model.manufacturer": 1,
        },
      },
    );
    return this.paginated(this.balances, pipeline, query, {
      "part.code": 1,
      _id: 1,
    });
  }

  private partHistory(
    warehouseId: Types.ObjectId,
    partId?: Types.ObjectId,
  ): PipelineStage[] {
    const outgoing = ["ISSUE", "TRANSFER_OUT", "DISPOSAL"];
    const supported = [
      "OPENING",
      "PURCHASE",
      "ISSUE",
      "RETURN",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "DISPOSAL",
      "ADJUSTMENT",
    ];
    return [
      { $match: { warehouseId, ...(partId ? { partId } : {}) } },
      {
        $set: {
          delta: {
            $cond: [
              { $in: ["$type", outgoing] },
              { $multiply: ["$quantity", -1] },
              "$quantity",
            ],
          },
          knownType: { $cond: [{ $in: ["$type", supported] }, 1, 0] },
        },
      },
      {
        $setWindowFields: {
          partitionBy: "$partId",
          sortBy: { createdAt: 1, _id: 1 },
          output: {
            running: {
              $sum: "$delta",
              window: { documents: ["unbounded", "current"] },
            },
            net: {
              $sum: "$delta",
              window: { documents: ["unbounded", "unbounded"] },
            },
            allKnown: {
              $min: "$knownType",
              window: { documents: ["unbounded", "unbounded"] },
            },
          },
        },
      },
      {
        $setWindowFields: {
          partitionBy: "$partId",
          output: {
            minimumRunning: {
              $min: "$running",
              window: { documents: ["unbounded", "unbounded"] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "inventory_balances",
          let: { part: "$partId" },
          pipeline: [
            { $match: { warehouseId, $expr: { $eq: ["$partId", "$$part"] } } },
            { $project: { quantity: 1 } },
          ],
          as: "balance",
        },
      },
      lookup("operations", "operationId", "op"),
      lookup("inbound_receipts", "receiptId", "receipt"),
      lookup("parts", "partId", "part"),
      {
        $set: {
          op: one("op"),
          receipt: one("receipt"),
          part: one("part"),
          balance: one("balance"),
        },
      },
      {
        $set: {
          reconciled: {
            $and: [
              { $eq: ["$allKnown", 1] },
              { $gte: ["$minimumRunning", 0] },
              { $eq: ["$net", "$balance.quantity"] },
            ],
          },
        },
      },
      {
        $project: {
          _id: { $concat: ["part:", { $toString: "$_id" }] },
          time: "$createdAt",
          actorId: "$createdBy",
          note: 1,
          type: {
            $switch: {
              branches: [
                { case: { $eq: ["$type", "PURCHASE"] }, then: "RECEIPT" },
                {
                  case: { $eq: ["$type", "ISSUE"] },
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$op.type", "ISSUE"] }, then: "ISSUE" },
                        { case: { $eq: ["$op.type", "LOAN"] }, then: "LOAN" },
                      ],
                      default: "OUT",
                    },
                  },
                },
                {
                  case: { $eq: ["$type", "ADJUSTMENT"] },
                  then: {
                    $cond: [
                      { $lt: ["$quantity", 0] },
                      "ADJUSTMENT_OUT",
                      "ADJUSTMENT_IN",
                    ],
                  },
                },
              ],
              default: {
                $cond: [{ $in: ["$type", supported] }, "$type", "UNKNOWN"],
              },
            },
          },
          object: {
            kind: { $literal: "PART" },
            id: "$partId",
            code: "$part.code",
            name: "$part.name",
          },
          document: {
            $cond: [
              { $ne: [{ $ifNull: ["$operationId", null] }, null] },
              {
                id: "$operationId",
                code: "$op.code",
                type: "$op.type",
                kind: "OPERATION",
              },
              {
                $cond: [
                  { $ne: [{ $ifNull: ["$receiptId", null] }, null] },
                  { id: "$receiptId", code: "$receipt.code", kind: "RECEIPT" },
                  null,
                ],
              },
            ],
          },
          expectedReference: {
            $or: [
              { $ne: [{ $ifNull: ["$operationId", null] }, null] },
              { $ne: [{ $ifNull: ["$receiptId", null] }, null] },
              {
                $regexMatch: {
                  input: { $ifNull: ["$note", ""] },
                  regex: "^(ISSUE |LOAN |TRANSFER |Phiếu nhập |Đảo phiếu )",
                },
              },
            ],
          },
          quantityIn: { $max: ["$delta", 0] },
          quantityOut: { $max: [{ $multiply: ["$delta", -1] }, 0] },
          balanceAfter: { $cond: ["$reconciled", "$running", null] },
          balanceStatus: { $cond: ["$reconciled", "RECONCILED", "UNKNOWN"] },
        },
      },
    ];
  }
  private operationHistory(
    warehouseId: Types.ObjectId,
  ): PipelineStage.UnionWithPipelineStage[] {
    const event = (
      when: unknown,
      time: unknown,
      type: string,
      incoming: number,
      outgoing: number,
      actorId: unknown,
      suffix: string,
    ) => ({
      $cond: [
        when,
        [
          {
            time,
            type,
            quantityIn: incoming,
            quantityOut: outgoing,
            actorId,
            suffix,
          },
        ],
        [],
      ],
    });
    const from = { $eq: ["$sourceWarehouseId", warehouseId] };
    const to = { $eq: ["$destinationWarehouseId", warehouseId] };
    const completed = { $eq: ["$status", "COMPLETED"] };
    const delivered = {
      $in: [
        "$status",
        ["ACTIVE", "PARTIALLY_RETURNED", "RETURNED", "COMPLETED", "PARTIAL"],
      ],
    };
    const dispatchTime = {
      $ifNull: [
        "$lines.handedOverAt",
        {
          $ifNull: [
            "$dispatchedAt",
            { $ifNull: ["$completedAt", "$operationDate"] },
          ],
        },
      ],
    };
    return [
      {
        $match: {
          $or: [
            { sourceWarehouseId: warehouseId },
            { destinationWarehouseId: warehouseId },
          ],
          status: { $nin: ["DRAFT", "PENDING", "CANCELLED"] },
        },
      },
      { $unwind: { path: "$lines", includeArrayIndex: "lineIndex" } },
      { $match: { "lines.kind": "DEVICE" } },
      {
        $set: {
          events: {
            $concatArrays: [
              event(
                { $and: [from, { $eq: ["$type", "ISSUE"] }, completed] },
                dispatchTime,
                "ISSUE",
                0,
                1,
                { $ifNull: ["$dispatchedBy", "$createdBy"] },
                "issue",
              ),
              event(
                { $and: [from, { $eq: ["$type", "LOAN"] }, delivered] },
                dispatchTime,
                "LOAN",
                0,
                1,
                { $ifNull: ["$dispatchedBy", "$createdBy"] },
                "loan",
              ),
              event(
                {
                  $and: [
                    from,
                    { $eq: ["$type", "TRANSFER"] },
                    {
                      $in: ["$status", ["IN_TRANSIT", "COMPLETED", "REJECTED"]],
                    },
                  ],
                },
                dispatchTime,
                "TRANSFER_OUT",
                0,
                1,
                "$dispatchedBy",
                "transfer-out",
              ),
              event(
                { $and: [to, { $eq: ["$type", "TRANSFER"] }, completed] },
                "$receivedAt",
                "TRANSFER_IN",
                1,
                0,
                "$receivedBy",
                "transfer-in",
              ),
              event(
                {
                  $and: [
                    from,
                    { $eq: ["$type", "TRANSFER"] },
                    { $eq: ["$status", "REJECTED"] },
                  ],
                },
                "$receivedAt",
                "TRANSFER_IN",
                1,
                0,
                "$receivedBy",
                "transfer-rejected",
              ),
              event(
                { $and: [to, { $eq: ["$type", "RECOVERY"] }, completed] },
                dispatchTime,
                "RECOVERY",
                1,
                0,
                { $ifNull: ["$dispatchedBy", "$createdBy"] },
                "recovery",
              ),
            ],
          },
        },
      },
      { $unwind: "$events" },
      {
        $project: {
          _id: {
            $concat: [
              "op:",
              { $toString: "$_id" },
              ":",
              { $toString: "$lineIndex" },
              ":",
              "$events.suffix",
            ],
          },
          time: "$events.time",
          type: "$events.type",
          quantityIn: "$events.quantityIn",
          quantityOut: "$events.quantityOut",
          actorId: "$events.actorId",
          document: {
            id: "$_id",
            code: "$code",
            type: "$type",
            kind: "OPERATION",
          },
          object: {
            kind: "DEVICE",
            id: "$lines.deviceId",
            code: "$lines.assetCode",
            name: "$lines.deviceName",
            serial: "$lines.serial",
          },
          note: { $ifNull: ["$lines.note", "$reason"] },
          balanceAfter: { $literal: null },
          balanceStatus: { $literal: "NOT_APPLICABLE" },
        },
      },
    ];
  }
  private loanReturns(
    warehouseId: Types.ObjectId,
  ): PipelineStage.UnionWithPipelineStage[] {
    return [
      {
        $match: {
          type: "LOAN",
          sourceWarehouseId: warehouseId,
          "returnHistory.0": { $exists: true },
        },
      },
      { $unwind: "$returnHistory" },
      { $unwind: "$returnHistory.items" },
      {
        $project: {
          _id: {
            $concat: [
              "return:",
              { $toString: "$returnHistory._id" },
              ":",
              { $toString: "$returnHistory.items.deviceId" },
            ],
          },
          time: "$returnHistory.recordedAt",
          businessDate: "$returnHistory.returnedAt",
          type: {
            $cond: [
              { $eq: ["$returnHistory.items.result", "LOST"] },
              "LOST",
              "RETURN",
            ],
          },
          quantityIn: {
            $cond: [{ $eq: ["$returnHistory.items.result", "LOST"] }, 0, 1],
          },
          quantityOut: { $literal: 0 },
          actorId: "$returnHistory.receivedBy",
          document: {
            id: "$_id",
            code: "$code",
            type: "$type",
            kind: "OPERATION",
          },
          returnId: "$returnHistory._id",
          object: {
            kind: "DEVICE",
            id: "$returnHistory.items.deviceId",
            code: "$returnHistory.items.assetCode",
            name: "$returnHistory.items.deviceName",
            serial: "$returnHistory.items.serial",
          },
          note: {
            $ifNull: ["$returnHistory.items.note", "$returnHistory.note"],
          },
          balanceAfter: { $literal: null },
          balanceStatus: { $literal: "NOT_APPLICABLE" },
        },
      },
    ];
  }
  private receiptHistory(
    warehouseId: Types.ObjectId,
  ): PipelineStage.UnionWithPipelineStage[] {
    return [
      { $match: { warehouseId, status: { $in: ["COMPLETED", "REVERSED"] } } },
      { $unwind: { path: "$lines", includeArrayIndex: "lineIndex" } },
      { $match: { "lines.type": "DEVICE" } },
      {
        $set: {
          events: {
            $concatArrays: [
              [
                {
                  type: "RECEIPT",
                  time: { $ifNull: ["$completedAt", "$receiptDate"] },
                  quantityIn: "$lines.quantity",
                  quantityOut: 0,
                  actorId: "$completedBy",
                  suffix: "in",
                },
              ],
              {
                $cond: [
                  { $eq: ["$status", "REVERSED"] },
                  [
                    {
                      type: "ADJUSTMENT_OUT",
                      time: "$reversedAt",
                      quantityIn: 0,
                      quantityOut: "$lines.quantity",
                      actorId: "$reversedBy",
                      suffix: "reverse",
                    },
                  ],
                  [],
                ],
              },
            ],
          },
        },
      },
      { $unwind: "$events" },
      {
        $project: {
          _id: {
            $concat: [
              "receipt:",
              { $toString: "$_id" },
              ":",
              { $toString: "$lineIndex" },
              ":",
              "$events.suffix",
            ],
          },
          time: "$events.time",
          type: "$events.type",
          quantityIn: "$events.quantityIn",
          quantityOut: "$events.quantityOut",
          actorId: "$events.actorId",
          document: { id: "$_id", code: "$code", kind: "RECEIPT" },
          object: {
            kind: "DEVICE",
            id: "$lines.device.deviceId",
            code: "$lines.device.assetCode",
            serial: "$lines.device.serial",
          },
          note: "$lines.note",
          balanceAfter: { $literal: null },
          balanceStatus: { $literal: "NOT_APPLICABLE" },
        },
      },
    ];
  }
  async history(id: string, query: Query) {
    const warehouse = await this.warehouse(id);
    const partId = query.partId ? this.objectId(query.partId) : undefined;
    const pipeline = this.partHistory(warehouse._id, partId);
    if (!partId)
      pipeline.push(
        {
          $unionWith: {
            coll: "operations",
            pipeline: this.operationHistory(warehouse._id),
          },
        },
        {
          $unionWith: {
            coll: "operations",
            pipeline: this.loanReturns(warehouse._id),
          },
        },
        {
          $unionWith: {
            coll: "inbound_receipts",
            pipeline: this.receiptHistory(warehouse._id),
          },
        },
      );
    const filter: Record<string, unknown> = {};
    if (query.type) {
      if (!validTypes.includes(query.type))
        throw new BadRequestException({ code: "WAREHOUSE_QUERY_INVALID" });
      filter.type = query.type;
    }
    if (query.q?.trim()) filter["document.code"] = regex(query.q);
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      for (const [field, value] of [
        ["$gte", query.from],
        ["$lt", query.to],
      ])
        if (value) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
            throw new BadRequestException({ code: "WAREHOUSE_QUERY_INVALID" });
          const date = new Date(`${value}T00:00:00+07:00`);
          if (!Number.isFinite(date.getTime()))
            throw new BadRequestException({ code: "WAREHOUSE_QUERY_INVALID" });
          if (field === "$lt") date.setUTCDate(date.getUTCDate() + 1);
          range[field!] = date;
        }
      if (query.from && query.to && query.from > query.to)
        throw new BadRequestException({ code: "WAREHOUSE_QUERY_INVALID" });
      filter.time = range;
    }
    pipeline.push(
      { $match: filter },
      lookup("users", "actorId", "actor"),
      lookup("devices", "object.id", "device"),
      { $set: { actor: one("actor"), device: one("device") } },
      lookup("item_models", "device.modelId", "model"),
      {
        $set: {
          "object.code": { $ifNull: ["$object.code", "$device.assetCode"] },
          "object.name": {
            $ifNull: ["$object.name", { $arrayElemAt: ["$model.name", 0] }],
          },
          "object.serial": { $ifNull: ["$object.serial", "$device.serial"] },
          referenceState: {
            $cond: [
              { $ne: [{ $ifNull: ["$document.code", null] }, null] },
              "LINKED",
              { $cond: ["$expectedReference", "MISSING", "NONE"] },
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          time: 1,
          businessDate: 1,
          type: 1,
          object: 1,
          quantityIn: 1,
          quantityOut: 1,
          balanceAfter: 1,
          balanceStatus: 1,
          document: 1,
          referenceState: 1,
          "actor.displayName": 1,
          note: 1,
          returnId: 1,
        },
      },
    );
    return this.paginated(this.transactions, pipeline, query, {
      time: -1,
      _id: -1,
    });
  }
}
