"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  HardDrive,
  PackageCheck,
  RefreshCw,
  Server,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type Distribution = {
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  count: number;
};
type DashboardSummary = {
  generatedAt: string;
  permissions: Record<string, boolean>;
  assets?: {
    totalDevices?: number;
    inUseDevices?: number;
    inStockDevices?: number;
    partStock?: number;
    repairing?: number;
  };
  deviceStatus?: Distribution[];
  deviceTypes?: Distribution[];
  departments?: Distribution[];
  alerts: {
    key: string;
    label: string;
    count: number;
    severity: string;
    href: string;
  }[];
  loans?: {
    id: string;
    code: string;
    borrower: string;
    devices: string;
    dueDate?: string;
    status: string;
    attention: "OVERDUE" | "DUE_SOON" | "ACTIVE";
  }[];
  repairs?: {
    id: string;
    code: string;
    asset: string;
    status: string;
    expectedCompletionAt?: string;
    responsible: string;
    overdue: boolean;
  }[];
  recentActivities: {
    id: string;
    at: string;
    actor: string;
    description: string;
    code?: string;
  }[];
  system?: { api: string; database: string; uptime: number };
};
type Trend = {
  available: boolean;
  range: string;
  points: {
    key: string;
    inbound: number;
    outbound: number;
    returned: number;
  }[];
};

const number = new Intl.NumberFormat("vi-VN");
const date = new Intl.DateTimeFormat("vi-VN");
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: "#0ea5e9",
  IN_USE: "#2563eb",
  LENT: "#8b5cf6",
  IN_TRANSIT: "#f59e0b",
  REPAIRING: "#ef4444",
  OTHER: "#64748b",
  DISPOSED: "#94a3b8",
};

function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Đang tải Dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border bg-muted/50"
          />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-xl border bg-muted/50 lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-xl border bg-muted/50" />
      </div>
      <div className="h-80 animate-pulse rounded-xl border bg-muted/50" />
    </div>
  );
}

function StatusDonut({ rows }: { rows: Distribution[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let cursor = 0;
  const stops = rows
    .filter((row) => row.count > 0)
    .map((row) => {
      const from = cursor;
      cursor += total ? (row.count / total) * 100 : 0;
      return `${STATUS_COLORS[row.key ?? ""] ?? "#64748b"} ${from}% ${cursor}%`;
    });
  return (
    <div className="grid gap-5 p-5 sm:grid-cols-[180px_1fr] sm:items-center">
      <div className="relative mx-auto h-40 w-40">
        <div
          className="h-full w-full rounded-full"
          style={{
            background: total
              ? `conic-gradient(${stops.join(",")})`
              : "#e2e8f0",
          }}
          role="img"
          aria-label={`Phân bổ ${number.format(total)} thiết bị`}
        />
        <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-card">
          <strong className="text-2xl">{number.format(total)}</strong>
          <span className="text-xs text-muted-foreground">thiết bị</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: STATUS_COLORS[row.key ?? ""] ?? "#64748b",
                }}
              />
              <span className="truncate">{row.label}</span>
            </span>
            <strong>{number.format(row.count)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ rows }: { rows: Distribution[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) {
    return (
      <EmptyState
        className="m-4 border-0 shadow-none"
        title="Chưa có dữ liệu"
      />
    );
  }
  return (
    <div className="space-y-3 p-5">
      {rows.map((row) => (
        <div key={row.id ?? row.name}>
          <div className="mb-1.5 flex justify-between gap-3 text-sm">
            <span className="truncate text-muted-foreground">{row.name}</span>
            <strong>{number.format(row.count)}</strong>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-secondary"
              style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ trend }: { trend: Trend | null }) {
  if (!trend) return <div className="h-64 animate-pulse bg-muted/40" />;
  if (!trend.available) {
    return (
      <EmptyState
        className="m-5 border-0 shadow-none"
        title="Không có quyền xem biến động kho"
      />
    );
  }
  const max = Math.max(
    1,
    ...trend.points.flatMap((point) => [
      point.inbound,
      point.outbound,
      point.returned,
    ]),
  );
  const hasData = trend.points.some(
    (point) => point.inbound || point.outbound || point.returned,
  );
  if (!hasData) {
    return (
      <EmptyState
        className="m-5 border-0 shadow-none"
        title="Chưa có giao dịch trong kỳ"
        description="Biểu đồ sẽ xuất hiện khi có nhập, xuất hoặc hoàn trả linh kiện."
      />
    );
  }
  const labelEvery = trend.range === "30d" ? 5 : 1;
  return (
    <div className="overflow-x-auto p-5">
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Nhập
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
          Xuất
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
          Hoàn trả
        </span>
      </div>
      <div className="flex h-56 min-w-[680px] items-end gap-1 border-b border-l px-2 pt-3">
        {trend.points.map((point, index) => (
          <div
            key={point.key}
            className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px"
            title={`${point.key}: Nhập ${point.inbound}, Xuất ${point.outbound}, Hoàn trả ${point.returned}`}
          >
            <div
              className="w-1/4 max-w-3 rounded-t bg-emerald-500"
              style={{
                height: `${Math.max(point.inbound ? 3 : 0, (point.inbound / max) * 88)}%`,
              }}
            />
            <div
              className="w-1/4 max-w-3 rounded-t bg-rose-500"
              style={{
                height: `${Math.max(point.outbound ? 3 : 0, (point.outbound / max) * 88)}%`,
              }}
            />
            <div
              className="w-1/4 max-w-3 rounded-t bg-sky-500"
              style={{
                height: `${Math.max(point.returned ? 3 : 0, (point.returned / max) * 88)}%`,
              }}
            />
            {index % labelEvery === 0 && (
              <span className="absolute -bottom-5 whitespace-nowrap text-[10px] text-muted-foreground">
                {point.key.slice(5)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="h-5" />
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ data: DashboardSummary }>(
        "/api/dashboard/summary",
      );
      setSummary(result.data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể tải dữ liệu Dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);
  useEffect(() => {
    setTrend(null);
    apiFetch<{ data: Trend }>(`/api/dashboard/inventory-trend?range=${range}`)
      .then((result) => setTrend(result.data))
      .catch(() => setTrend({ available: false, range, points: [] }));
  }, [range]);

  const kpis = useMemo(
    () =>
      [
        {
          label: "Tổng thiết bị",
          value: summary?.assets?.totalDevices,
          icon: HardDrive,
          href: "/thiet-bi",
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "Đang sử dụng / giữ",
          value: summary?.assets?.inUseDevices,
          icon: PackageCheck,
          href: "/thiet-bi",
          color: "text-violet-600 bg-violet-50",
        },
        {
          label: "Thiết bị trong kho",
          value: summary?.assets?.inStockDevices,
          icon: Boxes,
          href: "/thiet-bi",
          color: "text-sky-600 bg-sky-50",
        },
        {
          label: "Tồn linh kiện",
          value: summary?.assets?.partStock,
          icon: ClipboardCheck,
          href: "/linh-kien",
          color: "text-emerald-600 bg-emerald-50",
        },
        {
          label: "Đang sửa chữa",
          value: summary?.assets?.repairing,
          icon: Wrench,
          href: "/sua-chua",
          color: "text-rose-600 bg-rose-50",
        },
      ].filter((item) => typeof item.value === "number"),
    [summary],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tổng quan"
        description="Tình hình tài sản, kho và các công việc cần xử lý"
      >
        {summary && (
          <p className="text-xs text-muted-foreground">
            Cập nhật lúc {dateTime.format(new Date(summary.generatedAt))}
          </p>
        )}
      </PageHeader>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <EmptyState
          icon={<TriangleAlert className="h-8 w-8 text-destructive" />}
          title="Không thể tải Dashboard"
          description={error}
          action={{ label: "Thử lại", onClick: () => void loadSummary() }}
        />
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-secondary/50 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn("rounded-lg p-2.5", item.color)}>
                    <item.icon className="h-5 w-5" />
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight">
                  {number.format(item.value ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.label}
                </p>
              </Link>
            ))}
          </div>

          {summary.alerts.length > 0 && (
            <Panel
              title="Cần chú ý"
              description="Các công việc đang cần kiểm tra hoặc xử lý"
            >
              <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {summary.alerts.map((alert) => (
                  <Link
                    key={alert.key}
                    href={alert.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/50",
                      alert.severity === "danger" &&
                        "border-red-200 bg-red-50/50",
                      alert.severity === "warning" &&
                        "border-amber-200 bg-amber-50/50",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "h-5 w-5 shrink-0",
                        alert.severity === "danger"
                          ? "text-red-600"
                          : alert.severity === "warning"
                            ? "text-amber-600"
                            : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-lg leading-none">
                        {number.format(alert.count)}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {alert.label}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <div className="grid gap-5 xl:grid-cols-5">
            {summary.deviceStatus && (
              <Panel
                title="Trạng thái thiết bị"
                description="Phân bổ theo trạng thái sử dụng"
                className="xl:col-span-3"
              >
                <StatusDonut rows={summary.deviceStatus} />
              </Panel>
            )}
            {summary.deviceTypes && (
              <Panel
                title="Thiết bị theo loại"
                description="Các loại thiết bị có số lượng cao nhất"
                className="xl:col-span-2"
              >
                <HorizontalBars rows={summary.deviceTypes} />
              </Panel>
            )}
          </div>

          <Panel
            title="Biến động kho linh kiện"
            description="Tổng số lượng theo giao dịch nhập, xuất và hoàn trả"
            action={
              <div className="flex rounded-md border p-0.5">
                {["30d", "3m", "6m", "12m"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRange(item)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs",
                      range === item
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {item === "30d" ? "30 ngày" : item}
                  </button>
                ))}
              </div>
            }
          >
            <TrendChart trend={trend} />
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            {summary.departments && (
              <Panel
                title="Thiết bị theo bộ phận"
                description="Số thiết bị đang ghi nhận tại từng bộ phận"
              >
                <HorizontalBars rows={summary.departments} />
              </Panel>
            )}
            <Panel
              title="Hoạt động gần đây"
              description="Dữ liệu từ nhật ký kiểm toán hệ thống"
            >
              {summary.recentActivities.length ? (
                <div className="divide-y">
                  {summary.recentActivities.map((item) => (
                    <div key={item.id} className="flex gap-3 px-5 py-3">
                      <span className="mt-1 rounded-full bg-muted p-1.5">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p>
                          <strong>{item.actor}</strong> {item.description}
                          {item.code ? (
                            <span className="font-medium text-secondary">
                              {" "}
                              {String(item.code)}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dateTime.format(new Date(item.at))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  className="m-4 border-0 shadow-none"
                  title="Chưa có hoạt động gần đây"
                />
              )}
            </Panel>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {summary.loans && <LoanPanel rows={summary.loans} />}
            {summary.repairs && <RepairPanel rows={summary.repairs} />}
          </div>

          {summary.system && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Tình trạng hệ thống
              </span>
              <span className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> API hoạt
                động
              </span>
              <span className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" />
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                MongoDB đã kết nối
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" /> Uptime{" "}
                {number.format(summary.system.uptime)} giây
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 px-2 text-xs"
                onClick={() => void loadSummary()}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Làm mới
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function LoanPanel({ rows }: { rows: NonNullable<DashboardSummary["loans"]> }) {
  return (
    <Panel
      title="Phiếu mượn cần theo dõi"
      description="Tối đa 5 phiếu, ưu tiên hạn trả gần nhất"
      action={
        <Link
          href="/muon-tra"
          className="text-xs font-medium text-secondary hover:underline"
        >
          Xem tất cả
        </Link>
      }
    >
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Phiếu</th>
                <th className="px-4 py-2.5 font-medium">
                  Người mượn / thiết bị
                </th>
                <th className="px-4 py-2.5 font-medium">Hạn trả</th>
                <th className="px-4 py-2.5 font-medium">Mức độ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((loan) => (
                <tr key={loan.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-secondary hover:underline"
                      href={`/muon-tra?id=${loan.id}`}
                    >
                      {loan.code}
                    </Link>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <span className="block font-medium">{loan.borrower}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {loan.devices || "Chưa có mô tả thiết bị"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {loan.dueDate ? date.format(new Date(loan.dueDate)) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        loan.attention === "OVERDUE"
                          ? "destructive"
                          : loan.attention === "DUE_SOON"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {loan.attention === "OVERDUE"
                        ? "Quá hạn"
                        : loan.attention === "DUE_SOON"
                          ? "Sắp hạn"
                          : "Đang mượn"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          className="m-4 border-0 shadow-none"
          title="Không có phiếu mượn cần theo dõi"
        />
      )}
    </Panel>
  );
}

function RepairPanel({
  rows,
}: {
  rows: NonNullable<DashboardSummary["repairs"]>;
}) {
  return (
    <Panel
      title="Sửa chữa đang xử lý"
      description="Các phiếu tiếp nhận hoặc đang sửa"
      action={
        <Link
          href="/sua-chua"
          className="text-xs font-medium text-secondary hover:underline"
        >
          Xem tất cả
        </Link>
      }
    >
      {rows.length ? (
        <div className="divide-y">
          {rows.map((repair) => (
            <Link
              href={`/sua-chua?id=${repair.id}`}
              key={repair.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40"
            >
              <span
                className={cn(
                  "rounded-lg p-2",
                  repair.overdue
                    ? "bg-red-50 text-red-600"
                    : "bg-amber-50 text-amber-600",
                )}
              >
                <Wrench className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="text-sm">{repair.code}</strong>
                  {repair.overdue && (
                    <Badge variant="destructive">Quá hạn</Badge>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {repair.asset} · {repair.responsible}
                </span>
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {repair.expectedCompletionAt
                  ? date.format(new Date(repair.expectedCompletionAt))
                  : "Chưa hẹn"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          className="m-4 border-0 shadow-none"
          title="Không có phiếu sửa chữa đang xử lý"
        />
      )}
    </Panel>
  );
}
