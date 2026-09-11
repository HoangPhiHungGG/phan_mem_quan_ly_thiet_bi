"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Box,
  Boxes,
  Building2,
  ClipboardCheck,
  Download,
  FileText,
  Package,
  Printer,
  RefreshCw,
  Repeat,
  Send,
  Trash2,
  Undo2,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type ReportKey =
  | "assets"
  | "parts"
  | "inventory"
  | "receipts"
  | "issues"
  | "loans"
  | "overdue"
  | "transfers"
  | "recoveries"
  | "repairs"
  | "inventories"
  | "liquidations"
  | "employees"
  | "departments"
  | "summary";
type Column = {
  key: string;
  label: string;
  type?: "date" | "number" | "money" | "status";
  detail?: string;
};
type ReportResult = {
  data: {
    type: ReportKey;
    title: string;
    columns: Column[];
    rows: Record<string, unknown>[];
    summary: { records: number; quantity: number; amount: number };
  };
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    truncated?: boolean;
  };
};
type Option = {
  _id: string;
  name?: string;
  displayName?: string;
  code?: string;
};
type Filters = {
  from: string;
  to: string;
  warehouseId: string;
  departmentId: string;
  employeeId: string;
  deviceTypeId: string;
  modelId: string;
  supplierId: string;
  techCondition: string;
  assetType: string;
  status: string;
  q: string;
};

const REPORTS: {
  key: ReportKey;
  label: string;
  group: string;
  icon: typeof Box;
  filters: string[];
}[] = [
  {
    key: "assets",
    label: "Danh sách thiết bị",
    group: "Tài sản",
    icon: Box,
    filters: [
      "date",
      "warehouse",
      "department",
      "employee",
      "deviceType",
      "model",
      "supplier",
      "condition",
      "status",
      "search",
    ],
  },
  {
    key: "parts",
    label: "Tồn linh kiện",
    group: "Tài sản",
    icon: Package,
    filters: ["warehouse", "search"],
  },
  {
    key: "inventory",
    label: "Tổng hợp tồn kho",
    group: "Kho",
    icon: Warehouse,
    filters: ["warehouse"],
  },
  {
    key: "receipts",
    label: "Nhập kho",
    group: "Kho",
    icon: Boxes,
    filters: ["date", "warehouse", "assetType", "status", "search"],
  },
  {
    key: "issues",
    label: "Cấp phát",
    group: "Nghiệp vụ",
    icon: Send,
    filters: [
      "date",
      "warehouse",
      "department",
      "employee",
      "status",
      "search",
    ],
  },
  {
    key: "loans",
    label: "Mượn / trả",
    group: "Nghiệp vụ",
    icon: Repeat,
    filters: [
      "date",
      "warehouse",
      "department",
      "employee",
      "status",
      "search",
    ],
  },
  {
    key: "overdue",
    label: "Mượn quá hạn",
    group: "Nghiệp vụ",
    icon: BarChart3,
    filters: ["warehouse", "department", "employee", "search"],
  },
  {
    key: "transfers",
    label: "Điều chuyển",
    group: "Nghiệp vụ",
    icon: RefreshCw,
    filters: ["date", "warehouse", "department", "status", "search"],
  },
  {
    key: "recoveries",
    label: "Thu hồi",
    group: "Nghiệp vụ",
    icon: Undo2,
    filters: [
      "date",
      "warehouse",
      "department",
      "employee",
      "status",
      "search",
    ],
  },
  {
    key: "repairs",
    label: "Sửa chữa",
    group: "Vòng đời tài sản",
    icon: Wrench,
    filters: ["date", "status", "search"],
  },
  {
    key: "inventories",
    label: "Kiểm kê",
    group: "Vòng đời tài sản",
    icon: ClipboardCheck,
    filters: ["date", "warehouse", "department", "status", "search"],
  },
  {
    key: "liquidations",
    label: "Thanh lý",
    group: "Vòng đời tài sản",
    icon: Trash2,
    filters: ["date", "warehouse", "department", "status", "search"],
  },
  {
    key: "employees",
    label: "Tài sản theo nhân viên",
    group: "Nhân sự",
    icon: Users,
    filters: ["department", "employee", "search"],
  },
  {
    key: "departments",
    label: "Tài sản theo bộ phận",
    group: "Nhân sự",
    icon: Building2,
    filters: ["department", "search"],
  },
  {
    key: "summary",
    label: "Tổng hợp tài sản",
    group: "Tổng hợp",
    icon: FileText,
    filters: ["date"],
  },
];
const initial: Filters = {
  from: "",
  to: "",
  warehouseId: "",
  departmentId: "",
  employeeId: "",
  deviceTypeId: "",
  modelId: "",
  supplierId: "",
  techCondition: "",
  assetType: "",
  status: "",
  q: "",
};
const STATUS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ xử lý",
  ACTIVE: "Đang hoạt động",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  RETURNED: "Đã trả",
  PARTIALLY_RETURNED: "Trả một phần",
  IN_STOCK: "Trong kho",
  IN_USE: "Đang sử dụng",
  LENT: "Đang mượn",
  IN_TRANSIT: "Đang điều chuyển",
  REPAIRING: "Đang sửa chữa",
  DISPOSED: "Đã thanh lý",
  GOOD: "Tốt",
  DEGRADED: "Xuống cấp",
  BROKEN: "Hỏng",
  DEVICE: "Thiết bị",
  PART: "Linh kiện",
  AVAILABLE: "Còn hàng",
  LOW: "Sắp hết",
  OUT: "Hết hàng",
  SYSTEM: "Toàn hệ thống",
  WAREHOUSE: "Theo kho",
  DEPARTMENT: "Theo bộ phận",
  LOCATION: "Theo vị trí",
  SALE: "Bán",
  DESTROY: "Tiêu hủy",
  DONATE: "Cho/tặng",
  TRANSFER: "Điều chuyển",
  OTHER: "Khác",
};
const nf = new Intl.NumberFormat("vi-VN");
const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const fd = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString("vi-VN") : "—";
const format = (v: unknown, c: Column) =>
  v === null || v === undefined || v === ""
    ? "—"
    : c.type === "date"
      ? fd(v)
      : c.type === "money"
        ? money.format(Number(v))
        : c.type === "number"
          ? nf.format(Number(v))
          : c.type === "status"
            ? (STATUS[String(v)] ?? String(v))
            : String(v);
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export default function ReportsPage() {
  const [selected, setSelected] = useState<ReportKey>("assets");
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState("date:desc");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<Option[]>([]);
  const [models, setModels] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const config = REPORTS.find((r) => r.key === selected)!;
  const query = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    });
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters, page, limit, sort]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(
        await apiFetch<ReportResult>(`/api/reports/${selected}?${query}`),
      );
    } catch {
      setError("Không thể tải dữ liệu báo cáo.");
    } finally {
      setLoading(false);
    }
  }, [selected, query]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    Promise.allSettled([
      apiFetch<{ data: Option[] }>("/api/catalog/warehouses?limit=100"),
      apiFetch<{ data: Option[] }>("/api/catalog/departments?limit=100"),
      apiFetch<{ data: Option[] }>("/api/catalog/keepers?limit=100"),
      apiFetch<{ data: Option[] }>("/api/catalog/device-types?limit=100"),
      apiFetch<{ data: Option[] }>("/api/catalog/device-models?limit=100"),
      apiFetch<{ data: Option[] }>("/api/catalog/suppliers?limit=100"),
    ]).then(([w, d, e, t, m, s]) => {
      if (w.status === "fulfilled") setWarehouses(w.value.data);
      if (d.status === "fulfilled") setDepartments(d.value.data);
      if (e.status === "fulfilled") setEmployees(e.value.data);
      if (t.status === "fulfilled") setDeviceTypes(t.value.data);
      if (m.status === "fulfilled") setModels(m.value.data);
      if (s.status === "fulfilled") setSuppliers(s.value.data);
    });
  }, []);
  const choose = (key: ReportKey) => {
    setSelected(key);
    setPage(1);
    setDraft(initial);
    setFilters(initial);
    setSort("date:desc");
  };
  const apply = () => {
    setPage(1);
    setFilters(draft);
  };
  const reset = () => {
    setDraft(initial);
    setFilters(initial);
    setPage(1);
  };
  const exportRows = async (formatName: "xlsx" | "pdf" | "print") => {
    setExporting(formatName);
    try {
      const p = new URLSearchParams(query);
      p.set("export", "true");
      p.set("format", formatName);
      const all = await apiFetch<ReportResult>(`/api/reports/${selected}?${p}`);
      if (formatName === "xlsx") {
        const values = all.data.rows.map((row) =>
          Object.fromEntries(
            all.data.columns.map((c) => [c.label, format(row[c.key], c)]),
          ),
        );
        const ws = XLSX.utils.json_to_sheet(values);
        ws["!cols"] = all.data.columns.map((c) => ({
          wch: Math.max(14, c.label.length + 4),
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Báo cáo");
        XLSX.writeFile(
          wb,
          `BaoCao_${selected}_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`,
        );
      } else printReport(all, formatName === "pdf");
    } catch {
      setError("Không thể xuất dữ liệu báo cáo.");
    } finally {
      setExporting("");
    }
  };
  return (
    <div className="space-y-5 print:space-y-3">
      <PageHeader
        title="Báo cáo"
        description="Tổng hợp, phân tích và xuất dữ liệu quản lý tài sản."
      />
      <section className="space-y-4 print:hidden">
        {[...new Set(REPORTS.map((r) => r.group))].map((group) => (
          <div key={group}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {REPORTS.filter((r) => r.group === group).map((r) => (
                <button
                  key={r.key}
                  onClick={() => choose(r.key)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm transition hover:border-secondary",
                    selected === r.key &&
                      "border-secondary bg-secondary/5 ring-1 ring-secondary",
                  )}
                >
                  <span className="rounded-md bg-muted p-2">
                    <r.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{config.label}</h2>
              <p className="text-xs text-muted-foreground">
                Dữ liệu nghiệp vụ theo bộ lọc đã chọn
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
                onClick={() => void exportRows("xlsx")}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Xuất Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
                onClick={() => void exportRows("pdf")}
              >
                <FileText className="mr-1.5 h-4 w-4" />
                Xuất PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
                onClick={() => void exportRows("print")}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                In
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 print:hidden">
            {config.filters.includes("date") && (
              <>
                <Field label="Từ ngày">
                  <input
                    type="date"
                    value={draft.from}
                    onChange={(e) =>
                      setDraft({ ...draft, from: e.target.value })
                    }
                  />
                </Field>
                <Field label="Đến ngày">
                  <input
                    type="date"
                    value={draft.to}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  />
                </Field>
              </>
            )}
            {config.filters.includes("warehouse") && (
              <Select
                label="Kho"
                value={draft.warehouseId}
                options={warehouses}
                onChange={(v) => setDraft({ ...draft, warehouseId: v })}
              />
            )}{" "}
            {config.filters.includes("department") && (
              <Select
                label="Bộ phận"
                value={draft.departmentId}
                options={departments}
                onChange={(v) => setDraft({ ...draft, departmentId: v })}
              />
            )}{" "}
            {config.filters.includes("employee") && (
              <Select
                label="Nhân viên"
                value={draft.employeeId}
                options={employees}
                onChange={(v) => setDraft({ ...draft, employeeId: v })}
              />
            )}{" "}
            {config.filters.includes("deviceType") && (
              <Select
                label="Loại thiết bị"
                value={draft.deviceTypeId}
                options={deviceTypes}
                onChange={(v) => setDraft({ ...draft, deviceTypeId: v })}
              />
            )}
            {config.filters.includes("model") && (
              <Select
                label="Model"
                value={draft.modelId}
                options={models}
                onChange={(v) => setDraft({ ...draft, modelId: v })}
              />
            )}
            {config.filters.includes("supplier") && (
              <Select
                label="Hãng/Nhà cung cấp"
                value={draft.supplierId}
                options={suppliers}
                onChange={(v) => setDraft({ ...draft, supplierId: v })}
              />
            )}
            {config.filters.includes("condition") && (
              <Field label="Tình trạng">
                <select
                  value={draft.techCondition}
                  onChange={(e) =>
                    setDraft({ ...draft, techCondition: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  <option value="GOOD">Tốt</option>
                  <option value="DEGRADED">Xuống cấp</option>
                  <option value="BROKEN">Hỏng</option>
                </select>
              </Field>
            )}
            {config.filters.includes("assetType") && (
              <Field label="Loại tài sản">
                <select
                  value={draft.assetType}
                  onChange={(e) =>
                    setDraft({ ...draft, assetType: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  <option value="DEVICE">Thiết bị</option>
                  <option value="PART">Linh kiện</option>
                </select>
              </Field>
            )}
            {config.filters.includes("status") && (
              <Field label="Trạng thái">
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  {Object.entries(STATUS)
                    .slice(0, 16)
                    .map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                </select>
              </Field>
            )}{" "}
            {config.filters.includes("search") && (
              <Field label="Tìm kiếm">
                <input
                  placeholder="Mã, tên, serial..."
                  value={draft.q}
                  onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                />
              </Field>
            )}
          </div>
          <div className="mt-3 flex gap-2 print:hidden">
            <Button size="sm" onClick={apply}>
              Áp dụng
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              Đặt lại
            </Button>
          </div>
        </div>
        {result && (
          <div className="grid gap-3 border-b bg-muted/20 p-4 sm:grid-cols-3">
            <Summary label="Tổng bản ghi" value={result.data.summary.records} />
            <Summary
              label="Tổng số lượng"
              value={result.data.summary.quantity}
            />
            {result.data.summary.amount > 0 && (
              <Summary
                label="Tổng giá trị"
                value={money.format(result.data.summary.amount)}
              />
            )}
          </div>
        )}
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            className="m-5"
            title="Không thể tải dữ liệu báo cáo."
            description="Vui lòng kiểm tra kết nối và thử lại."
            action={{ label: "Thử lại", onClick: () => void load() }}
          />
        ) : result?.data.rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {result.data.columns.map((c) => (
                      <th
                        key={c.key}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                      >
                        <button
                          className="hover:text-foreground"
                          onClick={() =>
                            setSort(
                              `${c.key}:${sort === `${c.key}:asc` ? "desc" : "asc"}`,
                            )
                          }
                        >
                          {c.label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.data.rows.map((row, i) => (
                    <tr
                      key={String(row._id ?? row.detailId ?? i)}
                      className="hover:bg-muted/30"
                    >
                      {result.data.columns.map((c) => (
                        <td key={c.key} className="max-w-[320px] px-4 py-3">
                          {c.detail && row.detailId ? (
                            <Link
                              className="font-medium text-secondary hover:underline"
                              href={`${c.detail}${row.detailId}`}
                            >
                              {format(row[c.key], c)}
                            </Link>
                          ) : (
                            format(row[c.key], c)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={result.meta}
              page={page}
              limit={limit}
              onPage={setPage}
              onLimit={(v) => {
                setLimit(v);
                setPage(1);
              }}
            />
          </>
        ) : (
          <EmptyState
            className="m-5"
            title="Không có dữ liệu phù hợp với bộ lọc hiện tại."
            action={{ label: "Đặt lại bộ lọc", onClick: reset }}
          />
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <div className="[&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:bg-background [&_input]:px-3 [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:bg-background [&_select]:px-3">
        {children}
      </div>
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tất cả</option>
        {options.map((o) => (
          <option key={o._id} value={o._id}>
            {o.name ?? o.displayName ?? o.code}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {typeof value === "number" ? nf.format(value) : value}
      </p>
    </div>
  );
}
function Pagination({
  meta,
  page,
  limit,
  onPage,
  onLimit,
}: {
  meta: ReportResult["meta"];
  page: number;
  limit: number;
  onPage: (n: number) => void;
  onLimit: (n: number) => void;
}) {
  const from = meta.total ? (page - 1) * limit + 1 : 0,
    to = Math.min(page * limit, meta.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm print:hidden">
      <span className="text-muted-foreground">
        Hiển thị {nf.format(from)}–{nf.format(to)} / {nf.format(meta.total)} bản
        ghi
      </span>
      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded border bg-background px-2"
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
        >
          {[20, 50, 100].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Trước
        </Button>
        <span>
          Trang {page}/{meta.totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= meta.totalPages}
          onClick={() => onPage(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}
function printReport(report: ReportResult, pdf: boolean) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("POPUP_BLOCKED");
  const heads = report.data.columns
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join("");
  const rows = report.data.rows
    .map(
      (row) =>
        `<tr>${report.data.columns.map((c) => `<td>${escapeHtml(format(row[c.key], c))}</td>`).join("")}</tr>`,
    )
    .join("");
  popup.document.write(
    `<!doctype html><html><head><title>${escapeHtml(report.data.title)}</title><style>@page{size:A4 landscape;margin:14mm}body{font:12px Arial;color:#111}h1{font-size:18px;margin:0}h2{font-size:15px;margin:6px 0 2px}.meta{color:#555;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}footer{position:fixed;bottom:0;font-size:10px;color:#666}</style></head><body><h1>HỆ THỐNG QUẢN LÝ THIẾT BỊ</h1><h2>${escapeHtml(report.data.title)}</h2><p class="meta">Ngày xuất: ${new Date().toLocaleString("vi-VN")} · Tổng bản ghi: ${report.meta.total}${pdf ? " · Chọn ‘Lưu dưới dạng PDF’ trong hộp thoại in" : ""}</p><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table><footer>PMQLTB · Báo cáo được tạo từ dữ liệu hệ thống</footer><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`,
  );
  popup.document.close();
}
