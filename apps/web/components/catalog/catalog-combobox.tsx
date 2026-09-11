"use client";

import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { CatalogOption } from "@/lib/catalogs";

type CatalogType =
  | "departments"
  | "warehouses"
  | "locations"
  | "keepers"
  | "suppliers"
  | "device-types"
  | "component-types"
  | "units"
  | "item-models"
  | "device-models"
  | "component-models";

const LABELS: Record<CatalogType, string> = {
  departments: "bộ phận",
  warehouses: "kho",
  locations: "vị trí",
  keepers: "người giữ",
  suppliers: "nhà cung cấp",
  "device-types": "loại thiết bị",
  "component-types": "loại linh kiện",
  units: "đơn vị tính",
  "item-models": "mã hàng / model",
  "device-models": "model thiết bị",
  "component-models": "model linh kiện",
};

export function CatalogCombobox({
  name,
  label,
  type,
  options,
  value,
  onValueChange,
  placeholder = "Tìm hoặc chọn...",
  required,
  disabled,
  canCreate,
  onCreated,
  context = {},
}: {
  name: string;
  label: string;
  type: CatalogType;
  options: CatalogOption[];
  value: string;
  onValueChange(value: string): void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  canCreate: boolean;
  onCreated(option: CatalogOption): void;
  context?: {
    deviceTypeId?: string;
    componentTypeId?: string;
    warehouseId?: string;
    departmentId?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    phone: "",
    manufacturer: "",
  });
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return normalized
      ? options.filter((option) =>
          option.label.toLocaleLowerCase("vi").includes(normalized),
        )
      : options;
  }, [options, query]);

  async function create() {
    setError("");
    const text = (field: keyof typeof draft) =>
      draft[field].trim() || undefined;
    const body: Record<string, string | undefined> = {
      name: text("name"),
      description: text("description"),
    };
    if (["item-models", "device-models", "component-models"].includes(type))
      body.manufacturer = text("manufacturer");
    if (["item-models", "device-models"].includes(type))
      body.deviceTypeId = context.deviceTypeId;
    if (type === "component-models")
      body.componentTypeId = context.componentTypeId;
    if (type === "locations") body.warehouseId = context.warehouseId;
    if (type === "warehouses") body.departmentId = context.departmentId;
    if (type === "keepers") body.departmentId = context.departmentId;
    if (type === "suppliers") body.phone = text("phone");
    try {
      setCreating(true);
      const result = await apiFetch<{ data: Record<string, unknown> }>(
        `/api/catalog/${type}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const item = result.data;
      const option: CatalogOption = {
        value: String(item._id),
        label:
          String(item.displayName ?? item.name ?? "") +
          (item.code ? ` (${String(item.code)})` : ""),
        deviceTypeId: ["item-models", "device-models"].includes(type)
          ? context.deviceTypeId
          : undefined,
        componentTypeId:
          type === "component-models" ? context.componentTypeId : undefined,
        warehouseId: type === "locations" ? context.warehouseId : undefined,
      };
      onCreated(option);
      onValueChange(option.value);
      setDraft({
        name: "",
        description: "",
        phone: "",
        manufacturer: "",
      });
      setQuery("");
      setShowCreate(false);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể thêm danh mục.",
      );
    } finally {
      setCreating(false);
    }
  }

  const needsParent =
    (["item-models", "device-models"].includes(type) &&
      !context.deviceTypeId) ||
    (type === "locations" && !context.warehouseId);
  return (
    <div className="relative text-sm font-medium">
      <label className="block">{label}</label>
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="mt-1 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-normal shadow-sm disabled:opacity-50"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-2 shadow-lg">
          <div className="flex items-center gap-2 rounded-md border px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Tìm ${LABELS[type]}...`}
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onValueChange("");
                setOpen(false);
              }}
              className="flex w-full items-center px-2 py-2 text-left hover:bg-accent"
            >
              Không chọn
            </button>
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded px-2 py-2 text-left hover:bg-accent"
              >
                {option.label}
                {option.value === value && <Check className="h-4 w-4" />}
              </button>
            ))}
            {!filtered.length && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Không có kết quả.
              </p>
            )}
          </div>
          {canCreate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => {
                setShowCreate(true);
                setOpen(false);
              }}
            >
              <Plus /> Thêm {LABELS[type]} mới
            </Button>
          )}
        </div>
      )}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Thêm {LABELS[type]} mới</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowCreate(false)}
              >
                <X />
              </Button>
            </div>
            {needsParent && (
              <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
                Hãy chọn {type === "locations" ? "kho" : "loại thiết bị"} trước
                khi thêm.
              </p>
            )}
            <div className="space-y-3">
              <label className="block">
                Tên *
                <input
                  name="name"
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              {type === "suppliers" && (
                <label className="block">
                  Điện thoại
                  <input
                    name="phone"
                    value={draft.phone}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </label>
              )}
              {["item-models", "device-models", "component-models"].includes(
                type,
              ) && (
                <label className="block">
                  Hãng sản xuất
                  <input
                    name="manufacturer"
                    value={draft.manufacturer}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        manufacturer: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </label>
              )}
              <label className="block">
                Mô tả
                <textarea
                  name="description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-1 min-h-20 w-full rounded border px-3 py-2"
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={() => void create()}
                disabled={creating || needsParent || !draft.name.trim()}
              >
                {creating && <Loader2 className="animate-spin" />}Thêm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
