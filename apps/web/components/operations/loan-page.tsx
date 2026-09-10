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
  Undo2,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, apiFetchAllPages } from "@/lib/api";
import { loadCatalogOptions, CatalogOption } from "@/lib/catalogs";
import {
  LoanRow,
  LoanDevice,
  LoanReturn,
  outConditions,
  inConditions,
  conditionLabel,
  resultLabel,
  resultForCondition,
  loanPending,
  loanReturnable,
  loanStatus,
  localLoanDay,
  overdueDays,
  loanDate,
  loanTimestamp,
  loanDeviceName,
  loanPrintHtml,
} from "./loan-utils";

type FormLine = {
  key: string;
  deviceId: string;
  conditionOut: string;
  conditionOutDescription: string;
  accessoryNote: string;
  note: string;
};
type ReturnLine = {
  selected: boolean;
  deviceId: string;
  conditionIn: string;
  conditionInDescription: string;
  note: string;
};
type ReturnPayload = {
  returnedAt: string;
  note: string;
  items: {
    deviceId: string;
    conditionIn: string;
    conditionInDescription: string;
    note: string;
  }[];
};
type Confirmation =
  | { row: LoanRow; action: "complete" | "delete" }
  | { row: LoanRow; action: "return"; payload: ReturnPayload };
const newLine = (): FormLine => ({
  key: crypto.randomUUID(),
  deviceId: "",
  conditionOut: "GOOD",
  conditionOutDescription: "",
  accessoryNote: "",
  note: "",
});
const initialForm = () => ({
  operationDate: localLoanDay(),
  dueDate: "",
  sourceWarehouseId: "",
  receiverKeeperId: "",
  receiverDepartmentId: "",
  reason: "",
  note: "",
});

function DeviceTable({ row }: { row: LoanRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {[
              "Thiết bị",
              "Mã tài sản",
              "Serial",
              "Tình trạng khi giao",
              "Phụ kiện / Ghi chú",
              "Ngày giao",
              "Theo phiếu mượn",
              "Trạng thái thiết bị hiện tại",
              "Thông tin trả",
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
              <td className="p-2">{loanDeviceName(line)}</td>
              <td className="p-2">
                {line.assetCode ?? line.deviceId?.assetCode ?? "—"}
              </td>
              <td className="p-2">
                {line.serial ?? line.deviceId?.serial ?? "—"}
              </td>
              <td className="p-2">
                {conditionLabel(line.conditionOut ?? line.handoverCondition)}
                {line.conditionOutDescription && (
                  <p>{line.conditionOutDescription}</p>
                )}
              </td>
              <td className="p-2 whitespace-pre-wrap">
                {[line.accessoryNote, line.note].filter(Boolean).join("\n") ||
                  "—"}
              </td>
              <td className="p-2">
                {loanTimestamp(line.handedOverAt ?? row.dispatchedAt)}
              </td>
              <td className="p-2">
                {line.returned
                  ? "Đã trả / xử lý"
                  : loanPending(row)
                    ? "Chưa giao"
                    : "Còn mượn"}
              </td>
              <td className="p-2">{resultLabel(line.deviceId?.usageStatus)}</td>
              <td className="p-2">
                {line.returned ? (
                  <>
                    <p>{loanDate(line.returnedAt)}</p>
                    <p>
                      {conditionLabel(line.conditionIn)}{" "}
                      {line.conditionInDescription}
                    </p>
                    <p>{line.returnReceivedBy?.displayName ?? "—"}</p>
                    <p>{line.returnNote}</p>
                    <p>{resultLabel(line.returnResult)}</p>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function History({
  row,
  print,
  busy,
}: {
  row: LoanRow;
  print: (row: LoanRow, batchId?: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Lịch sử trả thiết bị</h3>
      {!row.returnHistory?.length && (
        <p className="text-muted-foreground">
          Chưa có biên bản trả được ghi nhận. Thông tin trả cũ (nếu có) hiển thị
          theo từng thiết bị ở trên.
        </p>
      )}
      {row.returnHistory?.map((batch, index) => (
        <div key={batch._id} className="space-y-2 rounded border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-medium">
              Lần trả {index + 1} · {loanDate(batch.returnedAt)}
            </h4>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void print(row, batch._id)}
            >
              <Printer /> In biên bản trả
            </Button>
          </div>
          <p>
            Người nhận lại: {batch.receivedBy?.displayName ?? "—"} · Ghi nhận
            lúc: {loanTimestamp(batch.recordedAt)}
          </p>
          <p className="whitespace-pre-wrap">{batch.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    "Thiết bị",
                    "Mã tài sản / Serial",
                    "Lúc giao",
                    "Khi trả",
                    "Kết quả xử lý",
                    "Ghi chú",
                  ].map((label) => (
                    <th className="p-2 text-left" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batch.items.map((item) => (
                  <tr key={item.deviceId} className="border-t">
                    <td className="p-2">{item.deviceName}</td>
                    <td className="p-2">
                      {[item.assetCode, item.serial]
                        .filter(Boolean)
                        .join(" / ")}
                    </td>
                    <td className="p-2">
                      {conditionLabel(item.conditionOut)}{" "}
                      {item.conditionOutDescription}
                    </td>
                    <td className="p-2">
                      {conditionLabel(item.conditionIn)}{" "}
                      {item.conditionInDescription}
                    </td>
                    <td className="p-2">{resultLabel(item.result)}</td>
                    <td className="p-2 whitespace-pre-wrap">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoanPage() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("operations.manage");
  const [tab, setTab] = useState<"borrow" | "return">("borrow");
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LoanRow | null>(null);
  const [form, setForm] = useState(initialForm);
  const [lines, setLines] = useState<FormLine[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [keepers, setKeepers] = useState<CatalogOption[]>([]);
  const [departments, setDepartments] = useState<CatalogOption[]>([]);
  const [devices, setDevices] = useState<LoanDevice[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceVersion, setDeviceVersion] = useState(0);
  const [detail, setDetail] = useState<LoanRow | null>(null);
  const [returnRow, setReturnRow] = useState<LoanRow | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnedAt, setReturnedAt] = useState(localLoanDay);
  const [returnNote, setReturnNote] = useState("");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Không thể thực hiện yêu cầu.");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: "LOAN",
        page: String(page),
        limit: "20",
        q: search,
      });
      if (tab === "return") params.set("returnable", "true");
      const result = await apiFetch<{
        data: LoanRow[];
        meta: { totalPages: number };
      }>(`/api/operations?${params}`);
      setRows(result.data);
      setTotalPages(result.meta.totalPages);
      if (page > result.meta.totalPages) setPage(result.meta.totalPages);
    } catch (e) {
      report(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, tab]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
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
    let cancelled = false;
    setDevices([]);
    setDeviceLoading(false);
    if (!showForm || !form.sourceWarehouseId) return;
    setDeviceLoading(true);
    void apiFetchAllPages<LoanDevice>(
      "/api/devices",
      new URLSearchParams({
        warehouseId: form.sourceWarehouseId,
        usageStatus: "IN_STOCK",
      }),
    )
      .then((items) => {
        if (!cancelled)
          setDevices(
            items.filter(
              (item) =>
                item.techCondition !== "BROKEN" &&
                !item.keeperId &&
                !item.loanId,
            ),
          );
      })
      .catch((e) => {
        if (!cancelled) report(e);
      })
      .finally(() => {
        if (!cancelled) setDeviceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showForm, form.sourceWarehouseId, deviceVersion]);
  function reset() {
    setEditing(null);
    setForm(initialForm());
    setLines([newLine()]);
  }
  function changeTab(value: "borrow" | "return") {
    setTab(value);
    setPage(1);
    setShowForm(false);
    setReturnRow(null);
    setError("");
    setSuccess("");
  }
  function changeLine(key: string, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  async function fetchRow(row: LoanRow) {
    return (await apiFetch<{ data: LoanRow }>(`/api/operations/${row._id}`))
      .data;
  }
  async function open(row: LoanRow, action: "detail" | "edit" | "return") {
    setBusy(true);
    setError("");
    try {
      const fresh = await fetchRow(row);
      if (action === "detail") {
        setDetail(fresh);
        return;
      }
      if (action === "edit") {
        if (!loanPending(fresh))
          throw new Error("Chỉ được sửa phiếu chưa giao.");
        setEditing(fresh);
        setForm({
          operationDate: fresh.operationDate.slice(0, 10),
          dueDate: fresh.dueDate?.slice(0, 10) ?? "",
          sourceWarehouseId: fresh.sourceWarehouseId?._id ?? "",
          receiverKeeperId: fresh.receiverKeeperId?._id ?? "",
          receiverDepartmentId: fresh.receiverDepartmentId?._id ?? "",
          reason: fresh.reason,
          note: fresh.note ?? "",
        });
        setLines(
          fresh.lines
            .filter((line) => line.kind === "DEVICE")
            .map((line) => ({
              key: crypto.randomUUID(),
              deviceId: line.deviceId?._id ?? "",
              conditionOut:
                line.conditionOut ??
                (line.handoverCondition === "DEGRADED"
                  ? "MINOR_FAULT"
                  : "GOOD"),
              conditionOutDescription: line.conditionOutDescription ?? "",
              accessoryNote: line.accessoryNote ?? "",
              note: line.note ?? "",
            })),
        );
        setShowForm(true);
        setDeviceVersion((v) => v + 1);
      } else {
        if (!loanReturnable(fresh))
          throw new Error("Phiếu không có thiết bị còn mượn để trả.");
        setTab("return");
        setPage(1);
        setShowForm(false);
        setReturnRow(fresh);
        setReturnedAt(localLoanDay());
        setReturnNote("");
        setReturnLines(
          fresh.lines
            .filter(
              (line) =>
                line.kind === "DEVICE" && !line.returned && line.deviceId,
            )
            .map((line) => ({
              selected: true,
              deviceId: line.deviceId!._id,
              conditionIn: "GOOD",
              conditionInDescription: "",
              note: "",
            })),
        );
      }
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
    if (!lines.length || !form.reason.trim()) {
      setError("Nhập mục đích và ít nhất một thiết bị mượn.");
      return;
    }
    if (form.dueDate < form.operationDate) {
      setError("Hạn trả không được nhỏ hơn ngày mượn.");
      return;
    }
    const ids = lines.map((line) => line.deviceId);
    if (
      new Set(ids).size !== ids.length ||
      lines.some(
        (line) => !devices.some((device) => device._id === line.deviceId),
      )
    ) {
      setError("Thiết bị bị trùng hoặc không còn khả dụng. Hãy chọn lại.");
      return;
    }
    if (
      lines.some(
        (line) =>
          line.conditionOut === "OTHER" && !line.conditionOutDescription.trim(),
      )
    ) {
      setError("Nhập mô tả tình trạng Khác.");
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
            type: "LOAN",
            reason: form.reason.trim(),
            lines: lines.map((line) => ({
              kind: "DEVICE",
              quantity: 1,
              deviceId: line.deviceId,
              conditionOut: line.conditionOut,
              conditionOutDescription: line.conditionOutDescription.trim(),
              accessoryNote: line.accessoryNote.trim(),
              note: line.note.trim() || undefined,
            })),
          }),
        },
      );
      setSuccess(
        editing
          ? "Cập nhật phiếu mượn thành công"
          : "Tạo phiếu mượn thành công",
      );
      reset();
      setShowForm(false);
      if (page !== 1) setPage(1);
      if (query || search) {
        setQuery("");
        setSearch("");
      } else await load();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  function requestReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!returnRow) return;
    const items = returnLines
      .filter((line) => line.selected)
      .map((line) => ({
        deviceId: line.deviceId,
        conditionIn: line.conditionIn,
        conditionInDescription: line.conditionInDescription.trim(),
        note: line.note.trim(),
      }));
    if (!items.length) {
      setError("Chọn ít nhất một thiết bị để trả.");
      return;
    }
    if (
      items.some(
        (item) =>
          (item.conditionIn === "OTHER" && !item.conditionInDescription) ||
          (["MISSING_ACCESSORIES", "LOST"].includes(item.conditionIn) &&
            !item.note),
      )
    ) {
      setError(
        "Nhập mô tả tình trạng khác hoặc ghi chú thiếu phụ kiện / mất thiết bị.",
      );
      return;
    }
    setConfirm({
      row: returnRow,
      action: "return",
      payload: { returnedAt, note: returnNote.trim(), items },
    });
  }
  async function perform() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await apiFetch<{ data: LoanRow }>(
        `/api/operations/${confirm.row._id}${confirm.action === "delete" ? "" : confirm.action === "complete" ? "/complete" : "/return"}`,
        {
          method: confirm.action === "delete" ? "DELETE" : "PATCH",
          body:
            confirm.action === "return"
              ? JSON.stringify(confirm.payload)
              : undefined,
        },
      );
      setSuccess(
        confirm.action === "delete"
          ? "Xóa phiếu mượn thành công"
          : confirm.action === "complete"
            ? "Hoàn tất giao thiết bị thành công"
            : "Ghi nhận trả thiết bị thành công",
      );
      if (editing?._id === confirm.row._id) {
        reset();
        setShowForm(false);
      }
      if (confirm.action === "return") {
        setReturnRow(null);
        setDetail(result.data);
      }
      setConfirm(null);
      setDeviceVersion((v) => v + 1);
      await load();
    } catch (e) {
      report(e);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  async function print(row: LoanRow, batchId?: string) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên.");
      return;
    }
    popup.opener = null;
    setBusy(true);
    setError("");
    try {
      const fresh = await fetchRow(row);
      const batch: LoanReturn | undefined = batchId
        ? fresh.returnHistory?.find((item) => item._id === batchId)
        : undefined;
      if (batchId && !batch) throw new Error("Không tìm thấy lần trả cần in.");
      popup.document.write(loanPrintHtml(fresh, batch));
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
      <div>
        <h2 className="text-2xl font-bold">Mượn/trả thiết bị</h2>
        <p className="text-sm text-muted-foreground">
          Theo dõi giao thiết bị, hạn trả và từng lần nhận lại.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Chức năng mượn trả">
        <Button
          variant={tab === "borrow" ? "default" : "outline"}
          aria-pressed={tab === "borrow"}
          disabled={busy}
          onClick={() => changeTab("borrow")}
        >
          Mượn thiết bị
        </Button>
        <Button
          variant={tab === "return" ? "default" : "outline"}
          aria-pressed={tab === "return"}
          disabled={busy}
          onClick={() => changeTab("return")}
        >
          Trả thiết bị
        </Button>
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
      {tab === "borrow" && canManage && (
        <Button
          disabled={busy}
          onClick={() => {
            reset();
            setShowForm(true);
            setError("");
            setSuccess("");
          }}
        >
          <Plus /> Tạo phiếu mượn
        </Button>
      )}
      {showForm && tab === "borrow" && canManage && (
        <form
          onSubmit={save}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <h3 className="font-semibold">
            {editing ? "Sửa phiếu mượn" : "Tạo phiếu mượn thiết bị"}
          </h3>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Mã phiếu *"
                readOnly
                value={
                  editing?.code ?? "Hệ thống tự sinh khi lưu (ID-YYYYMMDD-NNN)"
                }
              />
              <Input
                label="Ngày mượn *"
                required
                type="date"
                value={form.operationDate}
                onChange={(e) =>
                  setForm({ ...form, operationDate: e.target.value })
                }
              />
              <Select
                label="Kho quản lý thiết bị *"
                required
                placeholder="Chọn kho quản lý"
                options={warehouses}
                value={form.sourceWarehouseId}
                onChange={(e) => {
                  setForm({ ...form, sourceWarehouseId: e.target.value });
                  setLines([newLine()]);
                }}
              />
              <Select
                label="Người mượn *"
                required
                placeholder="Chọn người mượn"
                options={keepers}
                value={form.receiverKeeperId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    receiverKeeperId: e.target.value,
                    receiverDepartmentId:
                      keepers.find((item) => item.value === e.target.value)
                        ?.departmentId ?? "",
                  })
                }
              />
              <Select
                label="Bộ phận *"
                required
                placeholder="Chọn bộ phận"
                options={departments}
                value={form.receiverDepartmentId}
                onChange={(e) =>
                  setForm({ ...form, receiverDepartmentId: e.target.value })
                }
              />
              <Input
                label="Hạn trả *"
                required
                type="date"
                min={form.operationDate}
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
              <Textarea
                label="Mục đích mượn *"
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
            <h3 className="font-semibold">Danh sách thiết bị mượn</h3>
            {deviceLoading && <p role="status">Đang tải thiết bị khả dụng…</p>}
            {lines.map((line, index) => {
              const device = devices.find((item) => item._id === line.deviceId);
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded border p-3 md:grid-cols-3"
                >
                  <Select
                    label={`Thiết bị ${index + 1} *`}
                    required
                    placeholder="Chọn thiết bị"
                    disabled={!form.sourceWarehouseId || deviceLoading}
                    value={line.deviceId}
                    options={[
                      ...(!device && line.deviceId
                        ? [
                            {
                              value: line.deviceId,
                              label: "Thiết bị không còn khả dụng — chọn lại",
                            },
                          ]
                        : []),
                      ...devices
                        .filter(
                          (item) =>
                            item._id === line.deviceId ||
                            !lines.some((other) => other.deviceId === item._id),
                        )
                        .map((item) => ({
                          value: item._id,
                          label: `${item.modelId?.name ?? item.assetCode} · ${item.assetCode}${item.serial ? ` · ${item.serial}` : ""}`,
                        })),
                    ]}
                    onChange={(e) =>
                      changeLine(line.key, { deviceId: e.target.value })
                    }
                  />
                  <Input
                    label="Mã tài sản"
                    readOnly
                    value={device?.assetCode ?? ""}
                  />
                  <Input label="Serial" readOnly value={device?.serial ?? ""} />
                  <Select
                    label="Tình trạng khi giao *"
                    required
                    options={outConditions}
                    value={line.conditionOut}
                    onChange={(e) =>
                      changeLine(line.key, { conditionOut: e.target.value })
                    }
                  />
                  {line.conditionOut === "OTHER" && (
                    <Input
                      label="Mô tả tình trạng khác *"
                      required
                      maxLength={500}
                      value={line.conditionOutDescription}
                      onChange={(e) =>
                        changeLine(line.key, {
                          conditionOutDescription: e.target.value,
                        })
                      }
                    />
                  )}
                  <Input
                    label="Phụ kiện đi kèm"
                    maxLength={500}
                    value={line.accessoryNote}
                    onChange={(e) =>
                      changeLine(line.key, { accessoryNote: e.target.value })
                    }
                  />
                  <Input
                    label="Ghi chú thiết bị"
                    maxLength={500}
                    value={line.note}
                    onChange={(e) =>
                      changeLine(line.key, { note: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    title={`Xóa thiết bị ${index + 1}`}
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
              <Plus /> Thêm thiết bị
            </Button>
            <div className="flex gap-2">
              <Button type="submit" disabled={deviceLoading || !lines.length}>
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
      {returnRow && tab === "return" && canManage && (
        <form
          onSubmit={requestReturn}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <h3 className="font-semibold">Ghi nhận trả · {returnRow.code}</h3>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p>Người mượn: {returnRow.receiverKeeperId?.displayName}</p>
            <p>Bộ phận: {returnRow.receiverDepartmentId?.name}</p>
            <p>Ngày mượn: {loanDate(returnRow.operationDate)}</p>
            <p>Hạn trả: {loanDate(returnRow.dueDate)}</p>
            <p className="whitespace-pre-wrap">
              Mục đích mượn: {returnRow.reason}
            </p>
            <p>Kho quản lý thiết bị: {returnRow.sourceWarehouseId?.name}</p>
          </div>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Ngày trả thực tế *"
                required
                type="date"
                min={returnRow.operationDate.slice(0, 10)}
                max={localLoanDay()}
                value={returnedAt}
                onChange={(e) => setReturnedAt(e.target.value)}
              />
              <Input
                label="Người nhận lại *"
                readOnly
                value={user?.displayName ?? ""}
              />
              <Textarea
                label="Ghi chú lần trả"
                maxLength={1000}
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
              />
            </div>
            {returnLines.map((item) => {
              const line = returnRow.lines.find(
                (line) => line.deviceId?._id === item.deviceId,
              )!;
              const change = (patch: Partial<ReturnLine>) =>
                setReturnLines((current) =>
                  current.map((other) =>
                    other.deviceId === item.deviceId
                      ? { ...other, ...patch }
                      : other,
                  ),
                );
              return (
                <div
                  key={item.deviceId}
                  className="space-y-3 rounded border p-3"
                >
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => change({ selected: e.target.checked })}
                    />
                    Trả {loanDeviceName(line)} ·{" "}
                    {line.assetCode ?? line.deviceId?.assetCode}
                  </label>
                  <p className="text-sm">
                    Serial: {line.serial ?? line.deviceId?.serial ?? "—"} · Lúc
                    giao:{" "}
                    {conditionLabel(
                      line.conditionOut ?? line.handoverCondition,
                    )}{" "}
                    {line.conditionOutDescription} · Phụ kiện:{" "}
                    {line.accessoryNote || "—"}
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Select
                      label="Tình trạng khi trả *"
                      required={item.selected}
                      disabled={!item.selected}
                      options={inConditions}
                      value={item.conditionIn}
                      onChange={(e) => change({ conditionIn: e.target.value })}
                    />
                    {item.conditionIn === "OTHER" && (
                      <Input
                        label="Mô tả tình trạng khi trả *"
                        required={item.selected}
                        disabled={!item.selected}
                        maxLength={500}
                        value={item.conditionInDescription}
                        onChange={(e) =>
                          change({ conditionInDescription: e.target.value })
                        }
                      />
                    )}
                    <Input
                      label={`Ghi chú khi trả${["MISSING_ACCESSORIES", "LOST"].includes(item.conditionIn) ? " *" : ""}`}
                      required={
                        item.selected &&
                        ["MISSING_ACCESSORIES", "LOST"].includes(
                          item.conditionIn,
                        )
                      }
                      disabled={!item.selected}
                      maxLength={500}
                      value={item.note}
                      onChange={(e) => change({ note: e.target.value })}
                    />
                    <Input
                      label="Kết quả xử lý"
                      readOnly
                      value={
                        item.selected
                          ? resultLabel(resultForCondition(item.conditionIn))
                          : "Tiếp tục mượn"
                      }
                    />
                  </div>
                  {item.selected &&
                    ["MISSING_ACCESSORIES", "OTHER"].includes(
                      item.conditionIn,
                    ) && (
                      <p className="text-sm text-amber-700">
                        Thiết bị được ghi nhận đã trả và chờ kiểm tra trước khi
                        có thể cho mượn lại.
                      </p>
                    )}
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!returnLines.some((line) => line.selected)}
              >
                Xác nhận trả
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReturnRow(null)}
              >
                Hủy
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="space-y-3">
        <h3 className="font-semibold">
          {tab === "return"
            ? "Phiếu đang mượn / trả một phần"
            : "Danh sách phiếu mượn/trả"}
        </h3>
        <Input
          label="Tìm phiếu"
          placeholder="Mã phiếu, người mượn, bộ phận, thiết bị, serial, mã tài sản"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {[
                  "Mã phiếu",
                  "Ngày mượn",
                  "Người mượn",
                  "Bộ phận",
                  "Số thiết bị",
                  "Hạn trả",
                  "Đã trả",
                  "Còn mượn",
                  "Trạng thái",
                  "Thao tác",
                ].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-6">
                    Đang tải…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={10} className="p-6">
                    Không có phiếu phù hợp.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const count = row.lines.filter(
                    (line) => line.kind === "DEVICE",
                  ).length;
                  const returned = row.lines.filter(
                    (line) => line.kind === "DEVICE" && line.returned,
                  ).length;
                  const overdue = overdueDays(row, clock);
                  return (
                    <tr key={row._id} className="border-t">
                      <td className="p-3 font-medium">{row.code}</td>
                      <td className="p-3">{loanDate(row.operationDate)}</td>
                      <td className="p-3">
                        {row.receiverKeeperId?.displayName ?? "—"}
                      </td>
                      <td className="p-3">
                        {row.receiverDepartmentId?.name ?? "—"}
                      </td>
                      <td className="p-3">{count}</td>
                      <td className="p-3">{loanDate(row.dueDate)}</td>
                      <td className="p-3">{returned}</td>
                      <td className="p-3">
                        {loanPending(row) ? 0 : count - returned}
                      </td>
                      <td className="p-3">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-1 ${loanPending(row) ? "bg-amber-100 text-amber-800" : row.status === "RETURNED" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
                        >
                          {loanStatus(row)}
                        </span>
                        {overdue > 0 && (
                          <span className="mt-2 block whitespace-nowrap rounded bg-red-100 px-2 py-1 text-red-800">
                            Quá hạn {overdue} ngày
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            title="Xem chi tiết"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void open(row, "detail")}
                          >
                            <Eye /> Xem chi tiết
                          </Button>
                          {canManage && loanPending(row) && (
                            <>
                              <Button
                                title="Sửa"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void open(row, "edit")}
                              >
                                <Edit /> Sửa
                              </Button>
                              <Button
                                title="Hoàn tất giao"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({ row, action: "complete" })
                                }
                              >
                                <CheckCircle /> Hoàn tất giao
                              </Button>
                            </>
                          )}
                          {canManage && loanReturnable(row) && (
                            <Button
                              title="Trả thiết bị"
                              size="sm"
                              disabled={busy}
                              onClick={() => void open(row, "return")}
                            >
                              <Undo2 /> Trả thiết bị
                            </Button>
                          )}
                          <Button
                            title="In phiếu mượn"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void print(row)}
                          >
                            <Printer /> In phiếu mượn
                          </Button>
                          {!!row.returnHistory?.length && (
                            <Button
                              title="Xem lịch sử để in từng biên bản trả"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void open(row, "detail")}
                            >
                              <Printer /> Biên bản trả
                            </Button>
                          )}
                          {canManage && loanPending(row) && (
                            <Button
                              title="Xóa"
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() =>
                                setConfirm({ row, action: "delete" })
                              }
                            >
                              <Trash2 /> Xóa
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <span>
            Trang {page}/{totalPages}
          </span>
          <Button
            variant="outline"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(value) => {
          if (!value) setDetail(null);
        }}
        title={`Chi tiết phiếu mượn ${detail?.code ?? ""}`}
        className="max-w-6xl"
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-3 md:grid-cols-3">
              {Object.entries({
                "Ngày mượn": loanDate(detail.operationDate),
                "Người mượn": detail.receiverKeeperId?.displayName,
                "Bộ phận": detail.receiverDepartmentId?.name,
                "Kho quản lý thiết bị": detail.sourceWarehouseId?.name,
                "Hạn trả": loanDate(detail.dueDate),
                "Trạng thái": loanStatus(detail),
                "Mục đích mượn": detail.reason,
                "Ghi chú": detail.note,
                "Người tạo": detail.createdBy?.displayName,
                "Ngày tạo": loanTimestamp(detail.createdAt),
                "Ngày cập nhật": loanTimestamp(detail.updatedAt),
                "Người giao": detail.dispatchedBy?.displayName,
                "Ngày giao": loanTimestamp(detail.dispatchedAt),
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {overdueDays(detail, clock) > 0 && (
              <p className="text-red-700">
                Quá hạn {overdueDays(detail, clock)} ngày
              </p>
            )}
            <DeviceTable row={detail} />
            <History row={detail} print={print} busy={busy} />
            <Button disabled={busy} onClick={() => void print(detail)}>
              <Printer /> In phiếu mượn
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
            ? "Hoàn tất giao thiết bị"
            : confirm?.action === "delete"
              ? "Xóa phiếu mượn"
              : "Ghi nhận trả thiết bị"
        }
      >
        <p>
          {confirm?.action === "complete"
            ? "Bạn có chắc chắn muốn hoàn tất việc giao thiết bị cho người mượn?"
            : confirm?.action === "delete"
              ? "Bạn có chắc chắn muốn xóa phiếu mượn này?"
              : "Bạn có chắc chắn muốn ghi nhận trả các thiết bị đã chọn?"}
        </p>
        <p className="my-3 font-medium">
          {confirm?.row.code}
          {confirm?.action === "return"
            ? ` · ${confirm.payload.items.length} thiết bị`
            : ""}
        </p>
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
            {confirm?.action === "complete"
              ? "Xác nhận giao"
              : confirm?.action === "delete"
                ? "Xóa"
                : "Xác nhận trả"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
