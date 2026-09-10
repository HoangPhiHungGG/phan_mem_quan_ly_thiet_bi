"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  FilePenLine,
  Loader2,
  Play,
  Plus,
  Printer,
  Trash2,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch } from "@/lib/api";
import {
  DEVICE_TYPE_LABELS,
  formatDate,
  formatMoney,
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";

type Ref = {
  _id: string;
  code?: string;
  name?: string;
  displayName?: string;
  employeeCode?: string;
  trackingMode?: string;
};
type Target = {
  _id: string;
  assetCode?: string;
  serial?: string;
  status?: string;
  usageStatus?: string;
  techCondition?: string;
  modelId?: Ref;
  partId?: Ref;
  keeperId?: Ref;
  departmentId?: Ref;
  warehouseId?: Ref;
  locationId?: Ref;
};
type Part = { _id: string; code: string; name: string; trackingMode: string };
type RepairPart = {
  partId: Ref;
  partSerialId?: Ref | string;
  serial?: string;
  quantity: number;
  note?: string;
};
type Repair = {
  _id: string;
  code: string;
  repairDate: string;
  targetKind: "DEVICE" | "PART_SERIAL";
  deviceId?: Target;
  partSerialId?: Target;
  assetCode?: string;
  serial?: string;
  targetName?: string;
  fromKeeperId?: Ref;
  fromDepartmentId?: Ref;
  fromWarehouseId?: Ref;
  fromLocationId?: Ref;
  conditionBefore: string;
  issueDescription: string;
  severity: string;
  repairType: string;
  vendor?: string;
  vendorContact?: string;
  responsiblePerson?: string;
  receivedAt?: string;
  receivedBy?: Ref;
  sentAt?: string;
  expectedCompletionAt?: string;
  completedAt?: string;
  inspectionCost: number;
  repairCost: number;
  partsCost: number;
  otherCost: number;
  totalCost: number;
  repairContent?: string;
  parts: RepairPart[];
  partsWarehouseId?: Ref;
  result?: string;
  conditionAfter?: string;
  outcome?: string;
  destinationWarehouseId?: Ref;
  destinationLocationId?: Ref;
  note?: string;
  status: string;
  statusHistory: Array<{ status: string; at: string; by?: Ref; note?: string }>;
  createdBy?: Ref;
  completedBy?: Ref;
  cancelledBy?: Ref;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
};
type Meta = { page: number; limit: number; total: number; totalPages: number };
type PartLine = {
  partId: string;
  partSerialId: string;
  quantity: number;
  note: string;
};

const statusLabels: Record<string, string> = {
  DRAFT: "Nháp",
  RECEIVED: "Đã tiếp nhận",
  REPAIRING: "Đang sửa chữa",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  UNREPAIRABLE: "Không thể sửa",
};
const severityLabels: Record<string, string> = {
  MINOR: "Nhẹ",
  MODERATE: "Trung bình",
  SEVERE: "Nặng",
  BEYOND_REPAIR: "Không thể sửa chữa",
};
const typeLabels: Record<string, string> = {
  INTERNAL: "Nội bộ",
  WARRANTY: "Bảo hành",
  EXTERNAL: "Đơn vị bên ngoài",
};
const outcomeLabels: Record<string, string> = {
  RETURN_TO_KEEPER: "Trả người/bộ phận trước đó",
  RETURN_TO_WAREHOUSE: "Nhập về kho",
  PENDING: "Chờ xử lý",
  PENDING_DISPOSAL: "Đề nghị thanh lý",
};

function statusVariant(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "REPAIRING" || status === "RECEIVED")
    return "warning" as const;
  if (status === "CANCELLED" || status === "UNREPAIRABLE")
    return "destructive" as const;
  return "secondary" as const;
}
function refName(value?: Ref) {
  return value?.displayName ?? value?.name ?? value?.code ?? "—";
}
function dateInput(value?: string) {
  return value?.slice(0, 10) ?? "";
}
function timestamp(value?: string) {
  return value ? new Date(value).toLocaleString("vi-VN") : "—";
}

function DetailBlock({
  title,
  values,
}: {
  title: string;
  values: Array<[string, unknown]>;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-medium">
              {String(value || "—")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RepairPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Repair[]>([]);
  const [meta, setMeta] = useState<Meta>();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState<Repair | null>(null);
  const [editor, setEditor] = useState<Repair | "new" | null>(null);
  const [progress, setProgress] = useState<Repair | null>(null);
  const [finishing, setFinishing] = useState<Repair | null>(null);
  const [targetKind, setTargetKind] = useState<"DEVICE" | "PART_SERIAL">(
    "DEVICE",
  );
  const [devices, setDevices] = useState<Target[]>([]);
  const [partSerials, setPartSerials] = useState<Target[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [locations, setLocations] = useState<CatalogOption[]>([]);
  const [outcome, setOutcome] = useState("RETURN_TO_WAREHOUSE");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [partsWarehouseId, setPartsWarehouseId] = useState("");
  const [partLines, setPartLines] = useState<PartLine[]>([]);
  const canCreate = hasPermission("repair.create");
  const canEdit = hasPermission("repair.edit");
  const canReceive = hasPermission("repair.receive");
  const canComplete = hasPermission("repair.complete");
  const canCancel = hasPermission("repair.cancel");

  const load = useCallback(async () => {
    if (!hasPermission("repair.view")) {
      setError("Bạn không có quyền xem module sửa chữa.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      const result = await apiFetch<{ data: Repair[]; meta: Meta }>(
        `/api/repairs?${params}`,
      );
      setRows(result.data);
      setMeta(result.meta);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể tải danh sách sửa chữa.",
      );
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hasPermission, page, q, status]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    const repairId = new URLSearchParams(window.location.search).get(
      "repairId",
    );
    if (!repairId || !hasPermission("repair.view")) return;
    apiFetch<{ data: Repair }>(`/api/repairs/${repairId}`)
      .then((result) => setDetail(result.data))
      .catch(() => undefined);
  }, [hasPermission]);
  useEffect(() => {
    Promise.all([
      apiFetch<{ data: Target[] }>("/api/repairs/eligible-devices"),
      apiFetch<{ data: Target[] }>("/api/repairs/eligible-part-serials"),
      apiFetch<{ data: Part[] }>("/api/parts?limit=100&isActive=true"),
      loadCatalogOptions("warehouses"),
      loadCatalogOptions("locations"),
    ])
      .then(
        ([
          deviceResult,
          serialResult,
          partResult,
          warehouseResult,
          locationResult,
        ]) => {
          setDevices(deviceResult.data);
          setPartSerials(serialResult.data);
          setParts(partResult.data);
          setWarehouses(warehouseResult);
          setLocations(locationResult);
        },
      )
      .catch(() => undefined);
  }, []);

  function notify(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3500);
  }
  async function mutate(path: string, init: RequestInit, message: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(path, init);
      notify(message);
      await load();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể thực hiện thao tác.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEditor(value: Repair | "new") {
    setEditor(value);
    setTargetKind(value === "new" ? "DEVICE" : value.targetKind);
    setError("");
  }
  async function saveRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const string = (name: string) => String(form.get(name) ?? "").trim();
    const optional = (name: string) => string(name) || undefined;
    const number = (name: string) => Number(string(name) || 0);
    const payload = {
      repairDate: string("repairDate"),
      targetKind,
      deviceId: targetKind === "DEVICE" ? string("targetId") : undefined,
      partSerialId:
        targetKind === "PART_SERIAL" ? string("targetId") : undefined,
      conditionBefore: string("conditionBefore"),
      issueDescription: string("issueDescription"),
      severity: string("severity"),
      repairType: string("repairType"),
      vendor: optional("vendor"),
      vendorContact: optional("vendorContact"),
      responsiblePerson: optional("responsiblePerson"),
      sentAt: optional("sentAt"),
      expectedCompletionAt: optional("expectedCompletionAt"),
      inspectionCost: number("inspectionCost"),
      repairCost: number("repairCost"),
      partsCost: number("partsCost"),
      otherCost: number("otherCost"),
      note: optional("note"),
    };
    const editing = editor !== "new" && editor;
    if (
      await mutate(
        editing ? `/api/repairs/${editing._id}` : "/api/repairs",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
        editing ? "Đã cập nhật phiếu sửa chữa." : "Đã tạo phiếu sửa chữa.",
      )
    )
      setEditor(null);
  }

  async function openDetail(row: Repair) {
    setBusy(true);
    try {
      const result = await apiFetch<{ data: Repair }>(
        `/api/repairs/${row._id}`,
      );
      setDetail(result.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể tải chi tiết phiếu.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function receive(row: Repair) {
    if (
      !window.confirm(
        `Xác nhận tiếp nhận ${row.code}? Thiết bị sẽ chuyển sang Đang sửa chữa.`,
      )
    )
      return;
    await mutate(
      `/api/repairs/${row._id}/receive`,
      { method: "PATCH", body: "{}" },
      "Đã tiếp nhận thiết bị sửa chữa.",
    );
  }
  async function start(row: Repair) {
    if (!window.confirm(`Bắt đầu sửa chữa phiếu ${row.code}?`)) return;
    await mutate(
      `/api/repairs/${row._id}/start`,
      { method: "PATCH", body: "{}" },
      "Đã bắt đầu sửa chữa.",
    );
  }
  async function remove(row: Repair) {
    if (!window.confirm(`Xóa phiếu nháp ${row.code}?`)) return;
    await mutate(
      `/api/repairs/${row._id}`,
      { method: "DELETE" },
      "Đã xóa phiếu nháp.",
    );
  }
  async function cancel(row: Repair) {
    const reason = window.prompt(`Nhập lý do hủy phiếu ${row.code}:`)?.trim();
    if (!reason) return;
    await mutate(
      `/api/repairs/${row._id}/cancel`,
      {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      },
      "Đã hủy phiếu và khôi phục trạng thái thiết bị.",
    );
  }
  async function saveProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progress) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const payload = {
      repairContent: value("repairContent"),
      vendor: value("vendor"),
      vendorContact: value("vendorContact"),
      responsiblePerson: value("responsiblePerson"),
      expectedCompletionAt: value("expectedCompletionAt") || undefined,
      inspectionCost: Number(value("inspectionCost") || 0),
      repairCost: Number(value("repairCost") || 0),
      partsCost: Number(value("partsCost") || 0),
      otherCost: Number(value("otherCost") || 0),
      note: value("note"),
    };
    if (
      await mutate(
        `/api/repairs/${progress._id}/progress`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
        "Đã cập nhật tiến độ sửa chữa.",
      )
    )
      setProgress(null);
  }

  function openFinish(row: Repair) {
    setFinishing(row);
    setOutcome(
      row.severity === "BEYOND_REPAIR"
        ? "PENDING_DISPOSAL"
        : "RETURN_TO_WAREHOUSE",
    );
    setPartsWarehouseId("");
    setDestinationWarehouseId("");
    setPartLines([]);
  }
  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!finishing) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const unrepairable = form.get("unrepairable") === "on";
    const payload = {
      result: value("result"),
      conditionAfter: unrepairable ? undefined : value("conditionAfter"),
      outcome: unrepairable ? "PENDING_DISPOSAL" : outcome,
      repairContent: value("repairContent") || undefined,
      completedAt: value("completedAt") || undefined,
      inspectionCost: Number(value("inspectionCost") || 0),
      repairCost: Number(value("repairCost") || 0),
      partsCost: Number(value("partsCost") || 0),
      otherCost: Number(value("otherCost") || 0),
      destinationWarehouseId:
        !unrepairable && outcome === "RETURN_TO_WAREHOUSE"
          ? value("destinationWarehouseId")
          : undefined,
      destinationLocationId:
        !unrepairable && outcome === "RETURN_TO_WAREHOUSE"
          ? value("destinationLocationId") || undefined
          : undefined,
      partsWarehouseId: partLines.length ? partsWarehouseId : undefined,
      parts: partLines.map((line) => {
        const part = parts.find((item) => item._id === line.partId);
        const serial = serialOptions[line.partSerialId]?.serial;
        return {
          partId: line.partId,
          partSerialId:
            part?.trackingMode === "SERIAL" ? line.partSerialId : undefined,
          serial,
          quantity: part?.trackingMode === "SERIAL" ? 1 : line.quantity,
          note: line.note || undefined,
        };
      }),
    };
    const path = `/api/repairs/${finishing._id}/${unrepairable ? "unrepairable" : "complete"}`;
    if (
      await mutate(
        path,
        { method: "PATCH", body: JSON.stringify(payload) },
        unrepairable
          ? "Đã ghi nhận thiết bị không thể sửa."
          : "Đã hoàn tất sửa chữa.",
      )
    ) {
      setFinishing(null);
      setPartLines([]);
    }
  }

  const [serialOptions, setSerialOptions] = useState<
    Record<string, { serial: string; warehouseId?: string }>
  >({});
  useEffect(() => {
    const ids = [
      ...new Set(partLines.map((line) => line.partId).filter(Boolean)),
    ];
    Promise.all(
      ids.map((id) =>
        apiFetch<{
          data: Array<{ _id: string; serial: string; warehouseId?: Ref }>;
        }>(`/api/parts/${id}/serials?status=IN_STOCK&limit=100`),
      ),
    )
      .then((results) => {
        const next: Record<string, { serial: string; warehouseId?: string }> =
          {};
        for (const result of results)
          for (const item of result.data) {
            next[item._id] = {
              serial: item.serial,
              warehouseId: item.warehouseId?._id,
            };
          }
        setSerialOptions(next);
      })
      .catch(() => setSerialOptions({}));
  }, [partLines]);

  const targetOptions = useMemo(() => {
    const source = targetKind === "DEVICE" ? devices : partSerials;
    return source.map((item) => ({
      value: item._id,
      label:
        targetKind === "DEVICE"
          ? `${item.assetCode} · ${item.modelId?.name ?? "Chưa có model"}${item.serial ? ` · ${item.serial}` : ""}`
          : `${item.partId?.name ?? item.partId?.code ?? "Linh kiện"} · ${item.serial}`,
    }));
  }, [devices, partSerials, targetKind]);
  const editRow = editor !== "new" ? editor : null;
  const selectedTarget = editRow
    ? {
        value:
          editRow.targetKind === "DEVICE"
            ? (editRow.deviceId?._id ?? "")
            : (editRow.partSerialId?._id ?? ""),
        label: `${editRow.assetCode ?? editRow.targetName ?? "Thiết bị"}${editRow.serial ? ` · ${editRow.serial}` : ""}`,
      }
    : null;
  const editorTargetOptions =
    selectedTarget &&
    !targetOptions.some((item) => item.value === selectedTarget.value)
      ? [selectedTarget, ...targetOptions]
      : targetOptions;

  function printRepair(row: Repair) {
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;
    popup.document.title = `Phiếu sửa chữa ${row.code}`;
    const root = popup.document.createElement("main");
    root.style.cssText = "font-family:Arial,sans-serif;padding:32px;color:#111";
    const title = popup.document.createElement("h1");
    title.textContent = `PHIẾU SỬA CHỮA ${row.code}`;
    root.append(title);
    const fields: Array<[string, string]> = [
      ["Ngày lập", formatDate(row.repairDate)],
      ["Thiết bị", row.targetName ?? "—"],
      ["Mã tài sản", row.assetCode ?? "—"],
      ["Serial", row.serial ?? "—"],
      ["Mô tả lỗi", row.issueDescription],
      ["Đơn vị sửa", row.vendor ?? typeLabels[row.repairType]],
      ["Kết quả", row.result ?? "—"],
      ["Tổng chi phí", formatMoney(row.totalCost)],
      ["Trạng thái", statusLabels[row.status] ?? row.status],
    ];
    for (const [label, text] of fields) {
      const p = popup.document.createElement("p");
      const strong = popup.document.createElement("strong");
      strong.textContent = `${label}: `;
      p.append(strong, text);
      root.append(p);
    }
    popup.document.body.append(root);
    popup.print();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sửa chữa"
        description="Theo dõi thiết bị từ tiếp nhận, sửa chữa đến bàn giao hoặc nhập lại kho."
        action={
          canCreate
            ? { label: "Tạo phiếu sửa chữa", onClick: () => openEditor("new") }
            : undefined
        }
      />

      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          label="Tìm kiếm"
          placeholder="Mã phiếu, tài sản, serial..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Tất cả"
          options={Object.entries(statusLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Input
          label="Từ ngày"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <Input
          label="Đến ngày"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setQ("");
              setStatus("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
      </div>

      {success && (
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải phiếu sửa
          chữa...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-8 w-8 text-muted-foreground" />}
          title="Chưa có phiếu sửa chữa"
          description="Tạo phiếu khi phát hiện thiết bị hoặc linh kiện serial bị hỏng."
          action={
            canCreate
              ? { label: "Tạo phiếu", onClick: () => openEditor("new") }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3">Mã phiếu</th>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Mã tài sản</th>
                  <th className="p-3">Thiết bị</th>
                  <th className="p-3">Mô tả lỗi</th>
                  <th className="p-3">Đơn vị sửa</th>
                  <th className="p-3">Dự kiến xong</th>
                  <th className="p-3 text-right">Chi phí</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b align-top last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-3 font-medium">{row.code}</td>
                    <td className="p-3">{formatDate(row.repairDate)}</td>
                    <td className="p-3">
                      {row.assetCode ?? "—"}
                      <div className="text-xs text-muted-foreground">
                        {row.serial}
                      </div>
                    </td>
                    <td className="p-3">
                      {row.targetName ??
                        row.deviceId?.modelId?.name ??
                        row.partSerialId?.partId?.name ??
                        "—"}
                    </td>
                    <td className="max-w-56 p-3">
                      <p className="line-clamp-2">{row.issueDescription}</p>
                    </td>
                    <td className="p-3">
                      {row.vendor || typeLabels[row.repairType]}
                    </td>
                    <td className="p-3">
                      {formatDate(row.expectedCompletionAt)}
                    </td>
                    <td className="p-3 text-right">
                      {formatMoney(row.totalCost)}
                    </td>
                    <td className="p-3">
                      <Badge variant={statusVariant(row.status)}>
                        {statusLabels[row.status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openDetail(row)}
                        >
                          <Eye /> Xem
                        </Button>
                        {row.status === "DRAFT" && canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditor(row)}
                          >
                            <FilePenLine /> Sửa
                          </Button>
                        )}
                        {row.status === "DRAFT" && canReceive && (
                          <Button size="sm" onClick={() => void receive(row)}>
                            Tiếp nhận
                          </Button>
                        )}
                        {row.status === "RECEIVED" && canEdit && (
                          <Button size="sm" onClick={() => void start(row)}>
                            <Play /> Bắt đầu
                          </Button>
                        )}
                        {row.status === "REPAIRING" && canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setProgress(row)}
                          >
                            Tiến độ
                          </Button>
                        )}
                        {row.status === "REPAIRING" && canComplete && (
                          <Button size="sm" onClick={() => openFinish(row)}>
                            Hoàn tất
                          </Button>
                        )}
                        {row.status === "DRAFT" && canCancel && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void remove(row)}
                          >
                            <Trash2 /> Xóa
                          </Button>
                        )}
                        {["RECEIVED", "REPAIRING"].includes(row.status) &&
                          canCancel && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void cancel(row)}
                            >
                              Hủy
                            </Button>
                          )}
                        {["COMPLETED", "UNREPAIRABLE"].includes(row.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printRepair(row)}
                          >
                            <Printer /> In
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={meta?.page ?? 1}
            totalPages={meta?.totalPages ?? 1}
            onChange={setPage}
          />
        </div>
      )}

      <Dialog
        open={!!editor}
        onOpenChange={(open) => !open && setEditor(null)}
        title={
          editor === "new" ? "Tạo phiếu sửa chữa" : `Sửa phiếu ${editRow?.code}`
        }
        className="max-w-5xl"
      >
        {editor && (
          <form
            onSubmit={saveRepair}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Input
              name="repairDate"
              label="Ngày lập *"
              type="date"
              required
              defaultValue={
                dateInput(editRow?.repairDate) ||
                new Date().toISOString().slice(0, 10)
              }
            />
            <Select
              label="Đối tượng *"
              value={targetKind}
              disabled={!!editRow}
              onChange={(e) =>
                setTargetKind(e.target.value as "DEVICE" | "PART_SERIAL")
              }
              options={[
                { value: "DEVICE", label: "Thiết bị có mã tài sản" },
                { value: "PART_SERIAL", label: "Linh kiện theo serial" },
              ]}
            />
            <Select
              name="targetId"
              label="Thiết bị / linh kiện *"
              required
              disabled={!!editRow}
              defaultValue={selectedTarget?.value}
              placeholder="Chọn đối tượng sửa chữa"
              options={editorTargetOptions}
            />
            <Select
              name="conditionBefore"
              label="Tình trạng trước sửa *"
              required
              defaultValue={editRow?.conditionBefore ?? "BROKEN"}
              options={Object.entries(DEVICE_TYPE_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            <Select
              name="severity"
              label="Mức độ lỗi *"
              required
              defaultValue={editRow?.severity ?? "MODERATE"}
              options={Object.entries(severityLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Select
              name="repairType"
              label="Hình thức sửa *"
              required
              defaultValue={editRow?.repairType ?? "INTERNAL"}
              options={Object.entries(typeLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Textarea
              name="issueDescription"
              label="Mô tả lỗi *"
              required
              maxLength={2000}
              defaultValue={editRow?.issueDescription}
              className="min-h-24 sm:col-span-2 lg:col-span-3"
            />
            <Input
              name="vendor"
              label="Đơn vị sửa chữa"
              maxLength={200}
              defaultValue={editRow?.vendor}
            />
            <Input
              name="vendorContact"
              label="Liên hệ đơn vị sửa"
              maxLength={150}
              defaultValue={editRow?.vendorContact}
            />
            <Input
              name="responsiblePerson"
              label="Người phụ trách"
              maxLength={150}
              defaultValue={editRow?.responsiblePerson}
            />
            <Input
              name="sentAt"
              label="Ngày gửi sửa"
              type="date"
              defaultValue={dateInput(editRow?.sentAt)}
            />
            <Input
              name="expectedCompletionAt"
              label="Dự kiến hoàn thành"
              type="date"
              defaultValue={dateInput(editRow?.expectedCompletionAt)}
            />
            <Input
              name="inspectionCost"
              label="Chi phí kiểm tra"
              type="number"
              min={0}
              defaultValue={editRow?.inspectionCost ?? 0}
            />
            <Input
              name="repairCost"
              label="Chi phí sửa"
              type="number"
              min={0}
              defaultValue={editRow?.repairCost ?? 0}
            />
            <Input
              name="partsCost"
              label="Chi phí linh kiện"
              type="number"
              min={0}
              defaultValue={editRow?.partsCost ?? 0}
            />
            <Input
              name="otherCost"
              label="Chi phí khác"
              type="number"
              min={0}
              defaultValue={editRow?.otherCost ?? 0}
            />
            <Textarea
              name="note"
              label="Ghi chú"
              maxLength={1000}
              defaultValue={editRow?.note}
              className="sm:col-span-2"
            />
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Lưu phiếu
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!progress}
        onOpenChange={(open) => !open && setProgress(null)}
        title={`Cập nhật tiến độ ${progress?.code ?? ""}`}
        className="max-w-3xl"
      >
        {progress && (
          <form onSubmit={saveProgress} className="grid gap-4 sm:grid-cols-2">
            <Textarea
              name="repairContent"
              label="Nội dung sửa chữa"
              defaultValue={progress.repairContent}
              className="min-h-28 sm:col-span-2"
            />
            <Input
              name="vendor"
              label="Đơn vị sửa chữa"
              defaultValue={progress.vendor}
            />
            <Input
              name="vendorContact"
              label="Liên hệ"
              defaultValue={progress.vendorContact}
            />
            <Input
              name="responsiblePerson"
              label="Người phụ trách"
              defaultValue={progress.responsiblePerson}
            />
            <Input
              name="expectedCompletionAt"
              label="Dự kiến hoàn thành"
              type="date"
              defaultValue={dateInput(progress.expectedCompletionAt)}
            />
            <Input
              name="inspectionCost"
              label="Chi phí kiểm tra"
              type="number"
              min={0}
              defaultValue={progress.inspectionCost}
            />
            <Input
              name="repairCost"
              label="Chi phí sửa"
              type="number"
              min={0}
              defaultValue={progress.repairCost}
            />
            <Input
              name="partsCost"
              label="Chi phí linh kiện"
              type="number"
              min={0}
              defaultValue={progress.partsCost}
            />
            <Input
              name="otherCost"
              label="Chi phí khác"
              type="number"
              min={0}
              defaultValue={progress.otherCost}
            />
            <Textarea
              name="note"
              label="Ghi chú"
              defaultValue={progress.note}
              className="sm:col-span-2"
            />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setProgress(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                Lưu tiến độ
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!finishing}
        onOpenChange={(open) => !open && setFinishing(null)}
        title={`Hoàn tất phiếu ${finishing?.code ?? ""}`}
        className="max-w-5xl"
      >
        {finishing && (
          <form onSubmit={finish} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Textarea
                name="result"
                label="Kết quả sửa chữa *"
                required
                className="min-h-24 sm:col-span-2 lg:col-span-3"
              />
              <Textarea
                name="repairContent"
                label="Nội dung đã thực hiện"
                defaultValue={finishing.repairContent}
                className="sm:col-span-2 lg:col-span-3"
              />
              <Input
                name="completedAt"
                label="Ngày hoàn thành"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              <Select
                name="conditionAfter"
                label="Tình trạng sau sửa *"
                defaultValue="GOOD"
                options={Object.entries(DEVICE_TYPE_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
              <Select
                label="Hướng xử lý *"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                options={Object.entries(outcomeLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
              {outcome === "RETURN_TO_WAREHOUSE" && (
                <>
                  <Select
                    name="destinationWarehouseId"
                    label="Kho nhập lại *"
                    required
                    value={destinationWarehouseId}
                    onChange={(event) =>
                      setDestinationWarehouseId(event.target.value)
                    }
                    placeholder="Chọn kho"
                    options={warehouses}
                  />
                  <Select
                    name="destinationLocationId"
                    label="Vị trí trong kho"
                    placeholder="Không chọn"
                    options={locations.filter(
                      (item) =>
                        !item.warehouseId ||
                        item.warehouseId === destinationWarehouseId,
                    )}
                  />
                </>
              )}
              <label className="flex items-center gap-2 self-end rounded-md border p-2 text-sm">
                <input name="unrepairable" type="checkbox" /> Không thể sửa chữa
              </label>
              <Input
                name="inspectionCost"
                label="Chi phí kiểm tra"
                type="number"
                min={0}
                defaultValue={finishing.inspectionCost}
              />
              <Input
                name="repairCost"
                label="Chi phí sửa"
                type="number"
                min={0}
                defaultValue={finishing.repairCost}
              />
              <Input
                name="partsCost"
                label="Chi phí linh kiện"
                type="number"
                min={0}
                defaultValue={finishing.partsCost}
              />
              <Input
                name="otherCost"
                label="Chi phí khác"
                type="number"
                min={0}
                defaultValue={finishing.otherCost}
              />
            </div>
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Linh kiện thay thế</h3>
                  <p className="text-xs text-muted-foreground">
                    Tồn kho chỉ bị trừ khi hoàn tất thành công.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPartLines((current) => [
                      ...current,
                      { partId: "", partSerialId: "", quantity: 1, note: "" },
                    ])
                  }
                >
                  <Plus /> Thêm linh kiện
                </Button>
              </div>
              {partLines.length > 0 && (
                <Select
                  label="Kho lấy linh kiện *"
                  value={partsWarehouseId}
                  onChange={(e) => setPartsWarehouseId(e.target.value)}
                  required
                  placeholder="Chọn kho xuất"
                  options={warehouses}
                />
              )}
              {partLines.map((line, index) => {
                const part = parts.find((item) => item._id === line.partId);
                const serials = Object.entries(serialOptions)
                  .filter(
                    ([, item]) =>
                      !partsWarehouseId ||
                      item.warehouseId === partsWarehouseId,
                  )
                  .map(([value, item]) => ({ value, label: item.serial }));
                return (
                  <div
                    key={index}
                    className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[2fr_1.2fr_.6fr_1.5fr_auto]"
                  >
                    <Select
                      label="Linh kiện *"
                      value={line.partId}
                      onChange={(e) =>
                        setPartLines((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  partId: e.target.value,
                                  partSerialId: "",
                                  quantity: 1,
                                }
                              : item,
                          ),
                        )
                      }
                      required
                      placeholder="Chọn linh kiện"
                      options={parts.map((item) => ({
                        value: item._id,
                        label: `${item.code} · ${item.name}`,
                      }))}
                    />
                    {part?.trackingMode === "SERIAL" ? (
                      <Select
                        label="Serial *"
                        value={line.partSerialId}
                        onChange={(e) =>
                          setPartLines((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, partSerialId: e.target.value }
                                : item,
                            ),
                          )
                        }
                        required
                        placeholder="Chọn serial"
                        options={serials}
                      />
                    ) : (
                      <div />
                    )}
                    <Input
                      label="Số lượng *"
                      type="number"
                      min={1}
                      disabled={part?.trackingMode === "SERIAL"}
                      value={
                        part?.trackingMode === "SERIAL" ? 1 : line.quantity
                      }
                      onChange={(e) =>
                        setPartLines((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, quantity: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      label="Ghi chú"
                      value={line.note}
                      onChange={(e) =>
                        setPartLines((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, note: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="mt-5"
                      onClick={() =>
                        setPartLines((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </section>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFinishing(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Xác nhận hoàn tất
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!detail}
        onOpenChange={(open) => !open && setDetail(null)}
        title={`Chi tiết phiếu ${detail?.code ?? ""}`}
        className="max-w-5xl"
      >
        {detail && (
          <div className="space-y-4">
            <DetailBlock
              title="Thông tin phiếu"
              values={[
                ["Mã phiếu", detail.code],
                ["Ngày lập", formatDate(detail.repairDate)],
                ["Trạng thái", statusLabels[detail.status]],
                ["Người tạo", refName(detail.createdBy)],
                ["Ngày tạo", timestamp(detail.createdAt)],
                ["Cập nhật", timestamp(detail.updatedAt)],
              ]}
            />
            <DetailBlock
              title="Thông tin thiết bị"
              values={[
                [
                  "Đối tượng",
                  detail.targetKind === "DEVICE"
                    ? "Thiết bị"
                    : "Linh kiện serial",
                ],
                ["Tên thiết bị", detail.targetName],
                ["Mã tài sản", detail.assetCode],
                ["Serial", detail.serial],
                ["Người bàn giao", refName(detail.fromKeeperId)],
                ["Bộ phận", refName(detail.fromDepartmentId)],
                ["Kho trước sửa", refName(detail.fromWarehouseId)],
                ["Vị trí", refName(detail.fromLocationId)],
              ]}
            />
            <DetailBlock
              title="Thông tin lỗi"
              values={[
                [
                  "Tình trạng trước sửa",
                  DEVICE_TYPE_LABELS[detail.conditionBefore],
                ],
                ["Mức độ", severityLabels[detail.severity]],
                ["Mô tả lỗi", detail.issueDescription],
              ]}
            />
            <DetailBlock
              title="Quá trình sửa chữa"
              values={[
                ["Hình thức", typeLabels[detail.repairType]],
                ["Đơn vị sửa", detail.vendor],
                ["Liên hệ", detail.vendorContact],
                ["Người phụ trách", detail.responsiblePerson],
                ["Ngày tiếp nhận", timestamp(detail.receivedAt)],
                ["Người tiếp nhận", refName(detail.receivedBy)],
                ["Ngày gửi sửa", formatDate(detail.sentAt)],
                ["Dự kiến hoàn thành", formatDate(detail.expectedCompletionAt)],
                ["Nội dung sửa", detail.repairContent],
                ["Ghi chú", detail.note],
              ]}
            />
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 font-semibold">Linh kiện thay thế</h3>
              {detail.parts?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left">Linh kiện</th>
                        <th className="p-2 text-left">Serial</th>
                        <th className="p-2 text-right">Số lượng</th>
                        <th className="p-2 text-left">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.parts.map((line, index) => (
                        <tr key={index} className="border-b last:border-0">
                          <td className="p-2">{refName(line.partId)}</td>
                          <td className="p-2">{line.serial ?? "—"}</td>
                          <td className="p-2 text-right">{line.quantity}</td>
                          <td className="p-2">{line.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Không sử dụng linh kiện thay thế.
                </p>
              )}
            </section>
            <DetailBlock
              title="Chi phí"
              values={[
                ["Kiểm tra", formatMoney(detail.inspectionCost)],
                ["Sửa chữa", formatMoney(detail.repairCost)],
                ["Linh kiện", formatMoney(detail.partsCost)],
                ["Chi phí khác", formatMoney(detail.otherCost)],
                ["Tổng chi phí", formatMoney(detail.totalCost)],
              ]}
            />
            <DetailBlock
              title="Kết quả"
              values={[
                ["Kết quả sửa chữa", detail.result],
                [
                  "Tình trạng sau sửa",
                  detail.conditionAfter
                    ? DEVICE_TYPE_LABELS[detail.conditionAfter]
                    : "—",
                ],
                [
                  "Hướng xử lý",
                  detail.outcome ? outcomeLabels[detail.outcome] : "—",
                ],
                ["Kho nhận", refName(detail.destinationWarehouseId)],
                ["Vị trí nhận", refName(detail.destinationLocationId)],
                ["Người hoàn tất", refName(detail.completedBy)],
                ["Ngày hoàn tất", timestamp(detail.completedAt)],
                ["Lý do hủy", detail.cancelReason],
              ]}
            />
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 font-semibold">Lịch sử trạng thái</h3>
              <ol className="space-y-3">
                {detail.statusHistory.map((event, index) => (
                  <li
                    key={`${event.status}-${index}`}
                    className="flex gap-3 text-sm"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <Badge variant={statusVariant(event.status)}>
                        {statusLabels[event.status]}
                      </Badge>
                      <p className="mt-1 text-muted-foreground">
                        {timestamp(event.at)} · {refName(event.by)}
                      </p>
                      {event.note && <p>{event.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <div className="flex justify-between">
              <Button asChild variant="outline">
                <Link
                  href={
                    detail.deviceId?._id
                      ? `/thiet-bi/${detail.deviceId._id}`
                      : "/linh-kien"
                  }
                >
                  Xem hồ sơ đối tượng
                </Link>
              </Button>
              {["COMPLETED", "UNREPAIRABLE"].includes(detail.status) && (
                <Button onClick={() => printRepair(detail)}>
                  <Printer /> In phiếu
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
