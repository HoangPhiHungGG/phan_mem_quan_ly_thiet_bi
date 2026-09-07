"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { CatalogCombobox } from "@/components/catalog/catalog-combobox";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch, apiFetchAllPages } from "@/lib/api";
import { exportExcel } from "@/lib/excel";
import {
  PART_TRACKING_LABELS,
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";

type PartRow = {
  _id: string;
  code: string;
  name: string;
  trackingMode: keyof typeof PART_TRACKING_LABELS;
  stockQty: number;
  minQty: number;
  unitId?: { _id: string; name: string } | null;
  deviceTypeId?: { _id: string; name: string } | null;
  modelId?: { _id: string; name: string } | null;
  supplierId?: { _id: string; name: string } | null;
  spec?: string;
  note?: string;
  isActive: boolean;
};

type ListResult = {
  data: PartRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const EMPTY: Record<string, CatalogOption[]> = {};

export default function PartListPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PartRow[]>([]);
  const [meta, setMeta] = useState<ListResult["meta"] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [q, setQ] = useState("");
  const [trackingMode, setTrackingMode] = useState("");
  const [deviceTypeId, setDeviceTypeId] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState("");
  const [opts, setOpts] = useState<Record<string, CatalogOption[]>>(EMPTY);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const canManage = hasPermission("parts.manage");
  const canManageCatalog = hasPermission("catalog.manage");

  function addOption(key: string, option: CatalogOption) {
    setOpts((current) => ({
      ...current,
      [key]: [...(current[key] ?? []), option].sort((a, b) =>
        a.label.localeCompare(b.label, "vi"),
      ),
    }));
  }

  const load = useCallback(() => {
    if (!hasPermission("parts.read")) {
      setState("error");
      return;
    }
    setState("loading");
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (trackingMode) params.set("trackingMode", trackingMode);
    if (deviceTypeId) params.set("deviceTypeId", deviceTypeId);
    apiFetch<ListResult>(`/api/parts?${params}`)
      .then((result) => {
        setRows(result.data);
        setMeta(result.meta);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [hasPermission, page, q, trackingMode, deviceTypeId]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("units"),
      loadCatalogOptions("device-types"),
      loadCatalogOptions("item-models"),
      loadCatalogOptions("suppliers"),
      loadCatalogOptions("warehouses"),
    ])
      .then(([units, deviceTypes, models, suppliers, warehouses]) =>
        setOpts({ units, deviceTypes, models, suppliers, warehouses }),
      )
      .catch(() => undefined);
  }, []);

  async function createPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const raw = form.get(name);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    const initialSerials = value("initialSerials")
      ?.split(/[\n,]+/)
      .map((serial) => serial.trim())
      .filter(Boolean);
    const isSerial = form.get("trackingMode") === "SERIAL";
    try {
      await apiFetch("/api/parts", {
        method: "POST",
        body: JSON.stringify({
          code: value("code"),
          name: value("name"),
          trackingMode: form.get("trackingMode"),
          unitId: value("unitId"),
          deviceTypeId: value("deviceTypeId"),
          modelId: value("modelId"),
          supplierId: value("supplierId"),
          spec: value("spec"),
          note: value("note"),
          minQty: value("minQty") ? Number(value("minQty")) : undefined,
          initialStock: {
            warehouseId: value("initialWarehouseId"),
            quantity: isSerial
              ? (initialSerials?.length ?? 0)
              : value("initialQuantity")
                ? Number(value("initialQuantity"))
                : 0,
            type: value("initialType") ?? "OPENING",
            note: value("initialNote"),
            serials: initialSerials,
          },
        }),
      });
      setShowCreate(false);
      setCreateValues({});
      setPage(1);
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể tạo linh kiện.",
      );
    }
  }
  async function removePart(row: PartRow) {
    if (
      !window.confirm(`Bạn có chắc muốn ngừng sử dụng linh kiện ${row.name}?`)
    )
      return;
    setFormError("");
    try {
      await apiFetch(`/api/parts/${row._id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể xóa linh kiện.",
      );
    }
  }
  async function downloadExcel() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (trackingMode) params.set("trackingMode", trackingMode);
    if (deviceTypeId) params.set("deviceTypeId", deviceTypeId);
    const parts = await apiFetchAllPages<PartRow>("/api/parts", params);
    await exportExcel("Linh_kien", [
      {
        name: "Linh kiện",
        rows: parts.map((row, index) => ({
          STT: index + 1,
          "Mã linh kiện": row.code,
          "Tên linh kiện": row.name,
          "Kiểu quản lý":
            PART_TRACKING_LABELS[row.trackingMode] ?? row.trackingMode,
          "Loại thiết bị": row.deviceTypeId?.name ?? "",
          "Model / Mã hàng": row.modelId?.name ?? "",
          "Đơn vị tính": row.unitId?.name ?? "",
          "Nhà cung cấp": row.supplierId?.name ?? "",
          "Thông số": row.spec ?? "",
          "Tổng tồn kho": row.stockQty,
          "Tồn tối thiểu": row.minQty,
          "Trạng thái": row.isActive ? "Đang sử dụng" : "Ngừng sử dụng",
          "Ghi chú": row.note ?? "",
        })),
      },
    ]);
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Linh kiện</h2>
        <p className="text-sm text-muted-foreground">
          Quản lý theo số lượng hoặc theo từng chiếc có serial. Tồn kho tăng qua
          nghiệp vụ nhập (số dư đầu kỳ, mua sắm, thu hồi...).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Tìm kiếm"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Mã / tên / mô tả..."
        />
        <Select
          label="Kiểu quản lý"
          value={trackingMode}
          onChange={(e) => {
            setTrackingMode(e.target.value);
            setPage(1);
          }}
          placeholder="Tất cả"
          options={Object.entries(PART_TRACKING_LABELS).map(
            ([value, label]) => ({
              value,
              label,
            }),
          )}
        />
        <Select
          label="Loại thiết bị"
          value={deviceTypeId}
          onChange={(e) => {
            setDeviceTypeId(e.target.value);
            setPage(1);
          }}
          placeholder="Tất cả"
          options={opts.deviceTypes ?? []}
        />
      </div>

      {canManage && (
        <div className="flex gap-2">
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus /> Thêm linh kiện
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void downloadExcel()}
          >
            <Download /> Xuất Excel
          </Button>
        </div>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {formError}
        </p>
      )}

      {showCreate && canManage && (
        <form
          onSubmit={createPart}
          className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Input name="code" label="Mã linh kiện *" required maxLength={80} />
          <Input name="name" label="Tên *" required maxLength={150} />
          <Select
            name="trackingMode"
            label="Kiểu quản lý *"
            required
            value={createValues.trackingMode ?? "QUANTITY"}
            onChange={(event) =>
              setCreateValues((current) => ({
                ...current,
                trackingMode: event.target.value,
                initialSerials: "",
              }))
            }
            options={Object.entries(PART_TRACKING_LABELS).map(
              ([value, label]) => ({
                value,
                label,
              }),
            )}
          />
          <CatalogCombobox
            name="unitId"
            label="Đơn vị tính *"
            type="units"
            options={opts.units ?? []}
            value={createValues.unitId ?? ""}
            onValueChange={(value) =>
              setCreateValues((current) => ({ ...current, unitId: value }))
            }
            onCreated={(option) => addOption("units", option)}
            canCreate={canManageCatalog}
            required
          />
          <CatalogCombobox
            name="deviceTypeId"
            label="Loại thiết bị"
            type="device-types"
            options={opts.deviceTypes ?? []}
            value={createValues.deviceTypeId ?? ""}
            onValueChange={(value) =>
              setCreateValues((current) => ({
                ...current,
                deviceTypeId: value,
                modelId: "",
              }))
            }
            onCreated={(option) => addOption("deviceTypes", option)}
            canCreate={canManageCatalog}
          />
          <CatalogCombobox
            name="modelId"
            label="Mã hàng / model"
            type="item-models"
            options={(opts.models ?? []).filter(
              (option) =>
                !createValues.deviceTypeId ||
                option.deviceTypeId === createValues.deviceTypeId,
            )}
            value={createValues.modelId ?? ""}
            onValueChange={(value) =>
              setCreateValues((current) => ({ ...current, modelId: value }))
            }
            onCreated={(option) => addOption("models", option)}
            canCreate={canManageCatalog}
            context={{ deviceTypeId: createValues.deviceTypeId }}
            placeholder="Chọn loại thiết bị trước hoặc tìm model..."
          />
          <CatalogCombobox
            name="supplierId"
            label="Nhà cung cấp"
            type="suppliers"
            options={opts.suppliers ?? []}
            value={createValues.supplierId ?? ""}
            onValueChange={(value) =>
              setCreateValues((current) => ({ ...current, supplierId: value }))
            }
            onCreated={(option) => addOption("suppliers", option)}
            canCreate={canManageCatalog}
          />
          <Input
            name="minQty"
            label="Tồn tối thiểu"
            type="number"
            min={0}
            defaultValue={0}
          />
          <Input name="spec" label="Thông số" maxLength={500} />
          <Textarea
            name="note"
            label="Ghi chú"
            className="sm:col-span-2 lg:col-span-3"
          />
          <section className="space-y-3 rounded-md border border-dashed p-4 sm:col-span-2 lg:col-span-3">
            <div>
              <h3 className="font-semibold">Nhập kho ban đầu</h3>
              <p className="text-xs text-muted-foreground">
                Tùy chọn. Nếu không chọn kho, linh kiện chỉ được tạo với tồn
                bằng 0.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CatalogCombobox
                name="initialWarehouseId"
                label="Kho nhập"
                type="warehouses"
                options={opts.warehouses ?? []}
                value={createValues.initialWarehouseId ?? ""}
                onValueChange={(value) =>
                  setCreateValues((current) => ({
                    ...current,
                    initialWarehouseId: value,
                  }))
                }
                onCreated={(option) => addOption("warehouses", option)}
                canCreate={canManageCatalog}
              />
              <Input
                name="initialQuantity"
                label="Số lượng ban đầu"
                type="number"
                min={0}
                defaultValue={0}
                disabled={
                  (createValues.trackingMode ?? "QUANTITY") === "SERIAL"
                }
              />
              <Select
                name="initialType"
                label="Nguồn nhập"
                defaultValue="OPENING"
                options={[
                  { value: "OPENING", label: "Tồn đầu kỳ" },
                  { value: "PURCHASE", label: "Mua sắm" },
                  { value: "RETURN", label: "Thu hồi" },
                  { value: "TRANSFER_IN", label: "Khác" },
                ]}
              />
              <Input
                name="initialNote"
                label="Ghi chú nhập kho"
                maxLength={500}
              />
            </div>
            {(createValues.trackingMode ?? "QUANTITY") === "SERIAL" && (
              <Textarea
                name="initialSerials"
                label="Danh sách serial nhập ban đầu"
                value={createValues.initialSerials ?? ""}
                onChange={(event) =>
                  setCreateValues((current) => ({
                    ...current,
                    initialSerials: event.target.value,
                  }))
                }
                placeholder="Mỗi serial một dòng hoặc ngăn cách bằng dấu phẩy. Số lượng được tính từ serial."
              />
            )}
          </section>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            Tồn kho khởi tạo bằng 0. Tăng tồn ban đầu phải qua nghiệp vụ nhập số
            dư đầu kỳ; không nhập tồn trực tiếp tại đây.
          </p>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit">Lưu linh kiện</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}
      {state === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
        </div>
      )}
      {state === "error" && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-4 text-sm text-red-700"
        >
          Không có quyền hoặc không thể tải danh sách linh kiện.
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có linh kiện.
        </p>
      )}

      {state === "ready" && rows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3">Mã</th>
                  <th className="p-3">Tên</th>
                  <th className="p-3">Kiểu quản lý</th>
                  <th className="p-3">Đơn vị</th>
                  <th className="p-3">Tồn kho</th>
                  <th className="p-3">Tồn tối thiểu</th>
                  <th className="p-3">Trạng thái</th>
                  {canManage && <th className="p-3">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b last:border-0 hover:bg-accent/30"
                  >
                    <td className="p-3 font-medium">
                      <Link
                        href={`/linh-kien/${row._id}`}
                        className="hover:underline"
                      >
                        {row.code}
                      </Link>
                    </td>
                    <td className="p-3">{row.name}</td>
                    <td className="p-3">
                      {PART_TRACKING_LABELS[row.trackingMode] ??
                        row.trackingMode}
                    </td>
                    <td className="p-3">{row.unitId?.name ?? "—"}</td>
                    <td className="p-3 font-medium">{row.stockQty}</td>
                    <td className="p-3">{row.minQty}</td>
                    <td className="p-3">
                      <span
                        className={
                          row.isActive
                            ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                            : "rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700"
                        }
                      >
                        {row.isActive ? "Đang dùng" : "Ngừng sử dụng"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/linh-kien/${row._id}`}>Sửa</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removePart(row)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </td>
                    )}
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
    </div>
  );
}
