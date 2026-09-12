import { createConnection, Types } from "mongoose";
import {
  DisplayCodeCounter,
  DisplayCodeCounterSchema,
} from "./display-code.schemas";
import {
  DisplayCodeService,
  displayCodePrefix,
  formatDisplayCode,
} from "./display-code.service";

describe("display code formatting", () => {
  it.each([
    ["RAM", "R"],
    ["Máy in", "M"],
    ["Ổ cứng", "O"],
    ["870 EVO 500GB", "E"],
    ["500GB SSD", "S"],
    ["12345", "X"],
  ])("extracts prefix from %s", (name, prefix) => {
    expect(displayCodePrefix(name)).toBe(prefix);
  });

  it("uses four digits and expands without a hard limit", () => {
    expect(formatDisplayCode("R", 1)).toBe("R0001");
    expect(formatDisplayCode("R", 10_000)).toBe("R10000");
  });
});

const integration = process.env.DISPLAY_CODE_TEST_MONGODB_URI
  ? describe
  : describe.skip;

integration("atomic display code counter", () => {
  const database = `pmqltb_display_code_test_${new Types.ObjectId().toHexString()}`;
  const connection = createConnection();
  let service: DisplayCodeService;

  beforeAll(async () => {
    await connection.openUri(process.env.DISPLAY_CODE_TEST_MONGODB_URI!, {
      dbName: database,
      serverSelectionTimeoutMS: 5_000,
    });
    const counters = connection.model(
      DisplayCodeCounter.name,
      DisplayCodeCounterSchema,
    );
    await counters.init();
    service = new DisplayCodeService(counters);
  });

  afterAll(async () => {
    if (connection.readyState) {
      if (
        connection.name === database &&
        database.startsWith("pmqltb_display_code_test_")
      )
        await connection.dropDatabase();
      await connection.close();
    }
  });

  it("separates sequences by entity and remains unique under concurrency", async () => {
    const available = () => Promise.resolve(false);
    expect(await service.nextCode("COMPONENT_TYPE", "RAM", available)).toBe(
      "R0001",
    );
    expect(await service.nextCode("COMPONENT_TYPE", "Router", available)).toBe(
      "R0002",
    );
    expect(await service.nextCode("COMPONENT_MODEL", "RAM", available)).toBe(
      "R0001",
    );
    expect(await service.nextCode("COMPONENT_TYPE", "SSD", available)).toBe(
      "S0001",
    );
    expect(
      await service.nextCode("COMPONENT_MODEL", "Kingston", available),
    ).toBe("K0001");
    expect(
      await service.nextCode("COMPONENT_MODEL", "870 EVO 500GB", available),
    ).toBe("E0001");
    const concurrent = await Promise.all(
      Array.from({ length: 40 }, () =>
        service.nextCode("DEVICE_TYPE", "Laptop", available),
      ),
    );
    expect(new Set(concurrent).size).toBe(40);
    expect(concurrent).toEqual(expect.arrayContaining(["L0001", "L0040"]));
  });

  it("continues the stored sequence after a service reload", async () => {
    const reloaded = new DisplayCodeService(
      connection.model<DisplayCodeCounter>(DisplayCodeCounter.name),
    );
    await expect(
      reloaded.nextCode("COMPONENT_TYPE", "RAM", () => Promise.resolve(false)),
    ).resolves.toBe("R0003");
  });
});
