import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ReportQueryDto, REPORT_TYPES } from "./report.dto";

describe("Report query contract", () => {
  it("exposes every implemented report type", () => {
    expect(REPORT_TYPES).toEqual(
      expect.arrayContaining([
        "assets",
        "parts",
        "inventory",
        "receipts",
        "issues",
        "loans",
        "overdue",
        "transfers",
        "recoveries",
        "repairs",
        "inventories",
        "liquidations",
        "employees",
        "departments",
        "summary",
      ]),
    );
  });

  it("rejects invalid object ids and oversized pages", async () => {
    const query = plainToInstance(ReportQueryDto, {
      warehouseId: "not-an-id",
      limit: "1000",
    });
    const errors = await validate(query);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["warehouseId", "limit"]),
    );
  });

  it("transforms valid pagination and export options", async () => {
    const query = plainToInstance(ReportQueryDto, {
      page: "2",
      limit: "50",
      export: "true",
      format: "xlsx",
    });
    expect(await validate(query)).toHaveLength(0);
    expect(query).toMatchObject({ page: 2, limit: 50, export: true });
  });
});
