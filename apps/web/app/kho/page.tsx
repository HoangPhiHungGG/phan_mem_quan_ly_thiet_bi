"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Warehouse = { _id: string; code: string; name: string; isActive: boolean };
type Device = { _id: string; assetCode: string };
type Balance = { quantity: number };

export default function WarehousePage() {
  const { hasPermission } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [counts, setCounts] = useState<
    Record<string, { devices: number; parts: number }>
  >({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = hasPermission("catalog.manage");
  function load() {
    apiFetch<{ data: Warehouse[] }>(
      "/api/catalog/warehouses?isActive=true&limit=100",
    )
      .then(async (result) => {
        setWarehouses(result.data);
        const entries = await Promise.all(
          result.data.map(async (warehouse) => {
            const devices = await apiFetch<{
              data: Device[];
              meta: { total: number };
            }>(`/api/devices?warehouseId=${warehouse._id}&limit=1`);
            const balances = await apiFetch<{ data: Balance[] }>(
              `/api/inventory?warehouseId=${warehouse._id}`,
            );
            return [
              warehouse._id,
              {
                devices: devices.meta.total,
                parts: balances.data.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                ),
              },
            ] as const;
          }),
        );
        setCounts(Object.fromEntries(entries));
        setState("ready");
      })
      .catch(() => setState("error"));
  }
  useEffect(() => {
    load();
  }, []);
  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const code = String(form.get("code") ?? "").trim();
    if (!name || !code) {
      setFormError("Vui lòng nhập tên và mã kho.");
      return;
    }
    try {
      setSaving(true);
      await apiFetch("/api/catalog/warehouses", {
        method: "POST",
        body: JSON.stringify({
          name,
          code,
          description:
            String(form.get("description") ?? "").trim() || undefined,
        }),
      });
      setShowCreate(false);
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể tạo kho.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (state === "loading")
    return (
      <p className="flex gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải kho...
      </p>
    );
  if (state === "error")
    return (
      <p role="alert" className="rounded bg-red-50 p-4 text-red-700">
        Không thể tải dữ liệu kho.
      </p>
    );
  const deviceTotal = Object.values(counts).reduce(
    (sum, value) => sum + value.devices,
    0,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Kho</h2>
          <p className="text-sm text-muted-foreground">
            Thiết bị được liên kết bằng tham chiếu `warehouseId`, không tạo bản
            sao dữ liệu.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus /> Thêm kho
          </Button>
        )}
      </div>
      {showCreate && canManage && (
        <form
          onSubmit={createWarehouse}
          className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2"
        >
          <h3 className="font-semibold sm:col-span-2">Thêm kho mới</h3>
          <Input
            name="name"
            label="Tên kho *"
            required
            maxLength={150}
            placeholder="Kho B"
          />
          <Input
            name="code"
            label="Mã kho *"
            required
            maxLength={50}
            placeholder="KHO-B"
          />
          <Textarea
            name="description"
            label="Mô tả"
            maxLength={500}
            className="sm:col-span-2"
          />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Lưu kho
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
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {formError}
            </p>
          )}
        </form>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Tổng số kho</p>
          <p className="text-2xl font-bold">{warehouses.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Thiết bị trong kho</p>
          <p className="text-2xl font-bold">{deviceTotal}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Linh kiện theo kho</p>
          <p className="text-sm font-medium">Theo số dư thực tế</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-3">Kho</th>
              <th className="p-3">Mã kho</th>
              <th className="p-3">Thiết bị</th>
              <th className="p-3">Linh kiện</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {warehouses.map((warehouse) => (
              <tr key={warehouse._id} className="border-b last:border-0">
                <td className="p-3 font-medium">{warehouse.name}</td>
                <td className="p-3">{warehouse.code}</td>
                <td className="p-3">{counts[warehouse._id]?.devices ?? 0}</td>
                <td className="p-3">{counts[warehouse._id]?.parts ?? 0}</td>
                <td className="p-3">
                  <Link
                    className="text-primary underline"
                    href={`/kho/${warehouse._id}`}
                  >
                    Xem chi tiết
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
