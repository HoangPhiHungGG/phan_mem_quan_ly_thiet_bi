"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle, Eye, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { loadCatalogOptions, CatalogOption, formatDate } from "@/lib/catalogs";

type Ref = { _id: string; name?: string; displayName?: string; code?: string };
type Device = Ref & { assetCode: string; serial?: string; modelId?: Ref };
type Line = {
  kind: "DEVICE" | "PART";
  deviceId?: string | Device;
  partId?: string | Ref;
  quantity: number;
  handoverCondition: string;
  receivedCondition?: string;
  note?: string;
};
type Row = {
  _id: string;
  code: string;
  operationDate: string;
  status: string;
  sourceWarehouseId?: Ref | string;
  destinationWarehouseId?: Ref;
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
  issueId?: Ref;
};
type IssueRow = {
  _id: string;
  code: string;
  operationDate: string;
  status: string;
  sourceWarehouseId?: Ref;
  receiverKeeperId?: Ref;
  receiverDepartmentId?: Ref;
  lines: Line[];
};
type RecoverableItem = {
  lineIndex: number;
  kind: "DEVICE" | "PART";
  deviceId?: string;
  partId?: string;
  quantity: number;
  recovered: number;
  remaining: number;
  handoverCondition?: string;
  deviceName?: string;
  assetCode?: string;
  serial?: string;
  partName?: string;
  partCode?: string;
};
type RecoverableData = {
  issue: IssueRow;
  items: RecoverableItem[];
};
type FormLine = {
  key: string;
  lineIndex: number;
  kind: "DEVICE" | "PART";
  deviceId: string;
  partId: string;
  quantity: number;
  handoverCondition: string;
  receivedCondition: string;
  note: string;
  assetCode?: string;
  serial?: string;
  partCode?: string;
};
const conditions = [
  { value: "GOOD", label: "Tốt" },
  { value: "NORMAL", label: "Bình thường" },
  { value: "SCRATCHED", label: "Trầy xước" },
  { value: "BROKEN", label: "Hư hỏng" },
  { value: "NOT_WORKING", label: "Không hoạt động" },
  { value: "MISSING_ACCESSORIES", label: "Thiếu phụ kiện" },
  { value: "LOST", label: "Mất" },
  { value: "OTHER", label: "Khác" },
];
const condition = (value: string) =>
  conditions.find((item) => item.value === value)?.label ?? value;
const status = (row: Row) =>
  row.status === "DRAFT"
    ? "Nháp"
    : row.status === "COMPLETED"
      ? "Hoàn tất"
      : row.status === "REJECTED"
        ? "Từ chối"
        : row.status;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const emptyForm = () => ({
  operationDate: today(),
  destinationWarehouseId: "",
  reason: "",
  note: "",
  issueId: "",
});
const timestamp = (value?: string) =>
  value ? new Date(value).toLocaleString("vi-VN") : "—";

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
              "Tình trạng lúc cấp",
              "Tình trạng khi thu hồi",
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
                {line.kind === "DEVICE"
                  ? ((typeof line.deviceId === "object"
                      ? (line.deviceId.modelId?.name ?? line.deviceId.assetCode)
                      : undefined) ?? "—")
                  : ((line as unknown as { partCode?: string }).partCode ??
                    "—")}
              </td>
              <td className="p-2">
                {line.kind === "DEVICE"
                  ? ((typeof line.deviceId === "object"
                      ? line.deviceId.serial
                      : undefined) ?? "—")
                  : typeof line.partId === "object"
                    ? (line.partId.code ?? line.partId.name ?? "—")
                    : (line.partId ?? "—")}
              </td>
              <td className="p-2">{line.quantity}</td>
              <td className="p-2">{condition(line.handoverCondition)}</td>
              <td className="p-2">
                {line.receivedCondition
                  ? condition(line.receivedCondition)
                  : "—"}
              </td>
              <td className="p-2">{line.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecoveryPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canManage = hasPermission("operations.manage");

  // Recovery form state
  const [form, setForm] = useState(emptyForm());
  const [formLines, setFormLines] = useState<FormLine[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedIssue, setSelectedIssue] = useState<IssueRow | null>(null);

  // Issues list for dropdown
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  // Detail dialog
  const [detail, setDetail] = useState<Row | null>(null);
  // Confirm dialog
  const [confirm, setConfirm] = useState<{
    row: Row;
    action: "complete" | "delete";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch<{ data: Row[] }>(
        "/api/operations?type=RECOVERY&limit=100",
      );
      setRows(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIssues = useCallback(async () => {
    try {
      setIssuesLoading(true);
      // Load completed issues
      const result = await apiFetch<{ data: IssueRow[] }>(
        "/api/operations?type=ISSUE&status=COMPLETED&limit=100",
      );
      setIssues(result.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thể tải phiếu cấp phát.",
      );
    } finally {
      setIssuesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadIssues();
    void loadCatalogOptions("warehouses").then(setWarehouses);
  }, [load, loadIssues]);

  const loadRecoverableItems = useCallback(async (issueId: string) => {
    if (!issueId) {
      setSelectedIssue(null);
      setFormLines([]);
      return;
    }
    try {
      const response = await apiFetch<
        { data?: RecoverableData } | RecoverableData
      >(`/api/operations/${issueId}/recoverable-items`);
      const result = (
        "data" in response && response.data ? response.data : response
      ) as RecoverableData;
      if (!result?.issue) {
        throw new Error("Phiếu cấp phát không có dữ liệu hợp lệ.");
      }
      setSelectedIssue(result.issue);
      // Auto-fill receiving warehouse from issue source warehouse
      setForm((prev) => ({
        ...prev,
        destinationWarehouseId: String(
          typeof result.issue.sourceWarehouseId === "string"
            ? result.issue.sourceWarehouseId
            : (result.issue.sourceWarehouseId?._id ?? ""),
        ),
      }));
      // Create form lines from recoverable items
      const lines: FormLine[] = result.items.map((item) => ({
        key: crypto.randomUUID(),
        lineIndex: item.lineIndex,
        kind: item.kind,
        deviceId: item.deviceId ?? "",
        partId: item.partId ?? "",
        quantity: item.remaining,
        handoverCondition: item.handoverCondition ?? "GOOD",
        receivedCondition: "GOOD",
        note: "",
        assetCode: item.assetCode,
        serial: item.serial,
        partCode: item.partCode,
      }));
      setFormLines(lines);
      setSelectedKeys(new Set());
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không thể tải danh sách tài sản thu hồi.",
      );
      setSelectedIssue(null);
      setFormLines([]);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedIssue) {
      setError("Vui lòng chọn phiếu cấp phát.");
      return;
    }
    const selectedLines = formLines.filter((line) =>
      selectedKeys.has(line.key),
    );
    if (selectedLines.length === 0) {
      setError("Không có tài sản để thu hồi.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        type: "RECOVERY",
        code: `RH-${Date.now()}`,
        operationDate: form.operationDate,
        destinationWarehouseId: form.destinationWarehouseId,
        issueId: selectedIssue._id,
        reason: form.reason,
        note: form.note,
        lines: selectedLines.map((line) => ({
          kind: line.kind,
          deviceId: line.deviceId || undefined,
          partId: line.partId || undefined,
          quantity: line.quantity,
          handoverCondition: line.handoverCondition,
          receivedCondition: line.receivedCondition,
          note: line.note || undefined,
        })),
      };
      const result = await apiFetch<{ data: Row }>("/api/operations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await apiFetch(`/api/operations/${result.data._id}/complete`, {
        method: "PATCH",
      });
      setShow(false);
      setForm(emptyForm());
      setFormLines([]);
      setSelectedIssue(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu phiếu thu hồi.");
    } finally {
      setSaving(false);
    }
  };

  const removeLine = (key: string) => {
    setFormLines((prev) => prev.filter((line) => line.key !== key));
  };

  const updateLineCondition = (key: string, value: string) => {
    setFormLines((prev) =>
      prev.map((line) =>
        line.key === key ? { ...line, receivedCondition: value } : line,
      ),
    );
  };

  const action = async (row: Row, actionType: string) => {
    if (actionType === "delete") {
      setConfirm({ row, action: "delete" });
    } else if (actionType === "complete") {
      setConfirm({ row, action: "complete" });
    }
  };

  const perform = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === "complete") {
        await apiFetch(`/api/operations/${confirm.row._id}/complete`, {
          method: "PATCH",
        });
      } else if (confirm.action === "delete") {
        await apiFetch(`/api/operations/${confirm.row._id}`, {
          method: "DELETE",
        });
      }
      setConfirm(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thể thực hiện thao tác.",
      );
    } finally {
      setBusy(false);
    }
  };

  const print = (row: Row) => {
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu thu hồi ${row.code}</title><style>body{font:14px Arial;color:#111;margin:24px}h1{text-align:center;font-size:22px}p,td{white-space:pre-wrap}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:8px;text-align:left}tr{break-inside:avoid}.sign{display:flex;justify-content:space-around;margin-top:36px;text-align:center}@page{size:A4 landscape;margin:15mm}</style></head><body><h1>PHIẾU THU HỒI THIẾT BỊ</h1><p>Mã phiếu: ${row.code} — ${status(row)}</p><p>Ngày thu hồi: ${formatDate(row.operationDate)}</p><p>Người bàn giao: ${row.receiverKeeperId?.displayName ?? "—"}</p><p>Bộ phận: ${row.receiverDepartmentId?.name ?? "—"}</p><p>Kho tiếp nhận: ${row.destinationWarehouseId?.name ?? "—"}</p><p>Lý do: ${row.reason}</p><table><thead><tr><th>Loại</th><th>Thiết bị/linh kiện</th><th>Mã tài sản</th><th>Serial</th><th>Tình trạng lúc cấp</th><th>Tình trạng khi thu hồi</th></tr></thead><tbody>${row.lines.map((line) => `<tr><td>${line.kind === "DEVICE" ? "Thiết bị" : "Linh kiện"}</td><td>${line.kind === "DEVICE" && typeof line.deviceId === "object" ? (line.deviceId.modelId?.name ?? line.deviceId.assetCode ?? "—") : typeof line.partId === "object" ? (line.partId.name ?? line.partId.code ?? "—") : "—"}</td><td>${line.kind === "DEVICE" && typeof line.deviceId === "object" ? (line.deviceId.assetCode ?? "—") : typeof line.partId === "object" ? (line.partId.code ?? "—") : "—"}</td><td>${line.kind === "DEVICE" && typeof line.deviceId === "object" ? (line.deviceId.serial ?? "—") : "—"}</td><td>${condition(line.handoverCondition)}</td><td>${line.receivedCondition ? condition(line.receivedCondition) : "—"}</td></tr>`).join("")}</tbody></table><div class="sign"><div>NGƯỜI BÀN GIAO<br>(Ký, ghi rõ họ tên)</div><div>NGƯỜI NHẬN LẠI<br>(Ký, ghi rõ họ tên)</div></div></body></html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Thu hồi thiết bị</h1>
        {canManage && (
          <Button
            onClick={() => {
              setShow(true);
              setForm(emptyForm());
              setFormLines([]);
              setSelectedIssue(null);
              void loadIssues();
            }}
          >
            <Plus /> Tạo phiếu thu hồi
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {show && (
        <form
          className="space-y-4 rounded-lg border bg-white p-4"
          onSubmit={handleSubmit}
        >
          <h2 className="text-lg font-semibold">Tạo phiếu thu hồi</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Select
                label="Phiếu cấp phát *"
                placeholder={
                  issuesLoading ? "Đang tải..." : "Chọn phiếu cấp phát"
                }
                value={form.issueId}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, issueId: e.target.value }));
                  void loadRecoverableItems(e.target.value);
                }}
                disabled={issuesLoading}
                options={issues.map((issue) => ({
                  value: issue._id,
                  label: `${issue.code} - ${issue.receiverKeeperId?.displayName} - ${issue.receiverDepartmentId?.name} - ${formatDate(issue.operationDate)}`,
                }))}
              />
            </div>
            <div>
              <Input
                label="Ngày thu hồi *"
                type="date"
                value={form.operationDate}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    operationDate: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          {selectedIssue && (
            <div className="grid gap-4 rounded-md bg-gray-50 p-3 md:grid-cols-3">
              <div>
                <span className="text-sm font-medium">Người bàn giao:</span>
                <p className="text-sm">
                  {selectedIssue.receiverKeeperId?.displayName}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium">Bộ phận:</span>
                <p className="text-sm">
                  {selectedIssue.receiverDepartmentId?.name}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium">Kho xuất ban đầu:</span>
                <p className="text-sm">
                  {selectedIssue.sourceWarehouseId?.name}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Select
                label="Kho tiếp nhận *"
                required
                placeholder="Chọn kho tiếp nhận"
                value={form.destinationWarehouseId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    destinationWarehouseId: e.target.value,
                  }))
                }
                options={warehouses.map((wh) => ({
                  value: wh.value,
                  label: wh.label,
                }))}
              />
            </div>
            <div>
              <Input
                label="Lý do thu hồi *"
                value={form.reason}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reason: e.target.value }))
                }
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Ghi chú</label>
            <Textarea
              value={form.note}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, note: e.target.value }))
              }
            />
          </div>

          {selectedIssue && (
            <div>
              <h3 className="mb-2 text-sm font-medium">
                Tài sản có thể thu hồi
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Chọn</th>
                      <th className="p-2 text-left">Loại</th>
                      <th className="p-2 text-left">Tài sản</th>
                      <th className="p-2 text-left">Mã tài sản</th>
                      <th className="p-2 text-left">Serial</th>
                      <th className="p-2 text-left">Đã cấp / Còn lại</th>
                      <th className="p-2 text-left">Tình trạng khi thu hồi</th>
                      <th className="p-2 text-left">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formLines.map((line) => (
                      <tr className="border-t" key={line.key}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(line.key)}
                            onChange={(e) =>
                              setSelectedKeys((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(line.key);
                                else next.delete(line.key);
                                return next;
                              })
                            }
                            aria-label={`Chọn ${line.assetCode ?? line.partCode ?? "tài sản"}`}
                          />
                        </td>
                        <td className="p-2">
                          {line.kind === "DEVICE" ? "Thiết bị" : "Linh kiện"}
                        </td>
                        <td className="p-2">
                          {line.kind === "DEVICE"
                            ? line.assetCode
                            : line.partCode}
                        </td>
                        <td className="p-2">
                          {line.kind === "DEVICE"
                            ? line.assetCode
                            : line.partCode}
                        </td>
                        <td className="p-2">
                          {line.kind === "DEVICE" ? line.serial : "—"}
                        </td>
                        <td className="p-2">
                          {line.quantity} / {line.quantity}
                        </td>
                        <td className="p-2">
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={line.receivedCondition}
                            onChange={(e) =>
                              updateLineCondition(line.key, e.target.value)
                            }
                          >
                            {conditions.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeLine(line.key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShow(false);
                setForm(emptyForm());
                setFormLines([]);
                setSelectedKeys(new Set());
                setSelectedIssue(null);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={saving || selectedKeys.size === 0}>
              {saving && <Loader2 className="animate-spin" />}
              Lưu phiếu thu hồi
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Mã phiếu",
                  "Ngày thu hồi",
                  "Người bàn giao",
                  "Bộ phận",
                  "Kho tiếp nhận",
                  "Số dòng",
                  "Trạng thái",
                  "Thao tác",
                ].map((label) => (
                  <th className="p-3 text-left" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-3 text-center text-gray-500">
                    Chưa có phiếu thu hồi nào.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row._id} className="border-t">
                    <td className="p-3 font-medium">{row.code}</td>
                    <td className="p-3">{formatDate(row.operationDate)}</td>
                    <td className="p-3">
                      {row.receiverKeeperId?.displayName ?? "—"}
                    </td>
                    <td className="p-3">
                      {row.receiverDepartmentId?.name ?? "—"}
                    </td>
                    <td className="p-3">
                      {row.destinationWarehouseId?.name ?? "—"}
                    </td>
                    <td className="p-3">{row.lines.length}</td>
                    <td className="p-3">{status(row)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetail(row)}
                        >
                          <Eye /> Xem chi tiết
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => print(row)}
                        >
                          <Printer /> In
                        </Button>
                        {canManage && row.status === "DRAFT" && (
                          <Button
                            size="sm"
                            onClick={() => action(row, "complete")}
                          >
                            <CheckCircle /> Hoàn tất
                          </Button>
                        )}
                        {canManage && row.status === "DRAFT" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => action(row, "delete")}
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
      )}

      <Dialog
        open={!!detail}
        onOpenChange={(value) => {
          if (!value) setDetail(null);
        }}
        title={`Phiếu thu hồi ${detail?.code ?? ""}`}
        className="max-w-5xl"
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-3 md:grid-cols-2">
              {Object.entries({
                "Phiếu cấp phát gốc": detail.issueId?.code,
                "Ngày thu hồi": formatDate(detail.operationDate),
                "Trạng thái": status(detail),
                "Người bàn giao": detail.receiverKeeperId?.displayName,
                "Bộ phận": detail.receiverDepartmentId?.name,
                "Kho tiếp nhận": detail.destinationWarehouseId?.name,
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
            ? "Hoàn tất phiếu thu hồi"
            : "Xóa phiếu thu hồi"
        }
      >
        <p>
          {confirm?.action === "complete"
            ? "Bạn có chắc chắn muốn hoàn tất phiếu thu hồi này? Sau khi hoàn tất, hệ thống sẽ cập nhật kho và trạng thái thiết bị."
            : "Bạn có chắc chắn muốn xóa phiếu thu hồi này?"}
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
