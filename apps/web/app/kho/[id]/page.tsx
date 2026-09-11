"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Eye,
  History,
  Laptop,
  PackageCheck,
  RefreshCw,
  UserRound,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { TransactionDetailButton } from "@/components/operations/transaction-detail-button";
import { Input, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useWarehouseSelection } from "@/components/inventory/warehouse-selection";
import {
  DEVICE_TYPE_LABELS,
  USAGE_STATUS_LABELS,
  loadCatalogOptions,
  CatalogOption,
} from "@/lib/catalogs";

type Ref = {
  _id?: string;
  name?: string;
  code?: string;
  displayName?: string;
  manufacturer?: string;
};
type Warehouse = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  address?: string;
  managerKeeperId?: Ref;
  isActive: boolean;
};
type Summary = {
  warehouse: Warehouse;
  storageLocationCount: number;
  devices: { total: number; available: number; inUse: number; lent: number };
  parts: {
    types: number;
    quantity: number;
    low: number;
    out: number;
    missingParts: number;
    negativeBalances: number;
  };
};
type Device = {
  _id: string;
  assetCode: string;
  name?: string;
  serial?: string;
  model?: Ref;
  deviceType?: Ref;
  keeper?: Ref;
  location?: Ref;
  usageStatus: string;
  techCondition: string;
};
type Part = {
  _id: string;
  partId: string;
  quantity: number;
  stockStatus: string;
  part?: { code?: string; name?: string; minQty?: number; isActive?: boolean };
  unit?: Ref;
  componentType?: Ref;
  model?: Ref;
};
type Transaction = {
  _id: string;
  time?: string;
  businessDate?: string;
  type: string;
  object: {
    kind: string;
    id?: string;
    code?: string;
    name?: string;
    serial?: string;
  };
  quantityIn: number;
  quantityOut: number;
  balanceAfter: number | null;
  balanceStatus: string;
  referenceState: string;
  document?: { id: string; code?: string; kind: string; type?: string };
  actor?: Ref;
  note?: string;
  returnId?: string;
};
type Meta = { page: number; total: number; totalPages: number; limit: number };
type Operation = {
  code: string;
  type: string;
  status: string;
  operationDate: string;
  reason: string;
  note?: string;
  sourceWarehouseId?: Ref;
  destinationWarehouseId?: Ref;
  receiverKeeperId?: Ref;
  receiverDepartmentId?: Ref;
  createdBy?: Ref;
  dispatchedBy?: Ref;
  lines: {
    kind: string;
    quantity: number;
    deviceId?: { assetCode?: string; serial?: string };
    partId?: Ref;
    deviceName?: string;
    assetCode?: string;
    serial?: string;
    returned?: boolean;
    conditionOut?: string;
    conditionIn?: string;
    handoverCondition?: string;
    accessoryNote?: string;
    note?: string;
  }[];
  returnHistory?: {
    _id: string;
    returnedAt: string;
    receivedBy?: Ref;
    note?: string;
    items: {
      assetCode?: string;
      deviceName?: string;
      conditionIn: string;
      note?: string;
    }[];
  }[];
};
const transactionOptions = [
  ["OPENING", "Nhập kho (đầu kỳ)"],
  ["RECEIPT", "Nhập kho"],
  ["OUT", "Xuất kho"],
  ["ISSUE", "Cấp phát"],
  ["LOAN", "Mượn"],
  ["RETURN", "Trả"],
  ["TRANSFER_IN", "Điều chuyển vào"],
  ["TRANSFER_OUT", "Điều chuyển ra"],
  ["RECOVERY", "Thu hồi"],
  ["ADJUSTMENT_IN", "Điều chỉnh tăng"],
  ["ADJUSTMENT_OUT", "Điều chỉnh giảm"],
  ["DISPOSAL", "Thanh lý"],
  ["LOST", "Ghi nhận mất"],
].map(([value, label]) => ({ value, label }));
const usageOptions = [
  { value: "AVAILABLE", label: "Khả dụng" },
  ...Object.entries({
    ...USAGE_STATUS_LABELS,
    IN_TRANSIT: "Đang vận chuyển",
  }).map(([value, label]) => ({ value, label })),
];
const stockOptions = [
  { value: "AVAILABLE", label: "Còn hàng" },
  { value: "LOW", label: "Sắp hết" },
  { value: "OUT", label: "Hết hàng" },
];
const number = (value: number) => value.toLocaleString("vi-VN");
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "Chưa có thời gian";
const unitLabel = (value?: string) => {
  if (!value) return "—";
  const map: Record<string, string> = {
    cai: "Cái",
    chiec: "Chiếc",
    bo: "Bộ",
    soi: "Sợi",
    hop: "Hộp",
    thanh: "Thanh",
    cuon: "Cuộn",
  };
  return map[value.trim().toLowerCase()] ?? value;
};
const condition = (value?: string) =>
  ({
    ...DEVICE_TYPE_LABELS,
    NORMAL: "Bình thường",
    SCRATCHED: "Trầy xước",
    MINOR_FAULT: "Lỗi nhẹ",
    MISSING_ACCESSORIES: "Thiếu phụ kiện",
    LOST: "Mất thiết bị",
    OTHER: "Khác",
  })[value ?? ""] ??
  value ??
  "—";
function StockBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "AVAILABLE"
          ? "success"
          : status === "LOW"
            ? "warning"
            : "destructive"
      }
    >
      {stockOptions.find((option) => option.value === status)?.label ??
        (status === "INVALID" ? "Số dư âm" : "Chưa xác định")}
    </Badge>
  );
}
function UsageBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "IN_STOCK"
          ? "success"
          : ["REPAIRING", "LOST"].includes(status)
            ? "destructive"
            : status === "DISPOSED"
              ? "secondary"
              : "default"
      }
    >
      {{ ...USAGE_STATUS_LABELS, IN_TRANSIT: "Đang vận chuyển" }[status] ??
        status}
    </Badge>
  );
}
function Pager({
  meta,
  page,
  onPage,
  loading,
}: {
  meta: Meta | null;
  page: number;
  onPage: (page: number) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm">
      <span className="text-muted-foreground">
        {meta
          ? `${number(meta.total)} kết quả · Trang ${page}/${meta.totalPages}`
          : "Đang tải kết quả…"}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Trước
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || !meta || page >= meta.totalPages}
          onClick={() => onPage(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}
function usePage<T>(url: string | null, version: number) {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    setData([]);
    setMeta(null);
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void apiFetch<{ data: T[]; meta: Meta }>(url)
        .then((result) => {
          if (!cancelled) {
            setData(result.data);
            setMeta(result.meta);
          }
        })
        .catch((e) => {
          if (!cancelled)
            setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, version]);
  return { data, meta, loading, error };
}

export default function WarehouseDetailPage() {
  const params = useParams<{ id: string }>();
  const warehouseId = useWarehouseSelection();
  const embedded = Boolean(warehouseId);
  const id = warehouseId ?? params.id;
  const { hasPermission } = useAuth();
  const canDevices = hasPermission("devices.read"),
    canParts = hasPermission("parts.read"),
    canCatalog = hasPermission("catalog.read"),
    canWarehouse = hasPermission("warehouses.read");
  const canSummary = canDevices && canParts && canWarehouse;
  const canHistory =
    canDevices &&
    canParts &&
    hasPermission("operations.read") &&
    hasPermission("receipts.read");
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [version, setVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<"devices" | "parts" | "history">(
    "devices",
  );
  const [types, setTypes] = useState<CatalogOption[]>([]);
  const [componentTypes, setComponentTypes] = useState<CatalogOption[]>([]);
  const [deviceFilters, setDeviceFilters] = useState({
    q: "",
    status: "",
    deviceTypeId: "",
    page: 1,
  });
  const [partFilters, setPartFilters] = useState({
    q: "",
    status: "",
    componentTypeId: "",
    page: 1,
  });
  const [historyFilters, setHistoryFilters] = useState({
    q: "",
    type: "",
    from: "",
    to: "",
    partId: "",
    partLabel: "",
    page: 1,
  });
  const historyRef = useRef<HTMLElement>(null);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(
    null,
  );
  const [opening, setOpening] = useState(false);
  const base = `/api/inventory/warehouses/${id}`;
  const devices = usePage<Device>(
    canDevices
      ? `${base}/devices?${new URLSearchParams({ q: deviceFilters.q, status: deviceFilters.status, deviceTypeId: deviceFilters.deviceTypeId, page: String(deviceFilters.page), limit: "20" })}`
      : null,
    version,
  );
  const parts = usePage<Part>(
    canParts
      ? `${base}/parts?${new URLSearchParams({ q: partFilters.q, status: partFilters.status, componentTypeId: partFilters.componentTypeId, page: String(partFilters.page), limit: "20" })}`
      : null,
    version,
  );
  const history = usePage<Transaction>(
    canHistory
      ? `${base}/history?${new URLSearchParams({ q: historyFilters.q, type: historyFilters.type, from: historyFilters.from, to: historyFilters.to, partId: historyFilters.partId, page: String(historyFilters.page), limit: "20" })}`
      : null,
    version,
  );
  useEffect(() => {
    let cancelled = false;
    setError("");
    setLoadingSummary(true);
    setSummary(null);
    setWarehouse(null);
    if (!canWarehouse) {
      setLoadingSummary(false);
      return;
    }
    void (
      canSummary
        ? apiFetch<{ data: Summary }>(base).then((result) => {
            if (!cancelled) {
              setSummary(result.data);
              setWarehouse(result.data.warehouse);
            }
          })
        : apiFetch<{ data: Warehouse[] }>("/api/warehouses").then((result) => {
            if (!cancelled)
              setWarehouse(result.data.find((item) => item._id === id) ?? null);
          })
    )
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Không thể tải thông tin kho.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base, id, version, canSummary, canWarehouse]);
  useEffect(() => {
    if (canCatalog)
      void Promise.all([
        loadCatalogOptions("device-types"),
        loadCatalogOptions("component-types"),
      ])
        .then(([deviceTypes, partTypes]) => {
          setTypes(deviceTypes);
          setComponentTypes(partTypes);
        })
        .catch((e) =>
          setError(
            e instanceof Error ? e.message : "Không thể tải loại thiết bị.",
          ),
        );
  }, [canCatalog]);
  useEffect(() => {
    setDeviceFilters({ q: "", status: "", deviceTypeId: "", page: 1 });
    setPartFilters({ q: "", status: "", componentTypeId: "", page: 1 });
    setHistoryFilters({
      q: "",
      type: "",
      from: "",
      to: "",
      partId: "",
      partLabel: "",
      page: 1,
    });
  }, [id]);
  async function openOperation(transaction: Transaction) {
    if (!transaction.document?.id) return;
    setOpening(true);
    setError("");
    try {
      const result = await apiFetch<{ data: Operation }>(
        `/api/operations/${transaction.document.id}`,
      );
      setSelectedOperation(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải phiếu.");
    } finally {
      setOpening(false);
    }
  }
  function partHistory(item: Part) {
    setActiveTab("history");
    setHistoryFilters({
      q: "",
      type: "",
      from: "",
      to: "",
      partId: item.partId,
      partLabel:
        [item.part?.code, item.part?.name].filter(Boolean).join(" · ") ||
        item.partId,
      page: 1,
    });
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const stats = [
    { label: "Tổng thiết bị", value: summary?.devices.total, icon: Laptop },
    {
      label: "Thiết bị khả dụng",
      value: summary?.devices.available,
      icon: CheckCircle2,
    },
    { label: "Đang sử dụng", value: summary?.devices.inUse, icon: UserRound },
    {
      label: "Đang cho mượn",
      value: summary?.devices.lent,
      icon: PackageCheck,
    },
    { label: "Tổng loại linh kiện", value: summary?.parts.types, icon: Boxes },
    {
      label: "Sắp hết / Hết hàng",
      value: summary ? summary.parts.low + summary.parts.out : undefined,
      icon: History,
    },
  ];
  const tableState = (
    state: { loading: boolean; error: string; data: unknown[] },
    cols: number,
  ) =>
    state.loading || state.error || !state.data.length ? (
      <tr>
        <td
          colSpan={cols}
          className={`p-8 text-center ${state.error ? "text-red-700" : "text-muted-foreground"}`}
        >
          {state.loading
            ? "Đang tải…"
            : state.error || "Không có dữ liệu phù hợp."}
        </td>
      </tr>
    ) : null;
  return (
    <div className="space-y-8">
      {!embedded && (
        <Link
          href="/kho"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Danh sách kho
        </Link>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!embedded && (
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Chi tiết kho
            </p>
          )}
          <h1 className="mt-1 text-3xl font-bold">
            {warehouse?.name ??
              (loadingSummary ? "Đang tải kho…" : "Thông tin kho")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Quản lý tồn kho, thiết bị, linh kiện và lịch sử giao dịch.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loadingSummary}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw /> Làm mới
        </Button>
      </header>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      <section
        className="rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50"
        aria-labelledby="warehouse-info"
      >
        <h2
          id="warehouse-info"
          className="mb-4 flex items-center gap-2 text-lg font-semibold"
        >
          <WarehouseIcon className="h-5 w-5 text-primary" /> Thông tin kho
        </h2>
        <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Vị trí kho</dt>
            <dd className="mt-1">
              {warehouse?.address || "Chưa có thông tin"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Người quản lý</dt>
            <dd className="mt-1">
              {warehouse?.managerKeeperId?.displayName || "Chưa có thông tin"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Trạng thái</dt>
            <dd className="mt-1">
              {warehouse ? (
                <Badge variant={warehouse.isActive ? "success" : "secondary"}>
                  {warehouse.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
                </Badge>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="sm:col-span-2 xl:col-span-4">
            <dt className="text-sm text-muted-foreground">Mô tả</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {warehouse?.description || "Chưa có mô tả"}
            </dd>
          </div>
        </dl>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-border/50"
          >
            <Icon className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {value === undefined ? "—" : number(value)}
            </p>
            {label === "Sắp hết / Hết hàng" && summary && (
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.parts.low} sắp hết · {summary.parts.out} hết hàng
              </p>
            )}
          </div>
        ))}
      </div>
      {summary &&
        (summary.parts.missingParts > 0 ||
          summary.parts.negativeBalances > 0) && (
          <p
            role="alert"
            className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
          >
            Cần kiểm tra dữ liệu: {summary.parts.missingParts} số dư thiếu liên
            kết linh kiện; {summary.parts.negativeBalances} số dư âm.
          </p>
        )}
      {summary && summary.parts.low > 0 && (
        <button
          type="button"
          onClick={() => {
            setActiveTab("parts");
            setPartFilters((current) => ({
              ...current,
              status: "LOW",
              page: 1,
            }));
          }}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-900 hover:bg-amber-100"
        >
          <span className="font-semibold">Cảnh báo tồn kho</span>
          <span className="ml-2 text-sm">
            {number(summary.parts.low)} linh kiện sắp hết. Xem danh sách
          </span>
        </button>
      )}
      <nav
        className="flex gap-2 overflow-x-auto border-b"
        aria-label="Nội dung kho"
      >
        {(
          [
            ["devices", "Thiết bị"],
            ["parts", "Linh kiện"],
            ["history", "Lịch sử giao dịch"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${activeTab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <section
        data-section="devices"
        className={`${activeTab === "devices" ? "space-y-4" : "hidden"} rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50`}
      >
        <div>
          <h2 className="text-xl font-semibold">Thiết bị do kho quản lý</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary
              ? `${number(summary.devices.total)} thiết bị`
              : "Thiết bị liên kết với kho quản lý này"}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <Input
            label="Tìm thiết bị"
            placeholder="Tìm mã tài sản, tên thiết bị, serial..."
            value={deviceFilters.q}
            onChange={(e) =>
              setDeviceFilters({ ...deviceFilters, q: e.target.value, page: 1 })
            }
          />
          <Select
            label="Trạng thái sử dụng"
            placeholder="Tất cả trạng thái"
            options={usageOptions}
            value={deviceFilters.status}
            onChange={(e) =>
              setDeviceFilters({
                ...deviceFilters,
                status: e.target.value,
                page: 1,
              })
            }
          />
          <Select
            label="Loại thiết bị"
            placeholder="Tất cả loại"
            options={types}
            value={deviceFilters.deviceTypeId}
            onChange={(e) =>
              setDeviceFilters({
                ...deviceFilters,
                deviceTypeId: e.target.value,
                page: 1,
              })
            }
          />
        </div>
        {!canDevices ? (
          <p className="text-sm text-muted-foreground">
            Bạn chưa có quyền xem thiết bị.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Mã tài sản",
                      "Tên thiết bị",
                      "Loại thiết bị",
                      "Hãng / Model",
                      "Serial",
                      "Tình trạng",
                      "Trạng thái sử dụng",
                      "Người sử dụng / mượn",
                      ...(summary?.storageLocationCount
                        ? ["Vị trí lưu trữ"]
                        : []),
                      "Thao tác",
                    ].map((label) => (
                      <th key={label} className="p-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableState(devices, summary?.storageLocationCount ? 10 : 9)}
                  {devices.data.map((item) => (
                    <tr
                      key={item._id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20"
                    >
                      <td className="p-3 font-medium text-primary">
                        {item.assetCode}
                      </td>
                      <td className="p-3">
                        {item.name || "Chưa có tên thiết bị"}
                      </td>
                      <td className="p-3">{item.deviceType?.name ?? "—"}</td>
                      <td className="p-3">
                        {[
                          item.model?.manufacturer,
                          item.model?.code ?? item.model?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="p-3">{item.serial ?? "—"}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            item.techCondition === "BROKEN"
                              ? "destructive"
                              : item.techCondition === "DEGRADED"
                                ? "warning"
                                : "success"
                          }
                        >
                          {DEVICE_TYPE_LABELS[item.techCondition] ??
                            item.techCondition}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <UsageBadge status={item.usageStatus} />
                      </td>
                      <td className="p-3">
                        {["IN_USE", "LENT"].includes(item.usageStatus)
                          ? (item.keeper?.displayName ??
                            "Chưa có thông tin người giữ")
                          : "—"}
                      </td>
                      {!!summary?.storageLocationCount && (
                        <td className="p-3">{item.location?.name ?? "—"}</td>
                      )}
                      <td className="whitespace-nowrap p-3">
                        <Link
                          href={`/thiet-bi/${item._id}`}
                          title="Xem chi tiết thiết bị"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Eye className="h-4 w-4" /> Xem chi tiết
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              meta={devices.meta}
              page={deviceFilters.page}
              loading={devices.loading}
              onPage={(page) => setDeviceFilters({ ...deviceFilters, page })}
            />
          </>
        )}
      </section>
      <section
        data-section="parts"
        className={`${activeTab === "parts" ? "space-y-4" : "hidden"} rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50`}
      >
        <div>
          <h2 className="text-xl font-semibold">Tồn linh kiện</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary
              ? `${number(summary.parts.types)} loại linh kiện`
              : "Số dư linh kiện hiện tại"}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <Input
            label="Tìm linh kiện"
            placeholder="Tìm mã, tên hoặc model..."
            value={partFilters.q}
            onChange={(e) =>
              setPartFilters({ ...partFilters, q: e.target.value, page: 1 })
            }
          />
          <Select
            label="Loại linh kiện"
            placeholder="Tất cả loại"
            options={componentTypes}
            value={partFilters.componentTypeId}
            onChange={(e) =>
              setPartFilters({
                ...partFilters,
                componentTypeId: e.target.value,
                page: 1,
              })
            }
          />
          <Select
            label="Trạng thái tồn"
            placeholder="Tất cả trạng thái tồn"
            options={stockOptions}
            value={partFilters.status}
            onChange={(e) =>
              setPartFilters({
                ...partFilters,
                status: e.target.value,
                page: 1,
              })
            }
          />
        </div>
        {!canParts ? (
          <p className="text-sm text-muted-foreground">
            Bạn chưa có quyền xem linh kiện.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Mã linh kiện",
                      "Tên linh kiện",
                      "Nhóm / Loại",
                      "Model linh kiện",
                      "Đơn vị tính",
                      "Tồn hiện tại",
                      "Tồn tối thiểu",
                      "Trạng thái tồn",
                      "Thao tác",
                    ].map((label) => (
                      <th key={label} className="p-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableState(parts, 9)}
                  {parts.data.map((item) => (
                    <tr
                      key={item._id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20"
                    >
                      <td className="p-3 font-medium">
                        {item.part?.code ?? "Thiếu liên kết"}
                      </td>
                      <td className="p-3">
                        {item.part?.name ??
                          `Không tìm thấy linh kiện ${item.partId}`}
                        {item.part?.isActive === false && (
                          <p className="text-xs text-muted-foreground">
                            Đã ngừng sử dụng
                          </p>
                        )}
                      </td>
                      <td className="p-3">{item.componentType?.name ?? "—"}</td>
                      <td className="p-3">
                        {[item.model?.manufacturer, item.model?.name]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="p-3">
                        {unitLabel(item.unit?.name ?? item.unit?.code)}
                      </td>
                      <td className="p-3 font-semibold tabular-nums">
                        {number(item.quantity)}
                      </td>
                      <td className="p-3 tabular-nums">
                        {item.part?.minQty === undefined
                          ? "—"
                          : number(item.part.minQty)}
                      </td>
                      <td className="p-3">
                        <StockBadge status={item.stockStatus} />
                      </td>
                      <td className="whitespace-nowrap p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canHistory}
                          title="Lọc lịch sử của linh kiện này"
                          onClick={() => partHistory(item)}
                        >
                          <History /> Xem lịch sử
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              meta={parts.meta}
              page={partFilters.page}
              loading={parts.loading}
              onPage={(page) => setPartFilters({ ...partFilters, page })}
            />
          </>
        )}
      </section>
      <section
        ref={historyRef}
        data-section="history"
        className={`${activeTab === "history" ? "space-y-4" : "hidden"} scroll-mt-5 rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50`}
      >
        <div>
          <h2 className="text-xl font-semibold">Lịch sử giao dịch kho</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Giao dịch gần nhất của kho · Thiết bị và linh kiện
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Từ ngày"
            type="date"
            max={historyFilters.to || undefined}
            value={historyFilters.from}
            onChange={(e) =>
              setHistoryFilters({
                ...historyFilters,
                from: e.target.value,
                page: 1,
              })
            }
          />
          <Input
            label="Đến ngày"
            type="date"
            min={historyFilters.from || undefined}
            value={historyFilters.to}
            onChange={(e) =>
              setHistoryFilters({
                ...historyFilters,
                to: e.target.value,
                page: 1,
              })
            }
          />
          <Select
            label="Loại giao dịch"
            placeholder="Tất cả giao dịch"
            options={transactionOptions}
            value={historyFilters.type}
            onChange={(e) =>
              setHistoryFilters({
                ...historyFilters,
                type: e.target.value,
                page: 1,
              })
            }
          />
          <Input
            label="Tìm mã phiếu"
            placeholder="Tìm mã phiếu..."
            value={historyFilters.q}
            onChange={(e) =>
              setHistoryFilters({
                ...historyFilters,
                q: e.target.value,
                page: 1,
              })
            }
          />
        </div>
        {historyFilters.partId && (
          <div className="flex flex-wrap items-center gap-2 rounded bg-primary/5 p-3 text-sm">
            <span>Linh kiện: {historyFilters.partLabel}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setHistoryFilters({
                  ...historyFilters,
                  partId: "",
                  partLabel: "",
                  page: 1,
                })
              }
            >
              Bỏ lọc linh kiện
            </Button>
          </div>
        )}
        {!canHistory ? (
          <p className="text-sm text-muted-foreground">
            Cần quyền xem thiết bị, linh kiện, phiếu nhập và nghiệp vụ để xem
            lịch sử tổng hợp.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Thời gian",
                      "Mã phiếu",
                      "Loại giao dịch",
                      "Đối tượng",
                      "SL vào",
                      "SL ra",
                      "Tồn sau giao dịch",
                      "Người thực hiện",
                      "Thao tác",
                    ].map((label) => (
                      <th key={label} className="p-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableState(history, 9)}
                  {history.data.map((item) => (
                    <tr
                      key={item._id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20"
                    >
                      <td className="p-3">
                        {date(item.time)}
                        {item.businessDate && (
                          <p className="text-xs text-muted-foreground">
                            Ngày trả:{" "}
                            {new Date(item.businessDate).toLocaleDateString(
                              "vi-VN",
                            )}
                          </p>
                        )}
                      </td>
                      <td className="p-3 font-medium">
                        {item.referenceState === "LINKED" ? (
                          item.document?.code
                        ) : item.referenceState === "MISSING" ? (
                          <span className="text-amber-700" title={item.note}>
                            Thiếu liên kết phiếu
                          </span>
                        ) : (
                          <span title="Giao dịch không gắn phiếu">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            item.quantityIn > 0
                              ? "success"
                              : item.type === "LOST"
                                ? "destructive"
                                : "default"
                          }
                        >
                          {transactionOptions.find(
                            (option) => option.value === item.type,
                          )?.label ?? "Chưa xác định"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <p>
                          {[item.object.code, item.object.name]
                            .filter(Boolean)
                            .join(" · ") ||
                            `Thiếu liên kết ${item.object.kind === "DEVICE" ? "thiết bị" : "linh kiện"}`}
                        </p>
                        {item.object.serial && (
                          <p className="text-xs text-muted-foreground">
                            Serial: {item.object.serial}
                          </p>
                        )}
                        {item.note && (
                          <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
                            {item.note}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-emerald-700 tabular-nums">
                        {item.quantityIn > 0
                          ? `+${number(item.quantityIn)}`
                          : "—"}
                      </td>
                      <td className="p-3 text-orange-700 tabular-nums">
                        {item.quantityOut > 0
                          ? `−${number(item.quantityOut)}`
                          : "—"}
                      </td>
                      <td className="p-3 tabular-nums">
                        {item.balanceAfter !== null &&
                        item.balanceAfter !== undefined ? (
                          <span title="Tính từ lịch sử đã đối chiếu với số dư hiện tại">
                            {number(item.balanceAfter)}
                          </span>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground"
                            title={
                              item.balanceStatus === "NOT_APPLICABLE"
                                ? "Thiết bị được theo dõi riêng theo mã tài sản, không cộng chung số dư với linh kiện."
                                : "Lịch sử chưa đối chiếu được với số dư hiện tại; không suy đoán tồn sau giao dịch."
                            }
                          >
                            {item.balanceStatus === "NOT_APPLICABLE"
                              ? "Không áp dụng"
                              : "Chưa xác định"}
                          </span>
                        )}
                      </td>
                      <td className="p-3">{item.actor?.displayName ?? "—"}</td>
                      <td className="whitespace-nowrap p-3">
                        {item.referenceState === "LINKED" && item.document && (
                          <TransactionDetailButton
                            title={`Xem chi tiết ${item.document.code ?? "chứng từ"}`}
                            disabled={opening}
                            onClick={() => {
                              if (item.document?.kind === "RECEIPT")
                                window.location.href = `/nhap-kho/${item.document.id}`;
                              else void openOperation(item);
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              meta={history.meta}
              page={historyFilters.page}
              loading={history.loading}
              onPage={(page) => setHistoryFilters({ ...historyFilters, page })}
            />
            <p className="text-xs text-muted-foreground">
              Tồn sau giao dịch chỉ hiển thị cho linh kiện khi lịch sử đối chiếu
              được với số dư hiện tại. Thiết bị được theo dõi theo từng mã tài
              sản.
            </p>
          </>
        )}
      </section>
      <Dialog
        open={!!selectedOperation}
        onOpenChange={(value) => {
          if (!value) setSelectedOperation(null);
        }}
        title={`Chi tiết phiếu ${selectedOperation?.code ?? ""}`}
        className="max-w-4xl"
      >
        {selectedOperation && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries({
                "Loại phiếu":
                  {
                    ISSUE: "Cấp phát",
                    LOAN: "Mượn",
                    TRANSFER: "Điều chuyển",
                    RECOVERY: "Thu hồi",
                  }[selectedOperation.type] ?? selectedOperation.type,
                Ngày: date(selectedOperation.operationDate),
                "Người nhận / mượn":
                  selectedOperation.receiverKeeperId?.displayName,
                "Bộ phận": selectedOperation.receiverDepartmentId?.name,
                "Kho quản lý / xuất": selectedOperation.sourceWarehouseId?.name,
                "Kho đến": selectedOperation.destinationWarehouseId?.name,
                "Nội dung": selectedOperation.reason,
                "Ghi chú": selectedOperation.note,
                "Người tạo": selectedOperation.createdBy?.displayName,
              })
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="whitespace-pre-wrap">{value}</dd>
                  </div>
                ))}
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Đối tượng",
                      "Serial",
                      "Số lượng",
                      "Tình trạng khi giao",
                      "Ghi chú",
                    ].map((label) => (
                      <th key={label} className="p-2 text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedOperation.lines.map((line, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2">
                        {line.assetCode ??
                          line.deviceId?.assetCode ??
                          line.partId?.code}{" "}
                        · {line.deviceName ?? line.partId?.name}
                      </td>
                      <td className="p-2">
                        {line.serial ?? line.deviceId?.serial ?? "—"}
                      </td>
                      <td className="p-2">{line.quantity}</td>
                      <td className="p-2">
                        {condition(line.conditionOut ?? line.handoverCondition)}
                      </td>
                      <td className="p-2">
                        {[line.accessoryNote, line.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedOperation.returnHistory?.map((batch) => (
              <div className="rounded bg-muted/40 p-3" key={batch._id}>
                <p className="font-medium">
                  Trả ngày {date(batch.returnedAt)} ·{" "}
                  {batch.receivedBy?.displayName}
                </p>
                <p>{batch.note}</p>
                {batch.items.map((item, index) => (
                  <p className="text-sm" key={index}>
                    {item.assetCode} · {item.deviceName} ·{" "}
                    {condition(item.conditionIn)} · {item.note}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
