"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch } from "@/lib/api";
import { loadCatalogOptions, type CatalogOption } from "@/lib/catalogs";
import { cn } from "@/lib/utils";

type FieldDef = {
  name: string;
  label: string;
  selectFrom?: string;
  required?: boolean;
  textarea?: boolean;
  type?: string;
};

type CatalogDef = {
  key: string;
  label: string;
  hasCode: boolean;
  fields: FieldDef[];
};

const CATALOGS: CatalogDef[] = [
  {
    key: "departments",
    label: "Bộ phận",
    hasCode: true,
    fields: [
      { name: "parentId", label: "Bộ phận cha", selectFrom: "departments" },
    ],
  },
  {
    key: "warehouses",
    label: "Kho",
    hasCode: true,
    fields: [
      { name: "departmentId", label: "Bộ phận", selectFrom: "departments" },
    ],
  },
  {
    key: "locations",
    label: "Vị trí",
    hasCode: true,
    fields: [
      {
        name: "warehouseId",
        label: "Kho",
        selectFrom: "warehouses",
        required: true,
      },
    ],
  },
  {
    key: "keepers",
    label: "Người giữ",
    hasCode: true,
    fields: [
      { name: "employeeCode", label: "Mã nhân viên (không bắt buộc)" },
      { name: "departmentId", label: "Bộ phận", selectFrom: "departments" },
      { name: "phone", label: "Điện thoại" },
      { name: "note", label: "Ghi chú", textarea: true },
    ],
  },
  {
    key: "suppliers",
    label: "Nhà cung cấp",
    hasCode: true,
    fields: [
      { name: "phone", label: "Điện thoại" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Địa chỉ", textarea: true },
    ],
  },
  { key: "device-types", label: "Loại thiết bị", hasCode: true, fields: [] },
  { key: "units", label: "Đơn vị tính", hasCode: true, fields: [] },
  {
    key: "item-models",
    label: "Mã hàng / model",
    hasCode: true,
    fields: [
      {
        name: "deviceTypeId",
        label: "Loại thiết bị",
        selectFrom: "device-types",
      },
      { name: "unitId", label: "Đơn vị tính", selectFrom: "units" },
    ],
  },
];

type Row = Record<string, unknown> & { _id: string; isActive: boolean };

type ListResult = {
  data: Row[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export default function CatalogPage() {
  const { hasPermission } = useAuth();
  const [type, setType] = useState("device-types");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<ListResult["meta"] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionError, setActionError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, CatalogOption[]>>({});

  const def = CATALOGS.find((item) => item.key === type) ?? CATALOGS[0];
  const canManage = hasPermission("catalog.manage");

  const loadOptions = useCallback(async () => {
    const need = new Set<string>();
    for (const field of def.fields)
      if (field.selectFrom) need.add(field.selectFrom);
    const entries = await Promise.all(
      [...need].map(async (key) => [
        key,
        await loadCatalogOptions(key).catch(() => []),
      ]),
    );
    setOptions(Object.fromEntries(entries));
  }, [def]);

  const load = useCallback(() => {
    if (!hasPermission("catalog.read")) {
      setState("error");
      return;
    }
    setState("loading");
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (q.trim()) params.set("q", q.trim());
    apiFetch<ListResult>(`/api/catalog/${type}?${params}`)
      .then((result) => {
        setRows(result.data);
        setMeta(result.meta);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [hasPermission, type, page, q]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    loadOptions();
  }, [loadOptions]);
  useEffect(() => {
    setPage(1);
    setShowCreate(false);
    setEditingId(null);
  }, [type]);
  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { name: form.get("name") };
    if (def.hasCode) body.code = form.get("code") || undefined;
    for (const field of def.fields)
      body[field.name] = form.get(field.name) || undefined;
    if (def.hasCode) body.code = form.get("code") || undefined;
    try {
      await apiFetch(`/api/catalog/${type}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShowCreate(false);
      load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể tạo.");
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setActionError("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { name: form.get("name") };
    if (def.hasCode) body.code = form.get("code") || undefined;
    for (const field of def.fields)
      if (field.name !== "code")
        body[field.name] = form.get(field.name) || undefined;
    try {
      await apiFetch(`/api/catalog/${type}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditingId(null);
      load();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Không thể cập nhật.",
      );
    }
  }

  async function toggleActive(row: Row) {
    setActionError("");
    try {
      await apiFetch(`/api/catalog/${type}/${row._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      load();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Không thể đổi trạng thái.",
      );
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`Xóa "${row.name ?? row.displayName}"?`)) return;
    setActionError("");
    try {
      await apiFetch(`/api/catalog/${type}/${row._id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Không thể xóa danh mục này.",
      );
    }
  }

  function refLabel(row: Row, field: FieldDef): string {
    if (!field.selectFrom) {
      const value = row[field.name];
      return value ? String(value) : "—";
    }
    const ref = row[field.name] as {
      name?: string;
      displayName?: string;
    } | null;
    return ref ? String(ref.name ?? ref.displayName ?? "—") : "—";
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Danh mục</h2>
        <p className="text-sm text-muted-foreground">
          Bộ phận, kho, vị trí, người giữ, nhà cung cấp, loại thiết bị, đơn vị
          tính và mã hàng/model
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATALOGS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setType(item.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              item.key === type
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          label="Tìm kiếm"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Theo mã hoặc tên..."
          className="max-w-xs"
        />
        {canManage && (
          <Button
            type="button"
            className="mt-4"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus /> Thêm {def.label.toLowerCase()}
          </Button>
        )}
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      {showCreate && canManage && (
        <form
          onSubmit={submitCreate}
          className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"
        >
          {def.hasCode && (
            <Input
              name="code"
              label={`Mã ${def.label.toLowerCase()}`}
              required
              maxLength={80}
            />
          )}
          <Input name="name" label="Tên" required maxLength={150} />
          {def.fields.map((field) =>
            field.selectFrom ? (
              <Select
                key={field.name}
                name={field.name}
                label={field.label}
                placeholder="-- Không chọn --"
                options={options[field.selectFrom] ?? []}
                required={field.required}
              />
            ) : field.textarea ? (
              <Textarea
                key={field.name}
                name={field.name}
                label={field.label}
              />
            ) : (
              <Input
                key={field.name}
                name={field.name}
                label={field.label}
                type={field.type ?? "text"}
              />
            ),
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Lưu</Button>
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
          Không có quyền hoặc không thể tải danh mục.
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu.
        </p>
      )}

      {state === "ready" && rows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  {def.hasCode && <th className="p-3">Mã</th>}
                  <th className="p-3">Tên</th>
                  {def.fields.map((field) => (
                    <th key={field.name} className="p-3">
                      {field.label}
                    </th>
                  ))}
                  <th className="p-3">Trạng thái</th>
                  {canManage && <th className="p-3">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editingId === row._id ? (
                    <tr
                      key={row._id}
                      className="border-b bg-accent/30 last:border-0"
                    >
                      <td
                        colSpan={2 + def.fields.length + (canManage ? 1 : 0)}
                        className="p-3"
                      >
                        <form
                          onSubmit={(event) => submitEdit(event, row._id)}
                          className="grid gap-3 sm:grid-cols-2"
                        >
                          <Input
                            name="name"
                            label="Tên"
                            defaultValue={String(
                              row.name ?? row.displayName ?? "",
                            )}
                            required
                          />
                          {def.hasCode && (
                            <Input
                              name="code"
                              label={`Mã ${def.label.toLowerCase()}`}
                              defaultValue={String(row.code ?? "")}
                              required
                              maxLength={80}
                            />
                          )}
                          {def.fields.map((field) =>
                            field.selectFrom ? (
                              <Select
                                key={field.name}
                                name={field.name}
                                label={field.label}
                                placeholder="-- Không chọn --"
                                options={options[field.selectFrom] ?? []}
                                defaultValue={
                                  (row[field.name] as { _id?: string } | null)
                                    ?._id ?? ""
                                }
                              />
                            ) : field.textarea ? (
                              <Textarea
                                key={field.name}
                                name={field.name}
                                label={field.label}
                                defaultValue={
                                  row[field.name] ? String(row[field.name]) : ""
                                }
                              />
                            ) : (
                              <Input
                                key={field.name}
                                name={field.name}
                                label={field.label}
                                defaultValue={
                                  row[field.name] ? String(row[field.name]) : ""
                                }
                              />
                            ),
                          )}
                          <div className="flex gap-2 sm:col-span-2">
                            <Button type="submit" size="sm">
                              Lưu
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              Hủy
                            </Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={row._id}
                      className={cn(
                        "border-b last:border-0",
                        !row.isActive && "opacity-50",
                      )}
                    >
                      {def.hasCode && (
                        <td className="p-3 font-medium">
                          {String(row.code ?? "—")}
                        </td>
                      )}
                      <td className="p-3">
                        {String(row.name ?? row.displayName ?? "—")}
                      </td>
                      {def.fields.map((field) => (
                        <td key={field.name} className="p-3">
                          {refLabel(row, field)}
                        </td>
                      ))}
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            row.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-700",
                          )}
                        >
                          {row.isActive ? "Đang dùng" : "Ngừng sử dụng"}
                        </span>
                      </td>
                      {canManage && (
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(row._id)}
                            >
                              Sửa
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => toggleActive(row)}
                            >
                              {row.isActive ? "Ngừng SD" : "Kích hoạt"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => remove(row)}
                            >
                              Xóa
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
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
