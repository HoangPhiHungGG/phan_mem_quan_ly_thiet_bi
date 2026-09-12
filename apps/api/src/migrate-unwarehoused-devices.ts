import { ConfigModule } from "@nestjs/config";
import { Connection, createConnection } from "mongoose";
import { Device, DeviceSchema } from "./equipment/equipment.schemas";
import { Warehouse, WarehouseSchema } from "./identity/identity.schemas";
import {
  AssetTransaction,
  AssetTransactionSchema,
} from "./inventory/inventory.schemas";

const TARGET_WAREHOUSE = /^\s*Kho\s+IT\s*$/i;
const ELIGIBLE_DEVICE = {
  isActive: true,
  usageStatus: "NOT_RECEIVED",
  warehouseId: null,
} as const;

async function migrateUnwarehousedDevices(
  connection: Connection,
  apply: boolean,
) {
  const devices = connection.model(Device.name, DeviceSchema);
  const warehouses = connection.model(Warehouse.name, WarehouseSchema);
  const transactions = connection.model(
    AssetTransaction.name,
    AssetTransactionSchema,
  );
  const matches = await warehouses
    .find({ name: TARGET_WAREHOUSE, isActive: true })
    .select("_id code name")
    .lean();
  if (matches.length === 0)
    throw new Error(
      "Không tìm thấy Kho IT. Không thực hiện cập nhật thiết bị cũ.",
    );
  if (matches.length > 1)
    throw new Error(
      "Có nhiều kho cùng tên Kho IT. Không thực hiện cập nhật thiết bị cũ.",
    );
  const warehouse = matches[0];
  const candidates = await devices
    .find(ELIGIBLE_DEVICE)
    .select("_id assetCode serial")
    .sort({ _id: 1 });
  if (!apply) {
    const migrationHistoryCount = await transactions.countDocuments({
      warehouseId: warehouse._id,
      source: "LEGACY_MIGRATION",
    });
    return {
      mode: "DRY_RUN" as const,
      warehouse: {
        id: String(warehouse._id),
        code: warehouse.code,
        name: warehouse.name,
      },
      found: candidates.length,
      migrated: 0,
      skipped: 0,
      migrationHistoryCount,
    };
  }

  await transactions.init();
  let migrated = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const session = await connection.startSession();
    let changed = false;
    try {
      await session.withTransaction(async () => {
        const device = await devices.findOneAndUpdate(
          { _id: candidate._id, ...ELIGIBLE_DEVICE },
          {
            $set: {
              warehouseId: warehouse._id,
              usageStatus: "IN_STOCK",
              receivedAt: new Date(),
            },
          },
          { new: true, session },
        );
        if (!device) {
          return;
        }
        await transactions.create(
          [
            {
              deviceId: device._id,
              warehouseId: warehouse._id,
              type: "INITIAL_RECEIPT",
              source: "LEGACY_MIGRATION",
              quantity: 1,
              assetCode: device.assetCode,
              serial: device.serial,
              createdBySystem: "SYSTEM_MIGRATION",
              note: "Thiết bị cũ được cập nhật vào Kho IT khi chuyển sang nghiệp vụ kho mới.",
            },
          ],
          { session },
        );
        changed = true;
      });
      if (changed) migrated += 1;
      else skipped += 1;
    } finally {
      await session.endSession();
    }
  }
  const migrationHistoryCount = await transactions.countDocuments({
    warehouseId: warehouse._id,
    source: "LEGACY_MIGRATION",
  });
  return {
    mode: "APPLY" as const,
    warehouse: {
      id: String(warehouse._id),
      code: warehouse.code,
      name: warehouse.name,
    },
    found: candidates.length,
    migrated,
    skipped,
    migrationHistoryCount,
  };
}

async function main() {
  await ConfigModule.forRoot({ envFilePath: [".env", "../../.env"] });
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const connection = await createConnection(uri, {
    serverSelectionTimeoutMS: 5_000,
  }).asPromise();
  try {
    const result = await migrateUnwarehousedDevices(
      connection,
      process.argv.includes("--apply"),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { ELIGIBLE_DEVICE, migrateUnwarehousedDevices };
