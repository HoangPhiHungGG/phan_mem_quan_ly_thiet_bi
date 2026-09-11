"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import {
  PART_SERIAL_STATUS_LABELS,
  PART_TRACKING_LABELS,
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";

type Ref = { _id: string; name?: string } | null;

type PartDetail = {
  _id: string;
  code: string;
  name: string;
  trackingMode: string;
  stockQty: number;
  minQty: number;
  unitId: Ref;
  componentTypeId: Ref;
  modelId: Ref;
  supplierId: Ref;
  spec?: string;
  note?: string;
  isActive: boolean;
};

type SerialRow = {
  _id: string;
  serial: string;
  status: string;
  warehouseId?: Ref;
  locationId?: Ref;
  note?: string;
};
type WarehouseBalance = {
  _id: string;
  quantity: number;
  warehouseId?: { code?: string; name?: string } | null;
};

type ListResult<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export default function PartDetailPage() {
  const { hasPermission } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [part, setPart] = useState<PartDetail | null>(null);
  const [serials, setSerials] = useState<SerialRow[]>([]);
  const [serialMeta, setSerialMeta] = useState<
    ListResult<SerialRow>["meta"] | null
  >(null);
  const [serialPage, setSerialPage] = useState(1);
  const [balances, setBalances] = useState<WarehouseBalance[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [opts, setOpts] = useState<Record<string, CatalogOption[]>>({});
  const canManage = hasPermission("parts.manage");

  const load = useCallback(() => {
    setState("loading");
    apiFetch<{ data: PartDetail }>(`/api/parts/${id}`)
      .then((result) => {
        setPart(result.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id]);

  const loadSerials = useCallback(() => {
    apiFetch<ListResult<SerialRow>>(
      `/api/parts/${id}/serials?page=${serialPage}&limit=50`,
    )
      .then((result) => {
        setSerials(result.data);
        setSerialMeta(result.meta);
      })
      .catch(() => undefined);
  }, [id, serialPage]);
  const loadBalances = useCallback(() => {
    apiFetch<{ data: WarehouseBalance[] }>(`/api/inventory/part/${id}`)
      .then((result) => setBalances(result.data))
      .catch(() => undefined);
  }, [id]);

  useEffect(() => load(), [load]);
  useEffect(() => loadSerials(), [loadSerials]);
  useEffect(() => loadBalances(), [loadBalances]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("units"),
      loadCatalogOptions("component-types"),
      loadCatalogOptions("component-models"),
      loadCatalogOptions("suppliers"),
    ])
      .then(([units, componentTypes, models, suppliers]) =>
        setOpts({ units, componentTypes, models, suppliers }),
      )
      .catch(() => undefined);
  }, []);

  async function savePart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaved(false);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const raw = form.get(name);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    try {
      await apiFetch(`/api/parts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: value("name"),
          unitId: value("unitId"),
          componentTypeId: value("componentTypeId"),
          modelId: value("modelId"),
          supplierId: value("supplierId"),
          spec: value("spec"),
          note: value("note"),
          minQty: value("minQty") ? Number(value("minQty")) : undefined,
        }),
      });
      setSaved(true);
      load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu.");
    }
  }

  async function toggleActive() {
    if (!part) return;
    setFormError("");
    try {
      await apiFetch(`/api/parts/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !part.isActive }),
      });
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể đổi trạng thái.",
      );
    }
  }
  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải linh kiện...
      </div>
    );
  }
  if (state === "error" || !part) {
    return (
      <p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        Không thể tải linh kiện.{" "}
        <Link href="/linh-kien" className="underline">
          Về danh sách
        </Link>
      </p>
    );
  }

  const info: [string, string][] = [
    ["Mã", part.code],
    [
      "Kiểu quản lý",
      PART_TRACKING_LABELS[part.trackingMode] ?? part.trackingMode,
    ],
    ["Đơn vị tính", part.unitId?.name ?? "—"],
    [
      "Tồn kho",
      part.trackingMode === "SERIAL"
        ? `${serialMeta?.total ?? 0} chiếc`
        : String(part.stockQty),
    ],
    ["Tồn tối thiểu", String(part.minQty)],
    ["Loại linh kiện", part.componentTypeId?.name ?? "—"],
    ["Model linh kiện", part.modelId?.name ?? "—"],
    ["Nhà cung cấp", part.supplierId?.name ?? "—"],
    ["Thông số", part.spec ?? "—"],
    ["Ghi chú", part.note ?? "—"],
    ["Trạng thái", part.isActive ? "Đang dùng" : "Ngừng sử dụng"],
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/linh-kien"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Danh sách linh kiện
      </Link>

      <div>
        <h2 className="text-2xl font-bold">
          {part.name}{" "}
          <span className="text-base text-muted-foreground">({part.code})</span>
        </h2>
      </div>

      {saved && (
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Đã lưu thay đổi.
        </p>
      )}
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {formError}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {info.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-base font-semibold">Tồn theo kho</h3>
        {balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có tồn kho.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3">Kho</th>
                  <th className="p-3">Mã kho</th>
                  <th className="p-3">Số lượng</th>
                  <th className="p-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((item) => (
                  <tr key={item._id} className="border-b last:border-0">
                    <td className="p-3">{item.warehouseId?.name ?? "—"}</td>
                    <td className="p-3">{item.warehouseId?.code ?? "—"}</td>
                    <td className="p-3 font-medium">
                      {item.quantity} {part.unitId?.name ?? ""}
                    </td>
                    <td className="p-3">
                      {item.quantity > 0 ? "Còn hàng" : "Hết hàng"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <td className="p-3" colSpan={2}>
                    Tổng cộng
                  </td>
                  <td className="p-3">
                    {balances.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                    {part.unitId?.name ?? ""}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      {part.trackingMode === "SERIAL" && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-base font-semibold">
            Từng chiếc theo serial ({serialMeta?.total ?? 0})
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Serial được tạo qua nghiệp vụ nhập kho (số dư đầu kỳ, mua sắm...),
            không thêm trực tiếp tại đây.
          </p>
          {serials.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có serial nào trong kho.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-3">Serial</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3">Kho</th>
                    <th className="p-3">Vị trí</th>
                    <th className="p-3">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {serials.map((row) => (
                    <tr key={row._id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{row.serial}</td>
                      <td className="p-3">
                        {PART_SERIAL_STATUS_LABELS[row.status] ?? row.status}
                      </td>
                      <td className="p-3">{row.warehouseId?.name ?? "—"}</td>
                      <td className="p-3">{row.locationId?.name ?? "—"}</td>
                      <td className="p-3">{row.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={serialPage <= 1}
              onClick={() => setSerialPage(serialPage - 1)}
            >
              Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={(serialMeta?.totalPages ?? 1) <= serialPage}
              onClick={() => setSerialPage(serialPage + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {canManage && (
        <div className="space-y-4">
          <form
            onSubmit={savePart}
            className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <h3 className="text-base font-semibold sm:col-span-2 lg:col-span-3">
              Sửa linh kiện
            </h3>
            <Input
              name="name"
              label="Tên linh kiện"
              defaultValue={part.name}
              required
              maxLength={150}
            />
            <Select
              name="unitId"
              label="Đơn vị tính"
              required
              placeholder="-- Chọn --"
              options={opts.units ?? []}
              defaultValue={part.unitId?._id ?? ""}
            />
            <Select
              name="componentTypeId"
              label="Loại linh kiện"
              required
              placeholder="-- Chọn --"
              options={opts.componentTypes ?? []}
              defaultValue={part.componentTypeId?._id ?? ""}
            />
            <Select
              name="modelId"
              label="Model linh kiện"
              placeholder="-- Không chọn --"
              options={opts.models ?? []}
              defaultValue={part.modelId?._id ?? ""}
            />
            <Select
              name="supplierId"
              label="Nhà cung cấp"
              placeholder="-- Không chọn --"
              options={opts.suppliers ?? []}
              defaultValue={part.supplierId?._id ?? ""}
            />
            <Input
              name="minQty"
              label="Tồn tối thiểu"
              type="number"
              min={0}
              defaultValue={part.minQty}
            />
            <Input
              name="spec"
              label="Thông số"
              defaultValue={part.spec ?? ""}
              maxLength={500}
            />
            <Input
              name="note"
              label="Ghi chú"
              defaultValue={part.note ?? ""}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Mã, kiểu quản lý và tồn kho không sửa trực tiếp. Tồn kho chỉ thay
              đổi qua nghiệp vụ nhập/xuất.
            </p>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Lưu</Button>
              <Button type="button" variant="secondary" onClick={toggleActive}>
                {part.isActive ? "Ngừng sử dụng" : "Kích hoạt lại"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
