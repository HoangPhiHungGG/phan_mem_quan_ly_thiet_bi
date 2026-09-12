import { ConfigModule } from "@nestjs/config";
import {
  ClientSession,
  Collection,
  Connection,
  createConnection,
  Types,
} from "mongoose";
import {
  DisplayCodeCounter,
  DisplayCodeCounterSchema,
} from "./display-codes/display-code.schemas";
import {
  DisplayCodeService,
  displayCodePrefix,
  formatDisplayCode,
} from "./display-codes/display-code.service";

type LegacyDocument = {
  _id: Types.ObjectId;
  code: string;
  name?: string;
  displayName?: string;
  entityType?: "DEVICE" | "COMPONENT";
  deviceTypeId?: Types.ObjectId;
  componentTypeId?: Types.ObjectId;
  createdAt?: Date;
};

type MigrationBackup = {
  _id: string;
  collection: string;
  documentId: Types.ObjectId;
  oldCode: string;
  newCode: string;
  entity: string;
  migratedAt: Date;
};

type MigrationConfig = {
  collection: string;
  entity: string | ((document: LegacyDocument) => string);
};

const LEGACY_AUTO_CODE = /^(?:AUTO-.+|A-[A-F0-9]{18})$/i;
const CONFIGS: MigrationConfig[] = [
  { collection: "departments", entity: "DEPARTMENT" },
  { collection: "warehouses", entity: "WAREHOUSE" },
  { collection: "locations", entity: "LOCATION" },
  { collection: "positions", entity: "POSITION" },
  { collection: "suppliers", entity: "SUPPLIER" },
  { collection: "device_types", entity: "DEVICE_TYPE" },
  { collection: "component_types", entity: "COMPONENT_TYPE" },
  { collection: "units", entity: "UNIT" },
  {
    collection: "item_models",
    entity: (document) => {
      if (document.entityType === "COMPONENT" || document.componentTypeId)
        return "COMPONENT_MODEL";
      if (document.entityType === "DEVICE" || document.deviceTypeId)
        return "DEVICE_MODEL";
      return "ITEM_MODEL";
    },
  },
  { collection: "parts", entity: "COMPONENT" },
];

function entityFor(config: MigrationConfig, document: LegacyDocument) {
  return typeof config.entity === "function"
    ? config.entity(document)
    : config.entity;
}

async function updateOneCode(
  collection: Collection<LegacyDocument>,
  backups: Collection<MigrationBackup>,
  document: LegacyDocument,
  newCode: string,
  entity: string,
  session: ClientSession,
) {
  await session.withTransaction(async () => {
    await backups.insertOne(
      {
        _id: `${collection.collectionName}:${document._id.toHexString()}`,
        collection: collection.collectionName,
        documentId: document._id,
        oldCode: document.code,
        newCode,
        entity,
        migratedAt: new Date(),
      },
      { session },
    );
    const result = await collection.updateOne(
      { _id: document._id, code: document.code },
      { $set: { code: newCode } },
      { session },
    );
    if (result.modifiedCount !== 1)
      throw new Error(
        `DISPLAY_CODE_MIGRATION_CONCURRENT_UPDATE:${collection.collectionName}:${document._id.toHexString()}`,
      );
  });
}

async function migrate(connection: Connection, apply: boolean) {
  const counters = connection.model(
    DisplayCodeCounter.name,
    DisplayCodeCounterSchema,
  );
  await counters.init();
  const generator = new DisplayCodeService(counters);
  const backups = connection.collection<MigrationBackup>(
    "display_code_migration_backups",
  );
  const simulated = new Map<string, number>();
  const reserved = new Map<string, Set<string>>();
  const summary: Record<string, { found: number; migrated: number }> = {};

  for (const config of CONFIGS) {
    const collection = connection.collection<LegacyDocument>(config.collection);
    const documents = await collection
      .find(
        { code: LEGACY_AUTO_CODE },
        {
          projection: {
            code: 1,
            name: 1,
            displayName: 1,
            entityType: 1,
            deviceTypeId: 1,
            componentTypeId: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    summary[config.collection] = { found: documents.length, migrated: 0 };

    for (const document of documents) {
      const name = document.name?.trim() || document.displayName?.trim() || "X";
      const entity = entityFor(config, document);
      let newCode: string;
      if (apply) {
        newCode = await generator.nextCode(entity, name, async (candidate) =>
          Boolean(
            await collection.countDocuments({ code: candidate }, { limit: 1 }),
          ),
        );
        const session = await connection.startSession();
        try {
          await updateOneCode(
            collection,
            backups,
            document,
            newCode,
            entity,
            session,
          );
        } finally {
          await session.endSession();
        }
        summary[config.collection].migrated += 1;
      } else {
        const prefix = displayCodePrefix(name);
        const key = `${entity}:${prefix}`;
        let sequence = simulated.get(key) ?? 0;
        const collectionReserved = reserved.get(config.collection) ?? new Set();
        do {
          sequence += 1;
          newCode = formatDisplayCode(prefix, sequence);
        } while (
          collectionReserved.has(newCode) ||
          (await collection.countDocuments({ code: newCode }, { limit: 1 })) > 0
        );
        simulated.set(key, sequence);
        collectionReserved.add(newCode);
        reserved.set(config.collection, collectionReserved);
      }
      process.stdout.write(
        `${apply ? "MIGRATE" : "DRY-RUN"} ${config.collection} ${document._id.toHexString()} ${document.code} -> ${newCode}\n`,
      );
    }
  }
  return summary;
}

async function main() {
  await ConfigModule.forRoot({ envFilePath: [".env", "../../.env"] });
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const apply = process.argv.includes("--apply");
  const connection = await createConnection(uri, {
    serverSelectionTimeoutMS: 5_000,
  }).asPromise();
  try {
    const summary = await migrate(connection, apply);
    process.stdout.write(
      `${JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", summary }, null, 2)}\n`,
    );
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

export { LEGACY_AUTO_CODE, migrate };
