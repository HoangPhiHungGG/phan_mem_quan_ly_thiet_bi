"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, Printer, Trash2 } from "lucide-react";
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
  formatDate,
  formatMoney,
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";

type Ref = { _id: string; code?: string; name?: string; displayName?: string };
type Line = {
  kind: "DEVICE" | "PART" | "PART_SERIAL";
  deviceId?: Ref | string;
  partId?: Ref | string;
  partSerialId?: Ref | string;
  repairId?: Ref | string;
  name: string;
  assetCode?: string;
  serial?: string;
  model?: string;
  condition?: string;
  quantity: number;
  originalValue: number;
  liquidationValue: number;
  reason?: string;
  note?: string;
};
type Row = {
  _id: string;
  code: string;
  documentDate: string;
  liquidationDate?: string;
  warehouseId: Ref;
  reason: string;
  method: string;
  requestedBy: Ref;
  requestedDepartmentId?: Ref;
  responsiblePerson?: string;
  note?: string;
  lines: Line[];
  totalValue: number;
  status: string;
  statusHistory: Array<{ status: string; at: string; by?: Ref; note?: string }>;
  createdBy?: Ref;
  submittedBy?: Ref;
  approvedBy?: Ref;
  completedBy?: Ref;
  rejectedBy?: Ref;
  cancelledBy?: Ref;
  submittedAt?: string;
  approvedAt?: string;
  completedAt?: string;
  rejectionReason?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
};
type Eligible = {
  devices: Array<{
    _id: string;
    assetCode: string;
    serial?: string;
    techCondition: string;
    modelId?: Ref;
  }>;
  balances: Array<{ partId: Ref; quantity: number }>;
  serials: Array<{ _id: string; serial: string; partId: Ref }>;
  repairs: Array<{
    _id: string;
    code: string;
    deviceId: {
      _id: string;
      assetCode: string;
      serial?: string;
      techCondition: string;
      modelId?: Ref;
    };
  }>;
};
type EditLine = {
  kind: "DEVICE" | "PART" | "PART_SERIAL";
  targetId: string;
  repairId: string;
  quantity: number;
  liquidationValue: number;
  reason: string;
  note: string;
};
const statuses: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  COMPLETED: "Hoàn tất",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};
const methods: Record<string, string> = {
  SALE: "Bán",
  DESTROY: "Tiêu hủy",
  DONATE: "Cho/tặng",
  TRANSFER: "Chuyển nhượng",
  OTHER: "Khác",
};
const kindLabels: Record<string, string> = {
  DEVICE: "Thiết bị",
  PART: "Linh kiện số lượng",
  PART_SERIAL: "Linh kiện serial",
};
const refName = (ref?: Ref) =>
  ref?.displayName ?? ref?.name ?? ref?.code ?? "—";
const idOf = (value?: Ref | string) =>
  typeof value === "string" ? value : (value?._id ?? "");
const stamp = (value?: string) =>
  value ? new Date(value).toLocaleString("vi-VN") : "—";

export function LiquidationPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ page: number; totalPages: number }>();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [editor, setEditor] = useState<Row | "new" | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<Row | null>(null);
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [departments, setDepartments] = useState<CatalogOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [eligible, setEligible] = useState<Eligible>({
    devices: [],
    balances: [],
    serials: [],
    repairs: [],
  });
  const [lines, setLines] = useState<EditLine[]>([]);
  const load = useCallback(async () => {
    if (!hasPermission("liquidation.view")) {
      setError("Bạn không có quyền xem module Thanh lý.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      const result = await apiFetch<{
        data: Row[];
        meta: { page: number; totalPages: number };
      }>(`/api/liquidations?${p}`);
      setRows(result.data);
      setMeta(result.meta);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải danh sách.");
    } finally {
      setLoading(false);
    }
  }, [hasPermission, page, q, status]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("liquidationId");
    if (!id || !hasPermission("liquidation.view")) return;
    apiFetch<{ data: Row }>(`/api/liquidations/${id}`)
      .then((result) => setDetail(result.data))
      .catch(() => undefined);
  }, [hasPermission]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("warehouses"),
      loadCatalogOptions("departments"),
    ])
      .then(([w, d]) => {
        setWarehouses(w);
        setDepartments(d);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!warehouseId) {
      setEligible({ devices: [], balances: [], serials: [], repairs: [] });
      return;
    }
    apiFetch<{ data: Eligible }>(
      `/api/liquidations/eligible-assets?warehouseId=${warehouseId}`,
    )
      .then((r) => setEligible(r.data))
      .catch(() =>
        setEligible({ devices: [], balances: [], serials: [], repairs: [] }),
      );
  }, [warehouseId]);
  const action = async (
    path: string,
    method: string,
    body: unknown,
    success: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      await apiFetch(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setMessage(success);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openEditor = (row: Row | "new") => {
    setEditor(row);
    setWarehouseId(row === "new" ? "" : row.warehouseId._id);
    setLines(
      row === "new"
        ? []
        : row.lines.map((line) => ({
            kind: line.kind,
            targetId: idOf(line.deviceId ?? line.partSerialId ?? line.partId),
            repairId: idOf(line.repairId),
            quantity: line.quantity,
            liquidationValue: line.liquidationValue,
            reason: line.reason ?? "",
            note: line.note ?? "",
          })),
    );
  };
  const options = (line: EditLine) =>
    line.kind === "DEVICE"
      ? [
          ...eligible.devices.map((d) => ({
            value: d._id,
            label: `${d.assetCode} · ${d.modelId?.name ?? "Thiết bị"}${d.serial ? ` · ${d.serial}` : ""}`,
          })),
          ...eligible.repairs.map((r) => ({
            value: r.deviceId._id,
            label: `${r.deviceId.assetCode} · Không thể sửa (${r.code})`,
          })),
        ]
      : line.kind === "PART"
        ? eligible.balances.map((b) => ({
            value: b.partId._id,
            label: `${b.partId.code} · ${b.partId.name} · tồn ${b.quantity}`,
          }))
        : eligible.serials.map((s) => ({
            value: s._id,
            label: `${s.partId.code} · ${s.partId.name} · ${s.serial}`,
          }));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const v = (n: string) => String(form.get(n) ?? "").trim();
    const payload = {
      documentDate: v("documentDate"),
      liquidationDate: v("liquidationDate") || undefined,
      warehouseId,
      reason: v("reason"),
      method: v("method"),
      requestedDepartmentId: v("requestedDepartmentId") || undefined,
      responsiblePerson: v("responsiblePerson") || undefined,
      note: v("note") || undefined,
      lines: lines.map((line) => {
        const repair = eligible.repairs.find(
          (r) => r.deviceId._id === line.targetId,
        );
        return {
          kind: line.kind,
          deviceId: line.kind === "DEVICE" ? line.targetId : undefined,
          partId:
            line.kind === "PART"
              ? line.targetId
              : line.kind === "PART_SERIAL"
                ? eligible.serials.find((s) => s._id === line.targetId)?.partId
                    ._id
                : undefined,
          partSerialId: line.kind === "PART_SERIAL" ? line.targetId : undefined,
          repairId:
            line.kind === "DEVICE" ? line.repairId || repair?._id : undefined,
          quantity: line.kind === "PART" ? line.quantity : 1,
          liquidationValue: line.liquidationValue,
          reason: line.reason || undefined,
          note: line.note || undefined,
        };
      }),
    };
    const editing = editor !== "new" && editor;
    if (
      await action(
        editing ? `/api/liquidations/${editing._id}` : "/api/liquidations",
        editing ? "PATCH" : "POST",
        payload,
        editing ? "Đã cập nhật phiếu." : "Đã tạo phiếu thanh lý.",
      )
    )
      setEditor(null);
  }
  async function show(row: Row) {
    setBusy(true);
    try {
      setDetail(
        (await apiFetch<{ data: Row }>(`/api/liquidations/${row._id}`)).data,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải chi tiết.");
    } finally {
      setBusy(false);
    }
  }
  async function reasonAction(row: Row, type: "reject" | "cancel") {
    const reason = window
      .prompt(type === "reject" ? "Nhập lý do từ chối:" : "Nhập lý do hủy:")
      ?.trim();
    if (!reason) return;
    await action(
      `/api/liquidations/${row._id}/${type}`,
      "PATCH",
      { reason },
      type === "reject" ? "Đã từ chối phiếu." : "Đã hủy phiếu.",
    );
  }
  function print(row: Row) {
    const win = window.open("", "_blank");
    if (!win) return;
    const root = win.document.createElement("main");
    root.style.cssText = "font-family:Arial;padding:32px";
    const h = win.document.createElement("h1");
    h.textContent = `PHIẾU THANH LÝ ${row.code}`;
    root.append(h);
    [
      ["Ngày", formatDate(row.liquidationDate ?? row.documentDate)],
      ["Hình thức", methods[row.method]],
      ["Kho", refName(row.warehouseId)],
      ["Lý do", row.reason],
      ["Tổng giá trị", formatMoney(row.totalValue)],
      ["Trạng thái", statuses[row.status]],
    ].forEach(([a, b]) => {
      const p = win.document.createElement("p");
      p.textContent = `${a}: ${b}`;
      root.append(p);
    });
    row.lines.forEach((line, i) => {
      const p = win.document.createElement("p");
      p.textContent = `${i + 1}. ${line.name} · ${line.assetCode ?? "—"} · ${line.serial ?? "—"} · SL ${line.quantity} · ${formatMoney(line.liquidationValue)}`;
      root.append(p);
    });
    win.document.body.append(root);
    win.print();
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Thanh lý"
        description="Quản lý đề nghị, phê duyệt và hoàn tất thanh lý tài sản."
        action={
          hasPermission("liquidation.create")
            ? { label: "Tạo phiếu thanh lý", onClick: () => openEditor("new") }
            : undefined
        }
      />
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <Input
          label="Tìm kiếm"
          value={q}
          placeholder="Mã phiếu, tài sản, serial..."
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Trạng thái"
          value={status}
          placeholder="Tất cả"
          options={Object.entries(statuses).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex items-end">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setQ("");
              setStatus("");
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
      </div>
      {message && (
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" /> Đang tải...
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-8 w-8" />}
          title="Chưa có phiếu thanh lý"
          description="Tài sản chỉ rời vòng đời sử dụng sau khi phiếu được duyệt và hoàn tất."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  {[
                    "Mã phiếu",
                    "Ngày",
                    "Hình thức",
                    "Kho",
                    "Số tài sản",
                    "Tổng giá trị",
                    "Người đề nghị",
                    "Trạng thái",
                    "Thao tác",
                  ].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{row.code}</td>
                    <td className="p-3">{formatDate(row.documentDate)}</td>
                    <td className="p-3">{methods[row.method]}</td>
                    <td className="p-3">{refName(row.warehouseId)}</td>
                    <td className="p-3">
                      {row.lines.reduce((s, l) => s + l.quantity, 0)}
                    </td>
                    <td className="p-3">{formatMoney(row.totalValue)}</td>
                    <td className="p-3">{refName(row.requestedBy)}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          row.status === "COMPLETED"
                            ? "success"
                            : row.status === "REJECTED" ||
                                row.status === "CANCELLED"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {statuses[row.status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void show(row)}
                        >
                          <Eye /> Xem
                        </Button>
                        {row.status === "DRAFT" &&
                          hasPermission("liquidation.edit") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditor(row)}
                            >
                              Sửa
                            </Button>
                          )}
                        {row.status === "DRAFT" &&
                          hasPermission("liquidation.submit") && (
                            <Button
                              size="sm"
                              onClick={() =>
                                void action(
                                  `/api/liquidations/${row._id}/submit`,
                                  "PATCH",
                                  undefined,
                                  "Đã gửi duyệt.",
                                )
                              }
                            >
                              Gửi duyệt
                            </Button>
                          )}
                        {row.status === "PENDING" &&
                          hasPermission("liquidation.approve") && (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  void action(
                                    `/api/liquidations/${row._id}/approve`,
                                    "PATCH",
                                    undefined,
                                    "Đã duyệt phiếu.",
                                  )
                                }
                              >
                                Duyệt
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void reasonAction(row, "reject")}
                              >
                                Từ chối
                              </Button>
                            </>
                          )}
                        {row.status === "APPROVED" &&
                          hasPermission("liquidation.complete") && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmComplete(row)}
                            >
                              Hoàn tất
                            </Button>
                          )}
                        {["DRAFT", "PENDING", "APPROVED"].includes(
                          row.status,
                        ) &&
                          hasPermission("liquidation.cancel") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void reasonAction(row, "cancel")}
                            >
                              Hủy
                            </Button>
                          )}
                        {row.status === "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => print(row)}
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
        </>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(o) => !o && setEditor(null)}
        title={
          editor === "new" ? "Tạo phiếu thanh lý" : `Sửa phiếu ${editor?.code}`
        }
        className="max-w-5xl"
      >
        {editor && (
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                name="documentDate"
                label="Ngày lập *"
                required
                type="date"
                defaultValue={
                  editor === "new"
                    ? new Date().toISOString().slice(0, 10)
                    : editor.documentDate.slice(0, 10)
                }
              />
              <Input
                name="liquidationDate"
                label="Ngày dự kiến thanh lý"
                type="date"
                defaultValue={
                  editor === "new" ? "" : editor.liquidationDate?.slice(0, 10)
                }
              />
              <Select
                label="Kho *"
                value={warehouseId}
                required
                placeholder="Chọn kho"
                options={warehouses}
                onChange={(e) => {
                  setWarehouseId(e.target.value);
                  setLines([]);
                }}
              />
              <Select
                name="method"
                label="Hình thức *"
                required
                defaultValue={editor === "new" ? "SALE" : editor.method}
                options={Object.entries(methods).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Select
                name="requestedDepartmentId"
                label="Bộ phận đề nghị"
                placeholder="Không chọn"
                defaultValue={
                  editor === "new" ? "" : editor.requestedDepartmentId?._id
                }
                options={departments}
              />
              <Input
                name="responsiblePerson"
                label="Người phụ trách"
                defaultValue={editor === "new" ? "" : editor.responsiblePerson}
              />
              <Textarea
                name="reason"
                label="Lý do thanh lý *"
                required
                defaultValue={editor === "new" ? "" : editor.reason}
                className="sm:col-span-2 lg:col-span-3"
              />
              <Textarea
                name="note"
                label="Ghi chú"
                defaultValue={editor === "new" ? "" : editor.note}
                className="sm:col-span-2 lg:col-span-3"
              />
            </div>
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-semibold">Danh sách tài sản</h3>
                  <p className="text-xs text-muted-foreground">
                    Thiết bị đang được giữ, cho mượn, điều chuyển hoặc sửa chữa
                    thông thường không xuất hiện.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!warehouseId}
                  onClick={() =>
                    setLines((x) => [
                      ...x,
                      {
                        kind: "DEVICE",
                        targetId: "",
                        repairId: "",
                        quantity: 1,
                        liquidationValue: 0,
                        reason: "",
                        note: "",
                      },
                    ])
                  }
                >
                  <Plus /> Thêm dòng
                </Button>
              </div>
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1.2fr_2fr_.6fr_1fr_1.5fr_auto]"
                >
                  <Select
                    label="Loại"
                    value={line.kind}
                    options={Object.entries(kindLabels).map(
                      ([value, label]) => ({ value, label }),
                    )}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((v, n) =>
                          n === i
                            ? {
                                ...v,
                                kind: e.target.value as EditLine["kind"],
                                targetId: "",
                                quantity: 1,
                              }
                            : v,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Tài sản *"
                    value={line.targetId}
                    required
                    placeholder="Chọn tài sản"
                    options={options(line)}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((v, n) =>
                          n === i ? { ...v, targetId: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Số lượng"
                    type="number"
                    min={1}
                    disabled={line.kind !== "PART"}
                    value={line.kind === "PART" ? line.quantity : 1}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((v, n) =>
                          n === i
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Giá trị thanh lý"
                    type="number"
                    min={0}
                    value={line.liquidationValue}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((v, n) =>
                          n === i
                            ? { ...v, liquidationValue: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Lý do / ghi chú"
                    value={line.reason}
                    onChange={(e) =>
                      setLines((x) =>
                        x.map((v, n) =>
                          n === i ? { ...v, reason: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="mt-5"
                    onClick={() => setLines((x) => x.filter((_, n) => n !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </section>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy || !lines.length}>
                Lưu phiếu
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!confirmComplete}
        onOpenChange={(o) => !o && setConfirmComplete(null)}
        title="Xác nhận hoàn tất thanh lý"
      >
        <div className="space-y-4">
          <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">
            Sau khi hoàn tất, tài sản sẽ được chuyển sang trạng thái{" "}
            <strong>Đã thanh lý</strong> và không còn khả dụng cho các nghiệp vụ
            khác.
          </p>
          <p className="text-sm">
            Phiếu <strong>{confirmComplete?.code}</strong> gồm{" "}
            {confirmComplete?.lines.length} dòng tài sản. Thao tác sẽ cập nhật
            thiết bị và trừ tồn kho trong cùng transaction.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmComplete(null)}>
              Quay lại
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (
                  confirmComplete &&
                  (await action(
                    `/api/liquidations/${confirmComplete._id}/complete`,
                    "PATCH",
                    {},
                    "Đã hoàn tất thanh lý.",
                  ))
                )
                  setConfirmComplete(null);
              }}
            >
              Xác nhận hoàn tất
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={`Chi tiết phiếu ${detail?.code ?? ""}`}
        className="max-w-5xl"
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
              {[
                ["Mã phiếu", detail.code],
                ["Ngày lập", formatDate(detail.documentDate)],
                ["Ngày thanh lý", formatDate(detail.liquidationDate)],
                ["Trạng thái", statuses[detail.status]],
                ["Hình thức", methods[detail.method]],
                ["Kho", refName(detail.warehouseId)],
                ["Lý do", detail.reason],
                ["Người đề nghị", refName(detail.requestedBy)],
                ["Bộ phận", refName(detail.requestedDepartmentId)],
                ["Người tạo", refName(detail.createdBy)],
                ["Người duyệt", refName(detail.approvedBy)],
                ["Người hoàn tất", refName(detail.completedBy)],
              ].map(([a, b]) => (
                <div key={a}>
                  <dt className="text-xs text-muted-foreground">{a}</dt>
                  <dd className="font-medium">{b || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[850px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {[
                      "Loại",
                      "Tên",
                      "Mã tài sản",
                      "Serial",
                      "Model",
                      "Tình trạng",
                      "SL",
                      "Giá trị",
                      "Lý do",
                    ].map((h) => (
                      <th key={h} className="p-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2">{kindLabels[line.kind]}</td>
                      <td className="p-2">{line.name}</td>
                      <td className="p-2">{line.assetCode ?? "—"}</td>
                      <td className="p-2">{line.serial ?? "—"}</td>
                      <td className="p-2">{line.model ?? "—"}</td>
                      <td className="p-2">{line.condition ?? "—"}</td>
                      <td className="p-2">{line.quantity}</td>
                      <td className="p-2">
                        {formatMoney(line.liquidationValue)}
                      </td>
                      <td className="p-2">{line.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 font-semibold">Lịch sử xử lý</h3>
              {detail.statusHistory.map((e, i) => (
                <div key={i} className="mb-3 flex gap-3 text-sm">
                  <Badge>{statuses[e.status]}</Badge>
                  <span>
                    {stamp(e.at)} · {refName(e.by)}{" "}
                    {e.note ? `· ${e.note}` : ""}
                  </span>
                </div>
              ))}
            </section>
            {detail.status === "COMPLETED" && (
              <div className="flex justify-end">
                <Button onClick={() => print(detail)}>
                  <Printer /> In phiếu
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
