import { Types } from "mongoose";
import type { CurrentActor } from "../auth/auth.types";
import {
  bucketKeys,
  dashboardLoanAttention,
  scopedFilter,
} from "./dashboard.service";

function actor(overrides: Partial<CurrentActor> = {}): CurrentActor {
  return {
    userId: new Types.ObjectId(),
    sessionId: new Types.ObjectId(),
    employeeCode: "NV001",
    email: "nv001@example.com",
    displayName: "Người dùng",
    status: "ACTIVE",
    roleCodes: [],
    permissions: ["devices.read"],
    scopes: [],
    ...overrides,
  };
}

describe("Dashboard calculations", () => {
  it("classifies overdue, due-soon and active loans by calendar cutoff", () => {
    const today = new Date("2026-09-09T00:00:00+07:00");
    const soon = new Date("2026-09-16T00:00:00+07:00");
    expect(
      dashboardLoanAttention(new Date("2016-11-11T00:00:00Z"), today, soon),
    ).toBe("OVERDUE");
    expect(dashboardLoanAttention(today, today, soon)).toBe("DUE_SOON");
    expect(
      dashboardLoanAttention(new Date("2026-10-01T00:00:00Z"), today, soon),
    ).toBe("ACTIVE");
  });

  it("fills every daily and monthly chart bucket", () => {
    expect(
      bucketKeys(
        new Date("2026-09-07T00:00:00"),
        new Date("2026-09-09T12:00:00"),
        true,
      ),
    ).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
    expect(
      bucketKeys(
        new Date("2026-07-01T00:00:00"),
        new Date("2026-09-09T12:00:00"),
        false,
      ),
    ).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("does not expose unscoped data and preserves assigned warehouse scope", () => {
    expect(scopedFilter(actor(), "warehouseId", "departmentId")).toEqual({
      _id: { $exists: false },
    });
    const warehouseId = new Types.ObjectId().toString();
    const filter = scopedFilter(
      actor({
        scopes: [
          {
            warehouseMode: "ASSIGNED_WAREHOUSES",
            warehouseIds: [warehouseId],
            departmentMode: "SELF",
            departmentIds: [],
          },
        ],
      }),
      "warehouseId",
      "departmentId",
    );
    expect(filter).toEqual({
      $or: [{ warehouseId: { $in: [new Types.ObjectId(warehouseId)] } }],
    });
  });

  it("lets system administrators aggregate all records", () => {
    expect(
      scopedFilter(
        actor({ roleCodes: ["SYSTEM_ADMIN"] }),
        "warehouseId",
        "departmentId",
      ),
    ).toEqual({});
  });
});
