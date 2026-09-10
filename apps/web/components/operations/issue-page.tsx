"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  Edit,
  Eye,
  Loader2,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, apiFetchAllPages } from "@/lib/api";
import { loadCatalogOptions, CatalogOption, formatDate } from "@/lib/catalogs";

type Ref = { _id: string; name?: string; displayName?: string; code?: string };
type Device = Ref & { assetCode: string; serial?: string; modelId?: Ref };
type Part = Ref & { unitId?: Ref; isActive?: boolean; trackingMode?: string };
type Line = {
  kind: "DEVICE" | "PART";
  deviceId?: Device;
  partId?: Part;
  quantity: number;
  handoverCondition: string;
  note?: string;
  serials?: string[];
};
type Row = {
  _id: string;
  code: string;
  operationDate: string;
  status: string;
  sourceWarehouseId?: Ref;
  receiverKeeperId?: Ref;
  receiverDepartmentId?: Ref;
  createdBy?: Ref;
  completedBy?: Ref;
  closedBy?: Ref;
  completedAt?: string;
  closedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  reason: string;
  note?: string;
  lines: Line[];
};
type FormLine = {
  key: string;
  kind: "DEVICE" | "PART";
  deviceId: string;
  partId: string;
  quantity: number;
  handoverCondition: string;
  note: string;
};
const conditions = [
  { value: "GOOD", label: "Tốt" },
  { value: "DEGRADED", label: "Suy giảm" },
  { value: "BROKEN", label: "Hỏng" },
];
const condition = (value: string) =>
  conditions.find((item) => item.value === value)?.label ?? value;
const pending = (row: Row) => ["PENDING", "DRAFT"].includes(row.status);
const status = (row: Row) =>
  pending(row)
    ? "Chưa hoàn tất"
    : row.status === "COMPLETED"
      ? "Hoàn tất"
      : row.status;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const emptyForm = () => ({
  operationDate: today(),
  sourceWarehouseId: "",
  receiverKeeperId: "",
  receiverDepartmentId: "",
  reason: "",
  note: "",
});
const newLine = (): FormLine => ({
  key: crypto.randomUUID(),
  kind: "DEVICE",
  deviceId: "",
  partId: "",
  quantity: 1,
  handoverCondition: "GOOD",
  note: "",
});
const timestamp = (value?: string) =>
  value ? new Date(value).toLocaleString("vi-VN") : "—";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

function LineTable({ row }: { row: Row }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {[
              "Loại",
              "Thiết bị / linh kiện",
              "Mã tài sản / Serial",
              "Số lượng",
              "Đơn vị",
              "Tình trạng",
              "Ghi chú",
            ].map((label) => (
              <th className="p-2 text-left" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row.lines.map((line, index) => (
            <tr className="border-t" key={index}>
              <td className="p-2">
                {line.kind === "DEVICE" ? "Thiết bị" : "Linh kiện"}
              </td>
              <td className="p-2">
                {line.deviceId?.assetCode ?? line.partId?.name ?? "—"}
              </td>
              <td className="p-2">
                {[
                  line.deviceId?.assetCode ?? line.partId?.code,
                  line.deviceId?.serial ?? line.serials?.join(", "),
                ]
                  .filter(Boolean)
                  .join(" / ")}
              </td>
              <td className="p-2">{line.quantity}</td>
              <td className="p-2">
                {line.kind === "DEVICE"
                  ? "Chiếc"
                  : (line.partId?.unitId?.name ?? "—")}
              </td>
              <td className="p-2">{condition(line.handoverCondition)}</td>
              <td className="p-2">{line.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IssuePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("operations.manage");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<FormLine[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [keepers, setKeepers] = useState<CatalogOption[]>([]);
  const [departments, setDepartments] = useState<CatalogOption[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [stock, setStock] = useState<{ partId: Part; quantity: number }[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [partLoading, setPartLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [partError, setPartError] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const needsDevices = lines.some((line) => line.kind === "DEVICE");
  const needsParts = lines.some((line) => line.kind === "PART");
  const stockLoading =
    (needsDevices && deviceLoading) || (needsParts && partLoading);
  const [stockVersion, setStockVersion] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<{
    row: Row;
    action: "complete" | "delete";
  } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Không thể thực hiện yêu cầu.");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{
        data: Row[];
        meta: { totalPages: number };
      }>(`/api/operations?type=ISSUE&limit=20&page=${page}`);
      setRows(result.data);
      setTotalPages(result.meta.totalPages);
      if (page > result.meta.totalPages) setPage(result.meta.totalPages);
    } catch (e) {
      report(e);
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!canManage) return;
    void Promise.all([
      loadCatalogOptions("warehouses"),
      loadCatalogOptions("keepers", { status: "ACTIVE" }),
      loadCatalogOptions("departments"),
    ])
      .then(([w, k, d]) => {
        setWarehouses(w);
        setKeepers(k);
        setDepartments(d);
      })
      .catch(report);
  }, [canManage]);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setDevices([]);
    setDeviceError("");
    setDeviceLoading(false);
    if (!form.sourceWarehouseId || !showForm || !needsDevices) return;
    setDeviceLoading(true);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    void apiFetchAllPages<Device>(
      "/api/devices",
      new URLSearchParams({
        warehouseId: form.sourceWarehouseId,
        available: "true",
      }),
      100,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) setDevices(data);
      })
      .catch(() => {
        if (!cancelled)
          setDeviceError("Không thể tải danh sách thiết bị. Vui lòng thử lại.");
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (!cancelled) setDeviceLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.sourceWarehouseId, showForm, stockVersion, needsDevices]);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setStock([]);
    setPartError("");
    setPartLoading(false);
    if (!form.sourceWarehouseId || !showForm || !needsParts) return;
    setPartLoading(true);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    void apiFetch<{ data: { partId: Part | null; quantity: number }[] }>(
      `/api/inventory?warehouseId=${form.sourceWarehouseId}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!cancelled)
          setStock(
            result.data.filter(
              (item): item is { partId: Part; quantity: number } =>
                !!item.partId &&
                item.partId.isActive !== false &&
                item.quantity > 0,
            ),
          );
      })
      .catch(() => {
        if (!cancelled)
          setPartError("Không thể tải danh sách linh kiện. Vui lòng thử lại.");
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (!cancelled) setPartLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.sourceWarehouseId, showForm, stockVersion, needsParts]);
  function lineError(line: FormLine): string {
    if (!(line.kind === "DEVICE" ? line.deviceId : line.partId))
      return "Vui lòng chọn thiết bị hoặc linh kiện cho dòng này.";
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      return "Số lượng phải là số nguyên lớn hơn 0.";
    if (!line.handoverCondition) return "Vui lòng chọn tình trạng khi giao.";
    if (line.kind === "DEVICE") {
      if (!devices.some((device) => device._id === line.deviceId))
        return "Thiết bị không còn khả dụng. Vui lòng chọn lại.";
      if (
        lines.some(
          (other) => other.key !== line.key && other.deviceId === line.deviceId,
        )
      )
        return "Thiết bị đã được chọn ở dòng khác.";
    } else {
      const available =
        stock.find((item) => item.partId._id === line.partId)?.quantity ?? 0;
      const total = lines
        .filter((item) => item.kind === "PART" && item.partId === line.partId)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (total > available)
        return "Số lượng cấp phát vượt quá tồn kho hiện tại.";
    }
    return "";
  }
  function reset() {
    setValidationAttempted(false);
    setForm(emptyForm());
    setLines([newLine()]);
    setEditing(null);
  }
  function changeLine(key: string, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  async function fetchRow(row: Row) {
    return (await apiFetch<{ data: Row }>(`/api/operations/${row._id}`)).data;
  }
  async function open(row: Row, edit: boolean) {
    setError("");
    setBusy(true);
    try {
      const fresh = await fetchRow(row);
      if (!edit) {
        setDetail(fresh);
        return;
      }
      if (!pending(fresh)) throw new Error("Chỉ được sửa phiếu chưa hoàn tất.");
      setValidationAttempted(false);
      setEditing(fresh);
      setForm({
        operationDate: fresh.operationDate.slice(0, 10),
        sourceWarehouseId: fresh.sourceWarehouseId?._id ?? "",
        receiverKeeperId: fresh.receiverKeeperId?._id ?? "",
        receiverDepartmentId: fresh.receiverDepartmentId?._id ?? "",
        reason: fresh.reason,
        note: fresh.note ?? "",
      });
      setLines(
        fresh.lines.map((line) => ({
          key: crypto.randomUUID(),
          kind: line.kind,
          deviceId: line.deviceId?._id ?? "",
          partId: line.partId?._id ?? "",
          quantity: line.quantity,
          handoverCondition: line.handoverCondition ?? "GOOD",
          note: line.note ?? "",
        })),
      );
      setShowForm(true);
      setStockVersion((v) => v + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setValidationAttempted(true);
    if (
      stockLoading ||
      (needsDevices && deviceError) ||
      (needsParts && partError)
    ) {
      setError("Vui lòng tải lại danh sách trước khi lưu.");
      return;
    }
    if (lines.some((line) => lineError(line))) return;
    if (!lines.length || !form.reason.trim()) {
      setError("Nhập lý do và ít nhất một dòng cấp phát.");
      return;
    }
    const selectedDevices = new Set<string>();
    const totals = new Map<string, number>();
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        setError("Số lượng phải là số nguyên lớn hơn 0.");
        return;
      }
      if (line.kind === "DEVICE") {
        if (
          !devices.some((device) => device._id === line.deviceId) ||
          selectedDevices.has(line.deviceId)
        ) {
          setError("Thiết bị không còn khả dụng hoặc bị chọn trùng.");
          return;
        }
        selectedDevices.add(line.deviceId);
      } else
        totals.set(line.partId, (totals.get(line.partId) ?? 0) + line.quantity);
    }
    for (const [id, quantity] of totals)
      if (
        quantity > (stock.find((item) => item.partId._id === id)?.quantity ?? 0)
      ) {
        setError("Tổng số lượng linh kiện vượt tồn kho.");
        return;
      }
    setBusy(true);
    try {
      await apiFetch(
        editing ? `/api/operations/${editing._id}` : "/api/operations",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            reason: form.reason.trim(),
            type: "ISSUE",
            lines: lines.map((line) => ({
              kind: line.kind,
              deviceId: line.kind === "DEVICE" ? line.deviceId : undefined,
              partId: line.kind === "PART" ? line.partId : undefined,
              quantity: line.kind === "DEVICE" ? 1 : line.quantity,
              handoverCondition: line.handoverCondition,
              note: line.note.trim() || undefined,
            })),
          }),
        },
      );
      setSuccess(
        editing
          ? "Cập nhật phiếu cấp phát thành công"
          : "Tạo phiếu cấp phát thành công",
      );
      reset();
      setShowForm(false);
      if (page !== 1) setPage(1);
      else await load();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function perform() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch(
        `/api/operations/${confirm.row._id}${confirm.action === "complete" ? "/complete" : ""}`,
        { method: confirm.action === "complete" ? "PATCH" : "DELETE" },
      );
      setSuccess(
        confirm.action === "complete"
          ? "Hoàn tất phiếu cấp phát thành công"
          : "Xóa phiếu cấp phát thành công",
      );
      if (editing?._id === confirm.row._id) {
        reset();
        setShowForm(false);
      }
      setConfirm(null);
      setStockVersion((v) => v + 1);
      await load();
    } catch (e) {
      report(e);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  async function print(row: Row) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên.");
      return;
    }
    popup.opener = null;
    popup.document.title = "Đang tải phiếu cấp phát…";
    setBusy(true);
    setError("");
    try {
      const fresh = await fetchRow(row);
      const e = escapeHtml;
      const body = fresh.lines
        .map(
          (line) =>
            `<tr><td>${e(line.deviceId?.assetCode ?? line.partId?.name)}</td><td>${e(line.deviceId?.assetCode ?? line.partId?.code)}</td><td>${e(line.deviceId?.serial ?? line.serials?.join(", "))}</td><td>${line.quantity}</td><td>${e(line.kind === "DEVICE" ? "Chiếc" : line.partId?.unitId?.name)}</td><td>${e(condition(line.handoverCondition))}</td><td>${e(line.note)}</td></tr>`,
        )
        .join("");
      popup.document.write(
        `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${e(fresh.code)}</title><style>body{font:14px Arial;margin:32px;color:#111}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:8px;text-align:left}p{white-space:pre-wrap}.sign{display:flex;justify-content:space-around;margin-top:40px}tr{break-inside:avoid}@page{size:A4 landscape;margin:15mm}</style></head><body><h1>PHIẾU CẤP PHÁT</h1><p>Mã phiếu: ${e(fresh.code)} — Ngày: ${e(formatDate(fresh.operationDate))} — ${e(status(fresh))}</p><p>Người giao: ${e((fresh.completedBy ?? fresh.closedBy ?? fresh.createdBy)?.displayName)}</p><p>Người nhận: ${e(fresh.receiverKeeperId?.displayName)} — Bộ phận: ${e(fresh.receiverDepartmentId?.name)}</p><p>Kho xuất: ${e(fresh.sourceWarehouseId?.name)}</p><p>Lý do: ${e(fresh.reason)}</p><p>Ghi chú: ${e(fresh.note)}</p><table><thead><tr><th>Thiết bị / linh kiện</th><th>Mã tài sản / Mã hàng</th><th>Serial</th><th>Số lượng</th><th>Đơn vị</th><th>Tình trạng</th><th>Ghi chú</th></tr></thead><tbody>${body}</tbody></table><div class="sign"><div>Người giao<br>(Ký, ghi rõ họ tên)</div><div>Người nhận<br>(Ký, ghi rõ họ tên)</div></div></body></html>`,
      );
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (e) {
      popup.close();
      report(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Cấp phát</h2>
        {canManage && (
          <Button
            disabled={busy}
            onClick={() => {
              reset();
              setError("");
              setSuccess("");
              setShowForm(true);
            }}
          >
            <Plus /> Tạo phiếu cấp phát
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded bg-green-50 p-3 text-green-700">
          {success}
        </p>
      )}
      {showForm && canManage && (
        <form
          onSubmit={save}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <h3 className="font-semibold">
            {editing ? "Sửa phiếu cấp phát" : "Tạo phiếu cấp phát"}
          </h3>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Mã phiếu *"
                value={
                  editing?.code ??
                  "Hệ thống tự sinh khi lưu (ISSUE-YYYYMMDD-NNN)"
                }
                readOnly
              />
              <Input
                label="Ngày cấp phát *"
                type="date"
                required
                value={form.operationDate}
                onChange={(e) =>
                  setForm({ ...form, operationDate: e.target.value })
                }
              />
              <Select
                label="Kho xuất *"
                required
                placeholder="Chọn kho"
                options={warehouses}
                value={form.sourceWarehouseId}
                onChange={(e) => {
                  setForm({ ...form, sourceWarehouseId: e.target.value });
                  setDevices([]);
                  setStock([]);
                  setLines((current) =>
                    current.map((line) => ({
                      ...line,
                      deviceId: "",
                      partId: "",
                      quantity: 1,
                    })),
                  );
                  setValidationAttempted(false);
                }}
              />
              <Select
                label="Người nhận *"
                required
                placeholder="Chọn người nhận"
                options={keepers}
                value={form.receiverKeeperId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    receiverKeeperId: e.target.value,
                    receiverDepartmentId:
                      keepers.find((k) => k.value === e.target.value)
                        ?.departmentId ?? "",
                  })
                }
              />
              <Select
                label="Bộ phận nhận *"
                required
                placeholder="Chọn bộ phận"
                options={departments}
                value={form.receiverDepartmentId}
                onChange={(e) =>
                  setForm({ ...form, receiverDepartmentId: e.target.value })
                }
              />
              <Textarea
                label="Lý do / Nội dung cấp phát *"
                required
                maxLength={1000}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
              <Textarea
                label="Ghi chú"
                maxLength={1000}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <h3 className="font-semibold">
              Danh sách thiết bị / linh kiện cấp phát
            </h3>
            {(deviceError || partError) && (
              <div
                role="alert"
                className="rounded border border-destructive p-3 text-sm text-destructive"
              >
                {deviceError && <p>{deviceError}</p>}
                {partError && <p>{partError}</p>}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStockVersion((value) => value + 1)}
                >
                  Thử tải lại
                </Button>
              </div>
            )}
            {lines.map((line, index) => {
              const device = devices.find((d) => d._id === line.deviceId);
              const part = stock.find((s) => s.partId._id === line.partId);
              const available =
                line.kind === "DEVICE"
                  ? devices.some((d) => d._id === line.deviceId)
                  : stock.some((s) => s.partId._id === line.partId);
              const itemLoading =
                line.kind === "DEVICE" ? deviceLoading : partLoading;
              const itemError =
                line.kind === "DEVICE" ? deviceError : partError;
              const choices =
                line.kind === "DEVICE"
                  ? devices.filter(
                      (d) =>
                        d._id === line.deviceId ||
                        !lines.some((other) => other.deviceId === d._id),
                    )
                  : stock;
              const placeholder = !form.sourceWarehouseId
                ? "Vui lòng chọn kho trước"
                : itemLoading
                  ? line.kind === "DEVICE"
                    ? "Đang tải thiết bị..."
                    : "Đang tải linh kiện..."
                  : itemError
                    ? "Không thể tải danh sách. Vui lòng thử lại."
                    : !choices.length
                      ? line.kind === "DEVICE"
                        ? "Không có thiết bị khả dụng trong kho này"
                        : "Không có linh kiện còn tồn trong kho này"
                      : "Chọn thiết bị / linh kiện";
              const rowError =
                (validationAttempted || line.deviceId || line.partId) &&
                !itemLoading &&
                !itemError
                  ? lineError(line)
                  : "";
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded border p-3 md:grid-cols-4"
                >
                  <Select
                    label={`Dòng ${index + 1} · Loại`}
                    value={line.kind}
                    options={[
                      { value: "DEVICE", label: "Thiết bị" },
                      { value: "PART", label: "Linh kiện" },
                    ]}
                    onChange={(e) =>
                      changeLine(line.key, {
                        kind: e.target.value as FormLine["kind"],
                        deviceId: "",
                        partId: "",
                        quantity: 1,
                      })
                    }
                  />
                  <Select
                    label="Thiết bị / linh kiện *"
                    required
                    disabled={!form.sourceWarehouseId || !line.kind}
                    aria-busy={itemLoading}
                    aria-invalid={!!rowError}
                    aria-describedby={
                      rowError ? `issue-line-${line.key}` : undefined
                    }
                    placeholder={placeholder}
                    onInvalid={() => setValidationAttempted(true)}
                    value={line.kind === "DEVICE" ? line.deviceId : line.partId}
                    options={[
                      ...(!available && (line.deviceId || line.partId)
                        ? [
                            {
                              value: line.deviceId || line.partId,
                              label: "Không còn khả dụng — chọn lại",
                            },
                          ]
                        : []),
                      ...(line.kind === "DEVICE"
                        ? devices
                            .filter(
                              (d) =>
                                d._id === line.deviceId ||
                                !lines.some(
                                  (other) => other.deviceId === d._id,
                                ),
                            )
                            .map((d) => ({
                              value: d._id,
                              label: `${d.modelId?.name ?? "Thiết bị"} - ${d.assetCode}${d.serial ? ` - ${d.serial}` : ""}`,
                            }))
                        : stock.map((s) => ({
                            value: s.partId._id,
                            label: `${s.partId.name} - Tồn: ${s.quantity} ${s.partId.unitId?.name ?? ""} (${s.partId.code})`,
                          }))),
                    ]}
                    onChange={(e) =>
                      changeLine(
                        line.key,
                        line.kind === "DEVICE"
                          ? {
                              deviceId: e.target.value,
                              partId: "",
                              quantity: 1,
                            }
                          : {
                              partId: e.target.value,
                              deviceId: "",
                              quantity: 1,
                            },
                      )
                    }
                  />
                  <Input
                    label="Mã tài sản / Serial"
                    readOnly
                    value={
                      line.kind === "DEVICE"
                        ? [device?.assetCode, device?.serial]
                            .filter(Boolean)
                            .join(" / ")
                        : (part?.partId.code ?? "")
                    }
                  />
                  <Input
                    label="Số lượng *"
                    required
                    type="number"
                    min={1}
                    step={1}
                    max={line.kind === "PART" ? part?.quantity : 1}
                    onInvalid={() => setValidationAttempted(true)}
                    readOnly={line.kind === "DEVICE"}
                    value={line.quantity}
                    onChange={(e) =>
                      changeLine(line.key, { quantity: Number(e.target.value) })
                    }
                  />
                  <Input
                    label="Đơn vị tính"
                    readOnly
                    value={
                      line.kind === "DEVICE"
                        ? "Chiếc"
                        : (part?.partId.unitId?.name ?? "")
                    }
                  />
                  <Select
                    label="Tình trạng khi giao *"
                    required
                    value={line.handoverCondition}
                    options={conditions}
                    onChange={(e) =>
                      changeLine(line.key, {
                        handoverCondition: e.target.value,
                      })
                    }
                  />
                  <Input
                    label="Ghi chú dòng"
                    maxLength={500}
                    value={line.note}
                    onChange={(e) =>
                      changeLine(line.key, { note: e.target.value })
                    }
                  />
                  {line.kind === "PART" && part && (
                    <p className="text-sm text-muted-foreground md:col-span-4">
                      Tồn khả dụng: {part.quantity} {part.partId.unitId?.name}
                    </p>
                  )}
                  {rowError && (
                    <p
                      id={`issue-line-${line.key}`}
                      role="alert"
                      className="text-sm text-destructive md:col-span-4"
                    >
                      {rowError}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    title={`Xóa dòng ${index + 1}`}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                  >
                    <Trash2 /> Xóa dòng
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              disabled={lines.length >= 200}
              onClick={() => setLines((current) => [...current, newLine()])}
            >
              <Plus /> Thêm dòng
            </Button>
            <div className="flex gap-2">
              <Button type="submit" disabled={stockLoading || !lines.length}>
                {busy && <Loader2 className="animate-spin" />} Lưu
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setShowForm(false);
                }}
              >
                Hủy
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Mã phiếu",
                "Ngày",
                "Người nhận",
                "Bộ phận",
                "Kho xuất",
                "Số lượng dòng",
                "Trạng thái",
                "Thao tác",
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-6" colSpan={8}>
                  Đang tải…
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td className="p-6" colSpan={8}>
                  Chưa có phiếu cấp phát.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr className="border-t" key={row._id}>
                  <td className="p-3">{row.code}</td>
                  <td className="p-3">{formatDate(row.operationDate)}</td>
                  <td className="p-3">
                    {row.receiverKeeperId?.displayName ?? "—"}
                  </td>
                  <td className="p-3">
                    {row.receiverDepartmentId?.name ?? "—"}
                  </td>
                  <td className="p-3">{row.sourceWarehouseId?.name ?? "—"}</td>
                  <td className="p-3">{row.lines.length}</td>
                  <td className="p-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 ${pending(row) ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}
                    >
                      {status(row)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        title="Xem chi tiết"
                        onClick={() => void open(row, false)}
                      >
                        <Eye /> Xem chi tiết
                      </Button>
                      {canManage && pending(row) && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            title="Sửa"
                            onClick={() => void open(row, true)}
                          >
                            <Edit /> Sửa
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy}
                            title="Hoàn tất"
                            onClick={() =>
                              setConfirm({ row, action: "complete" })
                            }
                          >
                            <CheckCircle /> Hoàn tất
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        title="In"
                        onClick={() => void print(row)}
                      >
                        <Printer /> In
                      </Button>
                      {canManage && pending(row) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          title="Xóa"
                          onClick={() => setConfirm({ row, action: "delete" })}
                        >
                          <Trash2 /> Xóa
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Trước
        </Button>
        <span>
          Trang {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </Button>
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(value) => {
          if (!value) setDetail(null);
        }}
        title={`Phiếu cấp phát ${detail?.code ?? ""}`}
        className="max-w-5xl"
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-3 md:grid-cols-2">
              {Object.entries({
                "Ngày cấp phát": formatDate(detail.operationDate),
                "Trạng thái": status(detail),
                "Kho xuất": detail.sourceWarehouseId?.name,
                "Người nhận": detail.receiverKeeperId?.displayName,
                "Bộ phận": detail.receiverDepartmentId?.name,
                "Lý do": detail.reason,
                "Ghi chú": detail.note,
                "Ngày tạo": timestamp(detail.createdAt),
                "Ngày cập nhật": timestamp(detail.updatedAt),
                "Người tạo": detail.createdBy?.displayName,
                "Người hoàn tất": (detail.completedBy ?? detail.closedBy)
                  ?.displayName,
                "Thời gian hoàn tất": timestamp(
                  detail.completedAt ?? detail.closedAt,
                ),
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            <LineTable row={detail} />
            <Button disabled={busy} onClick={() => void print(detail)}>
              <Printer /> In
            </Button>
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(value) => {
          if (!value && !busy) setConfirm(null);
        }}
        title={
          confirm?.action === "complete"
            ? "Hoàn tất phiếu cấp phát"
            : "Xóa phiếu cấp phát"
        }
      >
        <p>
          {confirm?.action === "complete"
            ? "Bạn có chắc chắn muốn hoàn tất phiếu cấp phát này? Sau khi hoàn tất, hệ thống sẽ cập nhật kho và trạng thái thiết bị."
            : "Bạn có chắc chắn muốn xóa phiếu cấp phát này?"}
        </p>
        <p className="my-3 font-medium">{confirm?.row.code}</p>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm(null)}
          >
            Hủy
          </Button>
          <Button
            variant={confirm?.action === "delete" ? "destructive" : "default"}
            disabled={busy}
            onClick={() => void perform()}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirm?.action === "complete" ? "Xác nhận hoàn tất" : "Xóa"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
