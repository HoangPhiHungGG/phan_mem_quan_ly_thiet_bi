"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Eye, Loader2, Printer } from "lucide-react";
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
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";
type Ref = { _id: string; code?: string; name?: string; displayName?: string };
type Summary = {
  total: number;
  checked: number;
  unchecked: number;
  matched: number;
  discrepancies: number;
  notFound: number;
  open: number;
};
type DeviceItem = {
  _id: string;
  assetCode: string;
  name?: string;
  serial?: string;
  expectedWarehouseId?: Ref;
  expectedDepartmentId?: Ref;
  expectedKeeperId?: Ref;
  expectedLocationId?: Ref;
  expectedCondition: string;
  checked: boolean;
  revision: number;
  found?: boolean;
  actualWarehouseId?: Ref;
  actualDepartmentId?: Ref;
  actualKeeperId?: Ref;
  actualLocationId?: Ref;
  actualCondition?: string;
  result?: string;
  note?: string;
};
type PartItem = {
  _id: string;
  code: string;
  name: string;
  unit?: string;
  warehouseId: Ref;
  expectedQuantity: number;
  checked: boolean;
  revision: number;
  actualQuantity?: number;
  difference?: number;
  result?: string;
  note?: string;
};
type Discrepancy = {
  key: string;
  kind: string;
  type: string;
  status: string;
  cause?: string;
  resolution?: string;
  note?: string;
  resolvedBy?: Ref;
  resolvedAt?: string;
};
type Row = {
  _id: string;
  code: string;
  name: string;
  countDate: string;
  scope: string;
  warehouseId?: Ref;
  departmentId?: Ref;
  locationId?: Ref;
  responsiblePerson: string;
  members: string[];
  note?: string;
  status: string;
  snapshotAt?: string;
  completedAt?: string;
  deviceItems: DeviceItem[];
  partItems: PartItem[];
  discrepancies: Discrepancy[];
  unexpectedItems: Array<{
    _id: string;
    assetCode: string;
    serial?: string;
    name?: string;
    result: string;
    note?: string;
  }>;
  summary: Summary;
};
const statuses: Record<string, string> = {
  DRAFT: "Nháp",
  IN_PROGRESS: "Đang kiểm kê",
  RECONCILING: "Đang đối chiếu",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};
const scopes: Record<string, string> = {
  ALL: "Toàn hệ thống",
  WAREHOUSE: "Theo kho",
  DEPARTMENT: "Theo bộ phận",
  LOCATION: "Theo vị trí",
};
const results: Record<string, string> = {
  MATCHED: "Khớp",
  MISSING: "Thiếu",
  SURPLUS: "Thừa",
  NOT_FOUND: "Không tìm thấy",
  WRONG_LOCATION: "Sai vị trí",
  WRONG_HOLDER: "Sai người giữ",
  CONDITION_MISMATCH: "Sai tình trạng",
};
const conditions = [
  { value: "GOOD", label: "Tốt" },
  { value: "DEGRADED", label: "Suy giảm" },
  { value: "BROKEN", label: "Hỏng" },
];
const name = (r?: Ref) => r?.displayName ?? r?.name ?? r?.code ?? "—";
export function InventoryCountPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1);
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Row | "new" | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [scope, setScope] = useState("ALL");
  const [opts, setOpts] = useState<Record<string, CatalogOption[]>>({});
  const load = useCallback(async () => {
    if (!hasPermission("inventory.view")) {
      setError("Bạn không có quyền xem module Kiểm kê.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" });
      if (q) p.set("q", q);
      if (status) p.set("status", status);
      const r = await apiFetch<{ data: Row[]; meta: { totalPages: number } }>(
        `/api/inventory-counts?${p}`,
      );
      setRows(r.data);
      setPages(r.meta.totalPages);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải phiếu kiểm kê.");
    } finally {
      setLoading(false);
    }
  }, [hasPermission, page, q, status]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("warehouses"),
      loadCatalogOptions("departments"),
      loadCatalogOptions("locations"),
      loadCatalogOptions("keepers"),
    ])
      .then(([warehouses, departments, locations, keepers]) =>
        setOpts({ warehouses, departments, locations, keepers }),
      )
      .catch(() => undefined);
  }, []);
  const act = async (path: string, body: unknown, msg: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ data: Row }>(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMessage(msg);
      setDetail(r.data);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  async function open(row: Row) {
    setBusy(true);
    try {
      setDetail(
        (await apiFetch<{ data: Row }>(`/api/inventory-counts/${row._id}`))
          .data,
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      v = (n: string) => String(f.get(n) ?? "").trim();
    const payload = {
      name: v("name"),
      countDate: v("countDate"),
      scope,
      warehouseId: scope === "WAREHOUSE" ? v("warehouseId") : undefined,
      departmentId: scope === "DEPARTMENT" ? v("departmentId") : undefined,
      locationId: scope === "LOCATION" ? v("locationId") : undefined,
      responsiblePerson: v("responsiblePerson"),
      members: v("members")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      note: v("note") || undefined,
    };
    const editing = editor !== "new" && editor;
    setBusy(true);
    try {
      await apiFetch(
        editing
          ? `/api/inventory-counts/${editing._id}`
          : "/api/inventory-counts",
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setEditor(null);
      setMessage("Đã lưu phiếu kiểm kê.");
      await load();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Không thể lưu phiếu.");
    } finally {
      setBusy(false);
    }
  }
  async function checkDevice(e: FormEvent<HTMLFormElement>, item: DeviceItem) {
    e.preventDefault();
    if (!detail) return;
    const f = new FormData(e.currentTarget),
      v = (n: string) => String(f.get(n) ?? "");
    await act(
      `/api/inventory-counts/${detail._id}/devices/${item._id}`,
      {
        revision: item.revision,
        found: v("found") === "true",
        actualWarehouseId: v("actualWarehouseId") || undefined,
        actualDepartmentId: v("actualDepartmentId") || undefined,
        actualKeeperId: v("actualKeeperId") || undefined,
        actualLocationId: v("actualLocationId") || undefined,
        actualCondition: v("actualCondition") || undefined,
        note: v("note") || undefined,
      },
      `Đã kiểm ${item.assetCode}.`,
    );
  }
  async function checkPart(e: FormEvent<HTMLFormElement>, item: PartItem) {
    e.preventDefault();
    if (!detail) return;
    const f = new FormData(e.currentTarget);
    await act(
      `/api/inventory-counts/${detail._id}/parts/${item._id}`,
      {
        revision: item.revision,
        actualQuantity: Number(f.get("actualQuantity")),
        note: String(f.get("note") ?? ""),
      },
      `Đã kiểm ${item.code}.`,
    );
  }
  async function resolve(d: Discrepancy) {
    if (!detail) return;
    const cause = window.prompt("Nhập nguyên nhân chênh lệch:")?.trim();
    if (!cause) return;
    const resolution = window.prompt("Nhập hướng xử lý:")?.trim();
    if (!resolution) return;
    const action = window
      .prompt(
        "Nhập ACCEPT để chấp nhận, ADJUST để điều chỉnh dữ liệu, hoặc REJECT để bác bỏ:",
        "ACCEPT",
      )
      ?.trim()
      .toUpperCase();
    if (!["ACCEPT", "ADJUST", "REJECT"].includes(action ?? "")) return;
    await act(
      `/api/inventory-counts/${detail._id}/discrepancies/${encodeURIComponent(d.key)}`,
      { action, cause, resolution },
      "Đã xử lý chênh lệch.",
    );
  }
  async function recordUnexpected() {
    if (!detail) return;
    const assetCode = window
      .prompt("Nhập mã tài sản/tem vừa phát hiện:")
      ?.trim();
    if (!assetCode) return;
    const serial = window.prompt("Nhập serial nếu có:")?.trim();
    setBusy(true);
    try {
      const result = await apiFetch<{ data: Row }>(
        `/api/inventory-counts/${detail._id}/unexpected`,
        {
          method: "POST",
          body: JSON.stringify({ assetCode, serial: serial || undefined }),
        },
      );
      setDetail(result.data);
      setMessage("Đã ghi nhận tài sản phát sinh ngoài snapshot.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể ghi nhận tài sản.",
      );
    } finally {
      setBusy(false);
    }
  }
  function print(row: Row) {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.body.textContent = `PHIẾU KIỂM KÊ ${row.code}\n${row.name}\nNgày: ${formatDate(row.countDate)}\nTổng: ${row.summary.total} · Đã kiểm: ${row.summary.checked} · Sai lệch: ${row.summary.discrepancies}`;
    w.document.body.style.whiteSpace = "pre-wrap";
    w.print();
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Kiểm kê"
        description="Đối chiếu số liệu hệ thống với thực tế tại thời điểm chụp snapshot."
        action={
          hasPermission("inventory.create")
            ? {
                label: "Tạo kỳ kiểm kê",
                onClick: () => {
                  setEditor("new");
                  setScope("ALL");
                },
              }
            : undefined
        }
      />
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <Input
          label="Tìm kiếm"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Mã phiếu, tên đợt..."
        />
        <Select
          label="Trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="Tất cả"
          options={Object.entries(statuses).map(([value, label]) => ({
            value,
            label,
          }))}
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
        <p className="flex gap-2 py-8">
          <Loader2 className="animate-spin" />
          Đang tải...
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8" />}
          title="Chưa có kỳ kiểm kê"
          description="Tạo kỳ kiểm kê để chụp snapshot và đối chiếu với thực tế."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[950px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {[
                    "Mã phiếu",
                    "Tên đợt",
                    "Ngày",
                    "Phạm vi",
                    "Kho/Bộ phận",
                    "Tổng",
                    "Đã kiểm",
                    "Sai lệch",
                    "Trạng thái",
                    "Phụ trách",
                    "Thao tác",
                  ].map((h) => (
                    <th className="p-3 text-left" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr className="border-b last:border-0" key={r._id}>
                    <td className="p-3 font-medium">{r.code}</td>
                    <td className="p-3">{r.name}</td>
                    <td className="p-3">{formatDate(r.countDate)}</td>
                    <td className="p-3">{scopes[r.scope]}</td>
                    <td className="p-3">
                      {name(r.warehouseId ?? r.departmentId ?? r.locationId)}
                    </td>
                    <td className="p-3">{r.summary.total}</td>
                    <td className="p-3">{r.summary.checked}</td>
                    <td className="p-3">{r.summary.discrepancies}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          r.status === "COMPLETED"
                            ? "success"
                            : r.status === "CANCELLED"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {statuses[r.status]}
                      </Badge>
                    </td>
                    <td className="p-3">{r.responsiblePerson}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void open(r)}
                        >
                          <Eye />
                          Xem
                        </Button>
                        {r.status === "DRAFT" &&
                          hasPermission("inventory.edit") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditor(r);
                                setScope(r.scope);
                              }}
                            >
                              Sửa
                            </Button>
                          )}
                        {r.status === "DRAFT" &&
                          hasPermission("inventory.perform") && (
                            <Button
                              size="sm"
                              onClick={() =>
                                void act(
                                  `/api/inventory-counts/${r._id}/start`,
                                  {},
                                  "Đã tạo snapshot và bắt đầu kiểm kê.",
                                )
                              }
                            >
                              Bắt đầu
                            </Button>
                          )}
                        {r.status === "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => print(r)}
                          >
                            <Printer />
                            In
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={pages} onChange={setPage} />
        </>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(o) => !o && setEditor(null)}
        title={editor === "new" ? "Tạo kỳ kiểm kê" : `Sửa ${editor?.code}`}
        className="max-w-3xl"
      >
        {editor && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Input
              name="name"
              label="Tên đợt kiểm kê *"
              required
              defaultValue={editor === "new" ? "" : editor.name}
            />
            <Input
              name="countDate"
              label="Ngày kiểm kê *"
              required
              type="date"
              defaultValue={
                editor === "new"
                  ? new Date().toISOString().slice(0, 10)
                  : editor.countDate.slice(0, 10)
              }
            />
            <Select
              label="Phạm vi *"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={Object.entries(scopes).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            {scope === "WAREHOUSE" && (
              <Select
                name="warehouseId"
                label="Kho *"
                required
                options={opts.warehouses ?? []}
                placeholder="Chọn kho"
                defaultValue={editor !== "new" ? editor.warehouseId?._id : ""}
              />
            )}{" "}
            {scope === "DEPARTMENT" && (
              <Select
                name="departmentId"
                label="Bộ phận *"
                required
                options={opts.departments ?? []}
                placeholder="Chọn bộ phận"
                defaultValue={editor !== "new" ? editor.departmentId?._id : ""}
              />
            )}{" "}
            {scope === "LOCATION" && (
              <Select
                name="locationId"
                label="Vị trí *"
                required
                options={opts.locations ?? []}
                placeholder="Chọn vị trí"
                defaultValue={editor !== "new" ? editor.locationId?._id : ""}
              />
            )}
            <Input
              name="responsiblePerson"
              label="Người phụ trách *"
              required
              defaultValue={editor === "new" ? "" : editor.responsiblePerson}
            />
            <Input
              name="members"
              label="Thành viên (cách nhau bằng dấu phẩy)"
              defaultValue={editor === "new" ? "" : editor.members.join(", ")}
            />
            <Textarea
              name="note"
              label="Ghi chú"
              className="sm:col-span-2"
              defaultValue={editor === "new" ? "" : editor.note}
            />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(null)}
              >
                Hủy
              </Button>
              <Button disabled={busy}>Lưu phiếu</Button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={`Phiếu kiểm kê ${detail?.code ?? ""}`}
        className="max-w-6xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {[
                ["Tổng", detail.summary.total],
                ["Đã kiểm", detail.summary.checked],
                ["Chưa kiểm", detail.summary.unchecked],
                ["Khớp", detail.summary.matched],
                ["Sai lệch", detail.summary.discrepancies],
                ["Không tìm thấy", detail.summary.notFound],
                ["Chưa xử lý", detail.summary.open],
              ].map(([a, b]) => (
                <div className="rounded-lg border p-3 text-center" key={a}>
                  <p className="text-xl font-bold">{b}</p>
                  <p className="text-xs text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">Thiết bị</h3>
                {detail.status === "IN_PROGRESS" &&
                  hasPermission("inventory.perform") && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void recordUnexpected()}
                    >
                      Ghi nhận tài sản ngoài hệ thống
                    </Button>
                  )}
              </div>
              <div className="space-y-2">
                {detail.deviceItems.map((i) => (
                  <form
                    onSubmit={(e) => void checkDevice(e, i)}
                    key={i._id}
                    className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]"
                  >
                    <div>
                      <b>{i.assetCode}</b>
                      <p className="text-xs">
                        {i.name} · {i.serial ?? "—"}
                      </p>
                    </div>
                    <Select
                      name="found"
                      label="Trạng thái"
                      defaultValue={String(i.found ?? true)}
                      options={[
                        { value: "true", label: "Đã tìm thấy" },
                        { value: "false", label: "Không tìm thấy" },
                      ]}
                    />
                    <Select
                      name="actualLocationId"
                      label={`Vị trí HT: ${name(i.expectedLocationId)}`}
                      placeholder="Không có"
                      options={opts.locations ?? []}
                      defaultValue={
                        i.actualLocationId?._id ?? i.expectedLocationId?._id
                      }
                    />
                    <Select
                      name="actualKeeperId"
                      label={`Người giữ HT: ${name(i.expectedKeeperId)}`}
                      placeholder="Không có"
                      options={opts.keepers ?? []}
                      defaultValue={
                        i.actualKeeperId?._id ?? i.expectedKeeperId?._id
                      }
                    />
                    <Select
                      name="actualCondition"
                      label={`Tình trạng HT: ${i.expectedCondition}`}
                      options={conditions}
                      defaultValue={i.actualCondition ?? i.expectedCondition}
                    />
                    <Input name="note" label="Ghi chú" defaultValue={i.note} />
                    <div className="self-center">
                      <Badge
                        variant={
                          i.result === "MATCHED"
                            ? "success"
                            : i.result
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {i.result ? results[i.result] : "Chưa kiểm"}
                      </Badge>
                    </div>
                    {detail.status === "IN_PROGRESS" &&
                      hasPermission("inventory.perform") && (
                        <Button className="self-end" size="sm">
                          Lưu
                        </Button>
                      )}
                  </form>
                ))}
              </div>
              {detail.unexpectedItems?.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <h4 className="font-medium text-amber-900">
                    Tài sản phát sinh ngoài snapshot
                  </h4>
                  {detail.unexpectedItems.map((item) => (
                    <p key={item._id} className="mt-1 text-sm">
                      {item.assetCode} · {item.serial ?? "Không có serial"} ·{" "}
                      {results[item.result]}
                    </p>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Linh kiện</h3>
              <div className="space-y-2">
                {detail.partItems.map((i) => (
                  <form
                    onSubmit={(e) => void checkPart(e, i)}
                    key={i._id}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto]"
                  >
                    <div>
                      <b>
                        {i.code} · {i.name}
                      </b>
                      <p className="text-xs">
                        {name(i.warehouseId)} · {i.unit ?? "—"}
                      </p>
                    </div>
                    <Input
                      label="Tồn hệ thống"
                      disabled
                      value={i.expectedQuantity}
                    />
                    <Input
                      name="actualQuantity"
                      label="Thực tế"
                      type="number"
                      min={0}
                      required
                      defaultValue={i.actualQuantity ?? i.expectedQuantity}
                    />
                    <div className="self-center">
                      Chênh lệch: <b>{i.difference ?? "—"}</b>
                      <br />
                      <Badge
                        variant={
                          i.result === "MATCHED"
                            ? "success"
                            : i.result
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {i.result ? results[i.result] : "Chưa kiểm"}
                      </Badge>
                    </div>
                    <Input name="note" label="Ghi chú" defaultValue={i.note} />
                    {detail.status === "IN_PROGRESS" &&
                      hasPermission("inventory.perform") && (
                        <Button className="self-end" size="sm">
                          Lưu
                        </Button>
                      )}
                  </form>
                ))}
              </div>
            </section>
            {detail.status === "RECONCILING" && (
              <section>
                <h3 className="mb-2 font-semibold">Xử lý chênh lệch</h3>
                {detail.discrepancies.map((d) => (
                  <div
                    key={d.key}
                    className="mb-2 flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <Badge
                        variant={
                          d.status === "OPEN" ? "destructive" : "success"
                        }
                      >
                        {d.status}
                      </Badge>{" "}
                      <b>{results[d.type]}</b>
                      {d.cause && (
                        <p>
                          {d.cause} · {d.resolution}
                        </p>
                      )}
                    </div>
                    {d.status === "OPEN" &&
                      hasPermission("inventory.reconcile") && (
                        <Button size="sm" onClick={() => void resolve(d)}>
                          Xử lý
                        </Button>
                      )}
                  </div>
                ))}
              </section>
            )}
            <div className="flex justify-end gap-2">
              {detail.status === "IN_PROGRESS" &&
                hasPermission("inventory.reconcile") && (
                  <Button
                    onClick={() =>
                      void act(
                        `/api/inventory-counts/${detail._id}/reconcile`,
                        {},
                        "Đã chuyển sang đối chiếu.",
                      )
                    }
                  >
                    Đối chiếu
                  </Button>
                )}
              {detail.status === "RECONCILING" &&
                hasPermission("inventory.complete") && (
                  <Button
                    onClick={() =>
                      void act(
                        `/api/inventory-counts/${detail._id}/complete`,
                        {},
                        "Đã hoàn tất kiểm kê.",
                      )
                    }
                  >
                    Hoàn tất
                  </Button>
                )}
              {["DRAFT", "IN_PROGRESS", "RECONCILING"].includes(
                detail.status,
              ) &&
                hasPermission("inventory.cancel") && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const reason = window.prompt("Lý do hủy:")?.trim();
                      if (reason)
                        void act(
                          `/api/inventory-counts/${detail._id}/cancel`,
                          { reason },
                          "Đã hủy phiếu.",
                        );
                    }}
                  >
                    Hủy
                  </Button>
                )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
