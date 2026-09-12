"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, Plus } from "lucide-react";
import { Download } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { CatalogCombobox } from "@/components/catalog/catalog-combobox";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch, apiFetchAllPages } from "@/lib/api";
import { exportExcel } from "@/lib/excel";
import { ExcelImportDialog } from "@/components/equipment/excel-import-dialog";
import {
  DEVICE_TYPE_LABELS,
  USAGE_STATUS_LABELS,
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";

type DeviceRow = {
  _id: string;
  assetCode: string;
  serial?: string;
  deviceTypeId?: { _id: string; name: string } | null;
  modelId?: { _id: string; name: string } | null;
  departmentId?: { _id: string; name: string } | null;
  warehouseId?: { _id: string; name: string } | null;
  keeperId?: { _id: string; displayName: string } | null;
  techCondition: keyof typeof DEVICE_TYPE_LABELS;
  usageStatus: keyof typeof USAGE_STATUS_LABELS;
};

type ListResult = {
  data: DeviceRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const EMPTY: Record<string, CatalogOption[]> = {};

export default function DeviceListPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [meta, setMeta] = useState<ListResult["meta"] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [q, setQ] = useState("");
  const [usageStatus, setUsageStatus] = useState("");
  const [deviceTypeId, setDeviceTypeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [formError, setFormError] = useState("");
  const [opts, setOpts] = useState<Record<string, CatalogOption[]>>(EMPTY);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const canManage = hasPermission("devices.manage");
  const canImport = hasPermission("devices.import");
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
    if (!hasPermission("devices.read")) {
      setState("error");
      return;
    }
    setState("loading");
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (usageStatus) params.set("usageStatus", usageStatus);
    if (deviceTypeId) params.set("deviceTypeId", deviceTypeId);
    if (departmentId) params.set("departmentId", departmentId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    apiFetch<ListResult>(`/api/devices?${params}`)
      .then((result) => {
        setRows(result.data);
        setMeta(result.meta);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [
    hasPermission,
    page,
    q,
    usageStatus,
    deviceTypeId,
    departmentId,
    warehouseId,
  ]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("device-types"),
      loadCatalogOptions("device-models"),
      loadCatalogOptions("suppliers"),
      loadCatalogOptions("departments"),
      loadCatalogOptions("warehouses"),
      loadCatalogOptions("locations"),
      loadCatalogOptions("keepers"),
    ])
      .then(
        ([
          deviceTypes,
          models,
          suppliers,
          departments,
          warehouses,
          locations,
          keepers,
        ]) =>
          setOpts({
            deviceTypes,
            models,
            suppliers,
            departments,
            warehouses,
            locations,
            keepers,
          }),
      )
      .catch(() => undefined);
  }, []);

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const raw = form.get(name);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    try {
      await apiFetch("/api/devices", {
        method: "POST",
        body: JSON.stringify({
          assetCode: value("assetCode"),
          serial: value("serial"),
          deviceTypeId: value("deviceTypeId"),
          modelId: value("modelId"),
          supplierId: value("supplierId"),
          purchasedAt: value("purchasedAt"),
          purchasePrice: value("purchasePrice")
            ? Number(value("purchasePrice"))
            : undefined,
          warrantyUntil: value("warrantyUntil"),
          techCondition: form.get("techCondition") || "GOOD",
          warehouseId: value("initialWarehouseId"),
          initialReceiptNote: value("initialReceiptNote"),
          notes: value("notes"),
        }),
      });
      setShowCreate(false);
      setCreateValues({});
      setPage(1);
      load();
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as Error & { code?: string }).code
          : undefined;
      setFormError(
        code === "DEVICE_CODE_EXISTS"
          ? "Mã tài sản đã tồn tại. Hãy dùng một mã khác."
          : code === "DEVICE_SERIAL_EXISTS"
            ? "Serial đã tồn tại. Hãy kiểm tra lại serial."
            : code === "WAREHOUSE_REFERENCE_INVALID"
              ? "Kho nhập ban đầu không hợp lệ hoặc đã ngừng sử dụng."
              : error instanceof Error
                ? error.message
                : "Không thể tạo hồ sơ thiết bị.",
      );
    }
  }

  async function removeDevice(row: DeviceRow) {
    if (
      !window.confirm(
        `Bạn có chắc muốn ngừng sử dụng thiết bị ${row.assetCode}?`,
      )
    )
      return;
    setFormError("");
    try {
      await apiFetch(`/api/devices/${row._id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể xóa thiết bị.",
      );
    }
  }
  async function downloadExcel() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (usageStatus) params.set("usageStatus", usageStatus);
    if (deviceTypeId) params.set("deviceTypeId", deviceTypeId);
    if (departmentId) params.set("departmentId", departmentId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    const devices = await apiFetchAllPages<DeviceRow>("/api/devices", params);
    await exportExcel("Thiet_bi", [
      {
        name: "Thiết bị",
        rows: devices.map((row, index) => ({
          STT: index + 1,
          "Mã tài sản": row.assetCode,
          Serial: row.serial ?? "",
          "Loại thiết bị": row.deviceTypeId?.name ?? "",
          Model: row.modelId?.name ?? "",
          "Tình trạng kỹ thuật":
            DEVICE_TYPE_LABELS[row.techCondition] ?? row.techCondition,
          "Trạng thái sử dụng":
            USAGE_STATUS_LABELS[row.usageStatus] ?? row.usageStatus,
          Kho: row.warehouseId?.name ?? "",
          "Bộ phận": row.departmentId?.name ?? "",
          "Người giữ": row.keeperId?.displayName ?? "",
        })),
      },
    ]);
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Thiết bị</h2>
        <p className="text-sm text-muted-foreground">
          Hồ sơ thiết bị: mã tài sản, serial, bảo hành, vị trí, người giữ
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          label="Tìm kiếm"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Mã tài sản / serial..."
        />
        <Select
          label="Trạng thái sử dụng"
          value={usageStatus}
          onChange={(e) => {
            setUsageStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Tất cả"
          options={Object.entries(USAGE_STATUS_LABELS).map(
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
        <Select
          label="Bộ phận"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setPage(1);
          }}
          placeholder="Tất cả"
          options={opts.departments ?? []}
        />
        <Select
          label="Kho"
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
          placeholder="Tất cả"
          options={opts.warehouses ?? []}
        />
      </div>

      {(canManage || canImport) && (
        <div className="flex gap-2">
          {canManage && (
            <Button type="button" onClick={() => setShowCreate((v) => !v)}>
              <Plus /> Thêm thiết bị
            </Button>
          )}
          {canImport && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowImport(true)}
            >
              <FileSpreadsheet /> Import Excel
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void downloadExcel()}
          >
            <Download /> Xuất Excel
          </Button>
        </div>
      )}
      <ExcelImportDialog
        kind="DEVICE"
        open={showImport}
        onOpenChange={setShowImport}
        onCompleted={() => {
          setPage(1);
          load();
        }}
      />
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
          onSubmit={createDevice}
          className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Input
            name="assetCode"
            label="Mã tài sản *"
            required
            maxLength={80}
          />
          <Input name="serial" label="Serial" maxLength={120} />
          <CatalogCombobox
            name="deviceTypeId"
            label="Loại thiết bị *"
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
            required
            placeholder="Tìm hoặc chọn loại thiết bị..."
          />
          <CatalogCombobox
            name="modelId"
            label="Model thiết bị"
            type="device-models"
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
          <Input name="purchasedAt" label="Ngày mua" type="date" />
          <Input
            name="purchasePrice"
            label="Giá mua (đ)"
            type="number"
            min={0}
          />
          <Input name="warrantyUntil" label="Bảo hành đến" type="date" />
          <Select
            name="techCondition"
            label="Tình trạng kỹ thuật *"
            required
            defaultValue="GOOD"
            options={Object.entries(DEVICE_TYPE_LABELS).map(
              ([value, label]) => ({
                value,
                label,
              }),
            )}
          />
          <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2 lg:col-span-3">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
              Nhập kho ban đầu
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <CatalogCombobox
                name="initialWarehouseId"
                label="Kho nhập ban đầu *"
                type="warehouses"
                options={opts.warehouses ?? []}
                value={createValues.initialWarehouseId ?? ""}
                onValueChange={(value) =>
                  setCreateValues((current) => ({
                    ...current,
                    initialWarehouseId: value,
                  }))
                }
                canCreate={false}
                onCreated={() => undefined}
                required
                placeholder="Tìm hoặc chọn kho..."
              />
              <Input
                name="initialReceiptNote"
                label="Ghi chú nhập kho"
                maxLength={500}
                placeholder="Ví dụ: Nhập tồn ban đầu"
              />
            </div>
          </div>
          <Textarea
            name="notes"
            label="Ghi chú"
            className="sm:col-span-2 lg:col-span-3"
          />
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            Thiết bị sẽ được đưa vào kho đã chọn sau khi lưu. Bộ phận, người giữ
            và vị trí chỉ thay đổi qua nghiệp vụ cấp phát, thu hồi hoặc điều
            chuyển.
          </p>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit">Lưu thiết bị</Button>
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
          Không có quyền hoặc không thể tải danh sách thiết bị.
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có thiết bị.
        </p>
      )}

      {state === "ready" && rows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3">Mã tài sản</th>
                  <th className="p-3">Serial</th>
                  <th className="p-3">Loại</th>
                  <th className="p-3">Model</th>
                  <th className="p-3">Kỹ thuật</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3">Người giữ</th>
                  <th className="p-3">Bộ phận</th>
                  <th className="p-3">Kho</th>
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
                        href={`/thiet-bi/${row._id}`}
                        className="hover:underline"
                      >
                        {row.assetCode}
                      </Link>
                    </td>
                    <td className="p-3">{row.serial ?? "—"}</td>
                    <td className="p-3">{row.deviceTypeId?.name ?? "—"}</td>
                    <td className="p-3">{row.modelId?.name ?? "—"}</td>
                    <td className="p-3">
                      {DEVICE_TYPE_LABELS[row.techCondition] ??
                        row.techCondition}
                    </td>
                    <td className="p-3">
                      {USAGE_STATUS_LABELS[row.usageStatus] ?? row.usageStatus}
                    </td>
                    <td className="p-3">{row.keeperId?.displayName ?? "—"}</td>
                    <td className="p-3">{row.departmentId?.name ?? "—"}</td>
                    <td className="p-3">{row.warehouseId?.name ?? "—"}</td>
                    {canManage && (
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/thiet-bi/${row._id}`}>Sửa</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeDevice(row)}
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
