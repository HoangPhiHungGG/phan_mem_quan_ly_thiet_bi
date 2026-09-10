"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch } from "@/lib/api";
import { loadCatalogOptions, type CatalogOption } from "@/lib/catalogs";

type Part = {
  _id: string;
  code: string;
  name: string;
  trackingMode: "QUANTITY" | "SERIAL";
};
type Device = {
  _id: string;
  assetCode: string;
  serial?: string;
  modelId?: { name?: string } | null;
};
type Receipt = {
  _id: string;
  code: string;
  receiptDate: string;
  source: string;
  status: string;
  warehouseId?: { name?: string };
  lines: unknown[];
};
type Meta = { page: number; totalPages: number; total: number };
type ReceiptDetail = {
  _id: string;
  code: string;
  receiptDate: string;
  source: string;
  status: string;
  requiresApproval?: boolean;
  warehouseId?: { _id?: string; name?: string } | null;
  openingSource?: string;
  openingReason?: string;
  attachments?: { name: string; url?: string }[];
  lines: {
    type: string;
    quantity: number;
    note?: string;
    device?: {
      deviceId?: string | { _id: string } | null;
      assetCode?: string;
      serial?: string;
      techCondition?: string;
      notes?: string;
    };
    part?: {
      partId?: string | { _id: string } | null;
      serials?: string[];
    };
  }[];
};
type EditState = {
  id: string;
  code: string;
  receiptDate: string;
  warehouseId: string;
  openingSource: string;
  openingReason: string;
  requiresApproval: boolean;
  attachmentName: string;
  attachmentUrl: string;
};
type Line = {
  key: number;
  kind: "PART" | "DEVICE";
  partId: string;
  quantity: number;
  serials: string;
  assetCode: string;
  deviceId: string;
  deviceSerial: string;
  techCondition: string;
  notes: string;
};
const labels: Record<string, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  COMPLETED: "Hoàn tất",
  REVERSED: "Đã đảo",
  CANCELLED: "Đã hủy",
  OPENING: "Số dư đầu kỳ",
  PURCHASE: "Mua sắm",
  RETURN: "Thu hồi",
  OTHER: "Khác",
};
function parseSerials(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function InboundReceiptsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("receipts.manage");
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [items, setItems] = useState<Receipt[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const submitModeRef = useRef<"draft" | "complete">("draft");
  const [source, setSource] = useState("OPENING");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [lines, setLines] = useState<Line[]>([
    {
      key: 1,
      kind: "PART",
      partId: "",
      quantity: 1,
      serials: "",
      assetCode: "",
      deviceId: "",
      deviceSerial: "",
      techCondition: "GOOD",
      notes: "",
    },
  ]);

  const load = useCallback(() => {
    apiFetch<{ data: Receipt[]; meta: Meta }>(
      `/api/inbound-receipts?page=${page}&limit=20&q=${encodeURIComponent(q)}`,
    )
      .then((result) => {
        setItems(result.data);
        setMeta(result.meta);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Không thể tải phiếu nhập.",
        ),
      );
  }, [page, q]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("warehouses"),
      apiFetch<{ data: Part[] }>("/api/parts?isActive=true&limit=100"),
      apiFetch<{ data: Device[] }>(
        "/api/devices?usageStatus=NOT_RECEIVED&limit=100",
      ),
    ])
      .then(([warehouseOptions, partResult, deviceResult]) => {
        setWarehouses(warehouseOptions);
        setParts(partResult.data);
        setDevices(deviceResult.data);
      })
      .catch(() => setError("Không thể tải danh mục kho hoặc linh kiện."));
  }, []);
  function updateLine(key: number, field: keyof Line, value: string | number) {
    setLines((old) =>
      old.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  }
  function addLine(kind: Line["kind"]) {
    setLines((old) => [
      ...old,
      {
        key: Date.now(),
        kind,
        partId: "",
        quantity: 1,
        serials: "",
        assetCode: "",
        deviceId: "",
        deviceSerial: "",
        techCondition: "GOOD",
        notes: "",
      },
    ]);
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const raw = form.get(name);
      return typeof raw === "string" ? raw.trim() : "";
    };
    if (!value("warehouseId")) {
      setError("Vui lòng chọn kho nhập.");
      return;
    }
    if (!value("code")) {
      setError("Vui lòng nhập mã phiếu.");
      return;
    }
    if (
      source === "OPENING" &&
      (!value("openingSource") || !value("openingReason"))
    ) {
      setError("Nhập số dư đầu kỳ cần nhập nguồn dữ liệu và lý do.");
      return;
    }
    if (lines.some((line) => line.kind === "PART" && !line.partId)) {
      setError("Vui lòng chọn linh kiện cho mỗi dòng hàng.");
      return;
    }
    for (const line of lines) {
      if (line.kind !== "PART") continue;
      const part = parts.find((item) => item._id === line.partId);
      const serials = parseSerials(line.serials);
      if (part?.trackingMode === "QUANTITY" && serials.length) {
        setError("Linh kiện quản lý theo số lượng không nhận serial.");
        return;
      }
      if (part?.trackingMode === "SERIAL" && serials.length > line.quantity) {
        setError("Số serial không được lớn hơn số lượng linh kiện nhập.");
        return;
      }
      if (
        new Set(serials.map((serial) => serial.toUpperCase())).size !==
        serials.length
      ) {
        setError("Serial trong cùng một dòng không được trùng.");
        return;
      }
    }
    const linesBody = lines.map((line) =>
      line.kind === "DEVICE"
        ? {
            type: "DEVICE",
            quantity: 1,
            note: line.notes || undefined,
            device: {
              assetCode: line.assetCode || undefined,
              deviceId: line.deviceId || undefined,
              serial: line.deviceSerial || undefined,
              techCondition: line.techCondition,
              notes: line.notes || undefined,
            },
          }
        : {
            type: "PART",
            quantity: Number(line.quantity),
            note: line.notes || undefined,
            part: {
              partId: line.partId,
              serials: parseSerials(line.serials),
            },
          },
    );
    try {
      setSaving(true);
      const body = JSON.stringify({
        code: value("code"),
        receiptDate: value("receiptDate"),
        warehouseId: value("warehouseId"),
        source,
        requiresApproval: form.get("requiresApproval") === "on",
        openingSource: value("openingSource") || undefined,
        openingReason: value("openingReason") || undefined,
        attachments:
          value("attachmentName") && value("attachmentUrl")
            ? [
                {
                  name: value("attachmentName"),
                  url: value("attachmentUrl"),
                },
              ]
            : undefined,
        lines: linesBody,
      });
      if (editing) {
        await apiFetch(`/api/inbound-receipts/${editing.id}`, {
          method: "PATCH",
          body,
        });
        setEditing(null);
        setNotice("Đã lưu thay đổi phiếu nháp. Tồn kho chưa thay đổi.");
      } else {
        const result = await apiFetch<{ data: Receipt }>(
          "/api/inbound-receipts",
          {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body,
          },
        );
        if (submitModeRef.current === "complete") {
          if (form.get("requiresApproval") === "on") {
            await apiFetch(`/api/inbound-receipts/${result.data._id}/submit`, {
              method: "PATCH",
            });
            setNotice("Đã tạo phiếu chờ duyệt. Tồn kho chưa thay đổi.");
          } else {
            await apiFetch(
              `/api/inbound-receipts/${result.data._id}/complete`,
              {
                method: "PATCH",
              },
            );
            setNotice("Đã hoàn tất nhập kho. Tồn kho đã được ghi nhận.");
          }
        } else {
          setNotice("Đã lưu phiếu nháp. Tồn kho chưa thay đổi.");
        }
      }
      setLines([
        {
          key: Date.now(),
          kind: "PART",
          partId: "",
          quantity: 1,
          serials: "",
          assetCode: "",
          deviceId: "",
          deviceSerial: "",
          techCondition: "GOOD",
          notes: "",
        },
      ]);
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không thể tạo phiếu.",
      );
    } finally {
      setSaving(false);
    }
  }
  function refId(value: string | { _id?: string } | null | undefined): string {
    if (!value) return "";
    return typeof value === "string" ? value : String(value._id ?? "");
  }
  function resetForm() {
    setEditing(null);
    setSource("OPENING");
    setLines([
      {
        key: Date.now(),
        kind: "PART",
        partId: "",
        quantity: 1,
        serials: "",
        assetCode: "",
        deviceId: "",
        deviceSerial: "",
        techCondition: "GOOD",
        notes: "",
      },
    ]);
  }
  async function startEdit(receipt: Receipt) {
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ data: ReceiptDetail }>(
        `/api/inbound-receipts/${receipt._id}`,
      );
      const detail = result.data;
      if (detail.status !== "DRAFT") {
        setError("Chỉ được sửa phiếu đang ở trạng thái Nháp.");
        return;
      }
      setSource(detail.source);
      setLines(
        detail.lines.map((line, index) =>
          line.type === "DEVICE"
            ? {
                key: -(index + 1),
                kind: "DEVICE" as const,
                partId: "",
                quantity: 1,
                serials: "",
                assetCode: line.device?.assetCode ?? "",
                deviceId: refId(line.device?.deviceId),
                deviceSerial: line.device?.serial ?? "",
                techCondition: line.device?.techCondition ?? "GOOD",
                notes: line.note ?? line.device?.notes ?? "",
              }
            : {
                key: -(index + 1),
                kind: "PART" as const,
                partId: refId(line.part?.partId),
                quantity: line.quantity,
                serials: (line.part?.serials ?? []).join("\n"),
                assetCode: "",
                deviceId: "",
                deviceSerial: "",
                techCondition: "GOOD",
                notes: line.note ?? "",
              },
        ),
      );
      setEditing({
        id: detail._id,
        code: detail.code,
        receiptDate: new Date(detail.receiptDate).toISOString().slice(0, 10),
        warehouseId: refId(detail.warehouseId),
        openingSource: detail.openingSource ?? "",
        openingReason: detail.openingReason ?? "",
        requiresApproval: detail.requiresApproval ?? false,
        attachmentName: detail.attachments?.[0]?.name ?? "",
        attachmentUrl: detail.attachments?.[0]?.url ?? "",
      });
      window.scrollTo({ top: 0 });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể tải phiếu để sửa.",
      );
    }
  }
  async function completeDraft(receipt: Receipt) {
    if (
      !window.confirm(
        `Hoàn tất phiếu nhập ${receipt.code} và ghi nhận tồn kho?`,
      )
    )
      return;
    setError("");
    try {
      await apiFetch(`/api/inbound-receipts/${receipt._id}/complete`, {
        method: "PATCH",
      });
      setNotice(`Đã hoàn tất phiếu ${receipt.code}. Tồn kho đã được ghi nhận.`);
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không thể hoàn tất phiếu.",
      );
    }
  }
  async function reverseCompleted(receipt: Receipt) {
    if (
      !window.confirm(
        `Bạn có chắc muốn đảo phiếu này?\n\nPhiếu ${receipt.code} sẽ chuyển sang trạng thái "Đã đảo":\n- Tồn kho sẽ bị giảm lại đúng số đã nhập.\n- Thiết bị sẽ quay về trạng thái Chưa nhập kho.\n- Không thể hoàn tác nếu hàng đã được xuất khỏi kho.`,
      )
    )
      return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/inbound-receipts/${receipt._id}/reverse`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setNotice(
        `Đã đảo phiếu ${receipt.code}. Tồn kho đã được ghi giảm; lịch sử nhập/đảo được giữ nguyên.`,
      );
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không thể đảo phiếu.",
      );
    }
  }
  async function deleteDraft(receipt: Receipt) {
    if (
      !window.confirm(`Bạn có chắc chắn muốn xóa phiếu nháp ${receipt.code}?`)
    )
      return;
    setError("");
    try {
      await apiFetch(`/api/inbound-receipts/${receipt._id}`, {
        method: "DELETE",
      });
      setNotice(`Đã xóa phiếu nháp ${receipt.code}.`);
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không thể xóa phiếu.",
      );
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Nhập kho & số dư đầu kỳ</h2>
          <p className="text-sm text-muted-foreground">
            Lưu nháp không làm thay đổi tồn kho. Chỉ khi chọn Hoàn tất nhập kho,
            số lượng mới được ghi nhận vào kho.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load}>
          <RefreshCw /> Tải lại
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </p>
      )}
      {canManage && (
        <form
          key={editing?.id ?? "new"}
          onSubmit={create}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">
              {editing
                ? `Sửa phiếu nháp ${editing.code}`
                : "Tạo phiếu nhập nháp"}
            </h3>
            {editing && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Hủy sửa
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              name="code"
              label="Mã phiếu *"
              required
              maxLength={80}
              placeholder="PNK-0001"
              defaultValue={editing?.code ?? ""}
            />
            <Input
              name="receiptDate"
              label="Ngày *"
              type="date"
              required
              defaultValue={
                editing?.receiptDate ?? new Date().toISOString().slice(0, 10)
              }
            />
            <Select
              key={`warehouse-${editing?.warehouseId ?? "new"}`}
              name="warehouseId"
              label="Kho *"
              options={warehouses}
              placeholder="-- Chọn kho --"
              required
              defaultValue={editing?.warehouseId ?? ""}
            />
            <Select
              label="Nguồn nhập *"
              options={[
                { value: "OPENING", label: "Số dư đầu kỳ" },
                { value: "PURCHASE", label: "Mua sắm" },
                { value: "RETURN", label: "Thu hồi" },
                { value: "OTHER", label: "Khác" },
              ]}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </div>
          {source === "OPENING" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                name="openingSource"
                label="Nguồn dữ liệu đầu kỳ *"
                required
                placeholder="Biên bản kiểm kê..."
                defaultValue={editing?.openingSource ?? ""}
              />
              <Textarea
                name="openingReason"
                label="Lý do nhập đầu kỳ *"
                required
                maxLength={1000}
                defaultValue={editing?.openingReason ?? ""}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              name="requiresApproval"
              type="checkbox"
              defaultChecked={editing?.requiresApproval ?? false}
            />{" "}
            Yêu cầu duyệt trước khi hoàn tất
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="attachmentName"
              label="Tên tài liệu đính kèm"
              maxLength={150}
              placeholder="Biên bản, hóa đơn..."
              defaultValue={editing?.attachmentName ?? ""}
            />
            <Input
              name="attachmentUrl"
              label="Liên kết tài liệu"
              type="url"
              maxLength={500}
              placeholder="https://..."
              defaultValue={editing?.attachmentUrl ?? ""}
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">Dòng hàng</h4>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addLine("PART")}
                >
                  <Plus /> Linh kiện
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addLine("DEVICE")}
                >
                  <Plus /> Thiết bị
                </Button>
              </div>
            </div>
            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-3 rounded border p-3 sm:grid-cols-2 lg:grid-cols-5"
              >
                <div className="text-sm font-medium">
                  {index + 1}. {line.kind === "PART" ? "Linh kiện" : "Thiết bị"}
                </div>
                {line.kind === "PART" ? (
                  <>
                    <Select
                      label="Linh kiện *"
                      options={parts.map((part) => ({
                        value: part._id,
                        label: `${part.code} — ${part.name}${part.trackingMode === "SERIAL" ? " (serial)" : ""}`,
                      }))}
                      placeholder="-- Chọn --"
                      required
                      value={line.partId}
                      onChange={(event) =>
                        updateLine(line.key, "partId", event.target.value)
                      }
                    />
                    <Input
                      label="Số lượng *"
                      type="number"
                      min={1}
                      required
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(
                          line.key,
                          "quantity",
                          Number(event.target.value),
                        )
                      }
                    />
                    {parts.find((part) => part._id === line.partId)
                      ?.trackingMode === "SERIAL" && (
                      <div className="space-y-1">
                        <Textarea
                          label="Serial (mỗi dòng/dấu phẩy)"
                          value={line.serials}
                          onChange={(event) =>
                            updateLine(line.key, "serials", event.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Đã nhập serial: {parseSerials(line.serials).length} /{" "}
                          {line.quantity}. Chưa khai báo:{" "}
                          {Math.max(
                            0,
                            line.quantity - parseSerials(line.serials).length,
                          )}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Select
                      label="Thiết bị *"
                      options={devices.map((device) => ({
                        value: device._id,
                        label: `${device.assetCode} — ${device.modelId?.name ?? "Chưa có model"}`,
                      }))}
                      placeholder="-- Chọn thiết bị chưa nhập kho --"
                      required
                      value={line.deviceId}
                      onChange={(event) =>
                        updateLine(line.key, "deviceId", event.target.value)
                      }
                    />
                    <Input
                      label="Serial"
                      maxLength={120}
                      value={line.deviceSerial}
                      onChange={(event) =>
                        updateLine(line.key, "deviceSerial", event.target.value)
                      }
                    />
                    <Select
                      label="Tình trạng"
                      options={[
                        { value: "GOOD", label: "Tốt" },
                        { value: "DEGRADED", label: "Giảm chất lượng" },
                        { value: "BROKEN", label: "Hỏng" },
                      ]}
                      value={line.techCondition}
                      onChange={(event) =>
                        updateLine(
                          line.key,
                          "techCondition",
                          event.target.value,
                        )
                      }
                    />
                  </>
                )}
                <div className="flex items-end gap-2">
                  <Input
                    label="Ghi chú"
                    value={line.notes}
                    onChange={(event) =>
                      updateLine(line.key, "notes", event.target.value)
                    }
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((old) =>
                        old.filter((item) => item.key !== line.key),
                      )
                    }
                  >
                    Xóa
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />} Lưu thay đổi
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  disabled={saving}
                  onClick={() => {
                    submitModeRef.current = "draft";
                  }}
                >
                  {saving && <Loader2 className="animate-spin" />} Lưu nháp
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    submitModeRef.current = "complete";
                  }}
                >
                  Hoàn tất nhập kho
                </Button>
              </>
            )}
          </div>
        </form>
      )}
      <section className="space-y-3">
        <div className="flex gap-2">
          <Input
            aria-label="Tìm mã phiếu"
            placeholder="Tìm mã phiếu..."
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3">Mã phiếu</th>
                <th className="p-3">Ngày</th>
                <th className="p-3">Kho</th>
                <th className="p-3">Nguồn</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Dòng</th>
                <th className="p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    <Link
                      className="text-primary underline"
                      href={`/nhap-kho/${item._id}`}
                    >
                      {item.code}
                    </Link>
                  </td>
                  <td className="p-3">
                    {new Date(item.receiptDate).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="p-3">{item.warehouseId?.name ?? "—"}</td>
                  <td className="p-3">{labels[item.source] ?? item.source}</td>
                  <td className="p-3">{labels[item.status] ?? item.status}</td>
                  <td className="p-3">{item.lines.length}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/nhap-kho/${item._id}`}>
                          {item.status === "COMPLETED" ? "Xem chi tiết" : "Mở"}
                        </Link>
                      </Button>
                      {item.status === "DRAFT" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void startEdit(item)}
                          >
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void completeDraft(item)}
                          >
                            Hoàn tất
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void deleteDraft(item)}
                          >
                            Xóa
                          </Button>
                        </>
                      )}
                      {item.status === "COMPLETED" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void reverseCompleted(item)}
                        >
                          Đảo phiếu
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td
                    className="p-6 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    Chưa có phiếu nhập.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          onChange={setPage}
        />
      </section>
    </div>
  );
}
