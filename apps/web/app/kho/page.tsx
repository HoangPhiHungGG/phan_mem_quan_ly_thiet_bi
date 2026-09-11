"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Loader2,
  Package,
  Plus,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { loadCatalogOptions, type CatalogOption } from "@/lib/catalogs";
import WarehouseDetailPage from "./[id]/page";
import { WarehouseSelectionProvider } from "@/components/inventory/warehouse-selection";

type Warehouse = {
  _id: string;
  name: string;
  description?: string;
  address?: string;
  managerKeeperId?: { _id?: string; displayName?: string };
  isActive: boolean;
};
type Summary = {
  warehouse: Warehouse;
  devices: { total: number };
  parts: { types: number; quantity: number; low: number; out: number };
};

export default function WarehousePage() {
  const { hasPermission } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [selectedId, setSelectedId] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [keepers, setKeepers] = useState<CatalogOption[]>([]);
  const canManage = hasPermission("warehouses.manage");

  async function load() {
    try {
      setState("loading");
      const result = await apiFetch<{ data: Warehouse[] }>("/api/warehouses");
      setWarehouses(result.data);
      void loadCatalogOptions("keepers")
        .then(setKeepers)
        .catch(() => undefined);
      const pairs = await Promise.all(
        result.data.map(async (warehouse) => {
          const response = await apiFetch<{ data: Summary }>(
            `/api/inventory/warehouses/${warehouse._id}`,
          );
          return [warehouse._id, response.data] as const;
        }),
      );
      setSummaries(Object.fromEntries(pairs));
      setSelectedId((current) => {
        const remembered = window.localStorage.getItem(
          "pmqltb:selectedWarehouse",
        );
        const candidate = current || remembered || "";
        return result.data.some((item) => item._id === candidate)
          ? candidate
          : (result.data[0]?._id ?? "");
      });
      setState("ready");
    } catch {
      setState("error");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (selectedId)
      window.localStorage.setItem("pmqltb:selectedWarehouse", selectedId);
  }, [selectedId]);

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setFormError("Vui lòng nhập tên kho.");
      return;
    }
    try {
      setSaving(true);
      const result = await apiFetch<{ data: Warehouse }>("/api/warehouses", {
        method: "POST",
        body: JSON.stringify({
          name,
          description:
            String(form.get("description") ?? "").trim() || undefined,
          address: String(form.get("address") ?? "").trim() || undefined,
          managerKeeperId:
            String(form.get("managerKeeperId") ?? "").trim() || undefined,
        }),
      });
      setShowCreate(false);
      await load();
      setSelectedId(result.data._id);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể tạo kho.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const form = new FormData(event.currentTarget);
    try {
      setSaving(true);
      await apiFetch(`/api/warehouses/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          address: String(form.get("address") ?? "").trim(),
          managerKeeperId: String(form.get("managerKeeperId") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
        }),
      });
      setShowEdit(false);
      await load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể cập nhật kho.",
      );
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(
    () =>
      Object.values(summaries).reduce(
        (value, item) => ({
          devices: value.devices + item.devices.total,
          quantity: value.quantity + item.parts.quantity,
          low: value.low + item.parts.low + item.parts.out,
        }),
        { devices: 0, quantity: 0, low: 0 },
      ),
    [summaries],
  );
  if (state === "loading")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải kho...
      </p>
    );
  if (state === "error")
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        <p>Không thể tải dữ liệu kho.</p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Thử lại
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kho</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi thiết bị, linh kiện và giao dịch của từng kho.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus />
            Thêm kho
          </Button>
        )}
      </header>
      {showCreate && canManage && (
        <form
          onSubmit={createWarehouse}
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
        >
          <h2 className="font-semibold sm:col-span-2">Thêm kho mới</h2>
          <Input name="name" label="Tên kho *" required maxLength={150} />
          <Input name="address" label="Vị trí" maxLength={300} />
          <Select
            name="managerKeeperId"
            label="Người phụ trách"
            placeholder="-- Không chọn --"
            options={keepers}
          />
          <Textarea name="description" label="Mô tả" maxLength={500} />
          <div className="flex gap-2 sm:col-span-2">
            <Button disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}Lưu kho
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Hủy
            </Button>
          </div>
          {formError && (
            <p className="text-sm text-red-700 sm:col-span-2">{formError}</p>
          )}
        </form>
      )}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Tổng số kho", warehouses.length, WarehouseIcon],
            ["Thiết bị trong kho", totals.devices, Package],
            ["Tồn linh kiện", totals.quantity, Boxes],
            ["Hàng sắp hết", totals.low, AlertTriangle],
          ] as const
        ).map(([label, value, Icon]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <Icon className="mb-2 h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">{String(label)}</p>
            <p className="text-2xl font-bold tabular-nums">
              {Number(value).toLocaleString("vi-VN")}
            </p>
          </div>
        ))}
      </section>
      {warehouses.length > 1 && (
        <section className="space-y-2">
          <p className="text-sm font-medium">Kho đang xem</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {warehouses.map((warehouse) => (
              <button
                key={warehouse._id}
                onClick={() => setSelectedId(warehouse._id)}
                className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium ${selectedId === warehouse._id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted"}`}
              >
                {warehouse.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {selectedId && canManage && !showEdit && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            Sửa thông tin kho
          </Button>
        </div>
      )}
      {showEdit &&
        (() => {
          const warehouse = warehouses.find((item) => item._id === selectedId);
          return warehouse ? (
            <form
              onSubmit={updateWarehouse}
              className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
            >
              <h2 className="font-semibold sm:col-span-2">Sửa thông tin kho</h2>
              <Input
                name="name"
                label="Tên kho *"
                required
                defaultValue={warehouse.name}
              />
              <Input
                name="address"
                label="Vị trí"
                defaultValue={warehouse.address ?? ""}
              />
              <Select
                name="managerKeeperId"
                label="Người phụ trách"
                placeholder="-- Không chọn --"
                options={keepers}
                defaultValue={warehouse.managerKeeperId?._id ?? ""}
              />
              <Textarea
                name="description"
                label="Mô tả"
                defaultValue={warehouse.description ?? ""}
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button disabled={saving}>Lưu thay đổi</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEdit(false)}
                >
                  Hủy
                </Button>
              </div>
            </form>
          ) : null;
        })()}
      {!warehouses.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Chưa có kho nào.
        </p>
      ) : (
        selectedId && (
          <WarehouseSelectionProvider key={selectedId} warehouseId={selectedId}>
            <WarehouseDetailPage />
          </WarehouseSelectionProvider>
        )
      )}
    </div>
  );
}
