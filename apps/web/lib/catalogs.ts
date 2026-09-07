import { apiFetch } from "./api";

export type CatalogOption = {
  value: string;
  label: string;
  deviceTypeId?: string;
  warehouseId?: string;
};

type CatalogListResult = {
  data: Array<Record<string, unknown>>;
  meta: { page: number; limit: number; total: number; totalPages: number };
};

/** Tải danh sách options cho select (chỉ danh mục đang hoạt động). */
export async function loadCatalogOptions(
  type: string,
  filters: { deviceTypeId?: string; warehouseId?: string } = {},
): Promise<CatalogOption[]> {
  const params = new URLSearchParams({ isActive: "true", limit: "100" });
  if (filters.deviceTypeId) params.set("deviceTypeId", filters.deviceTypeId);
  const result = await apiFetch<CatalogListResult>(
    `/api/catalog/${type}?${params}`,
  );
  return result.data.map((item) => ({
    value: String(item._id),
    label:
      String(item.displayName ?? item.name ?? "") +
      (item.code ? ` (${String(item.code)})` : ""),
    deviceTypeId:
      item.deviceTypeId && typeof item.deviceTypeId === "object"
        ? String((item.deviceTypeId as { _id?: unknown })._id ?? "")
        : item.deviceTypeId
          ? String(item.deviceTypeId)
          : undefined,
    warehouseId:
      item.warehouseId && typeof item.warehouseId === "object"
        ? String((item.warehouseId as { _id?: unknown })._id ?? "")
        : item.warehouseId
          ? String(item.warehouseId)
          : undefined,
  }));
}

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  GOOD: "Tốt",
  DEGRADED: "Suy giảm",
  BROKEN: "Hỏng",
};

export const USAGE_STATUS_LABELS: Record<string, string> = {
  NOT_RECEIVED: "Chưa nhập kho",
  IN_STOCK: "Trong kho",
  IN_USE: "Đang sử dụng",
  REPAIRING: "Đang sửa chữa",
  LENT: "Đang cho mượn",
  DISPOSED: "Đã thanh lý",
};

export const PART_TRACKING_LABELS: Record<string, string> = {
  QUANTITY: "Theo số lượng",
  SERIAL: "Theo serial (từng chiếc)",
};

export const PART_SERIAL_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "Trong kho",
  RESERVED: "Đã đặt trước",
  ISSUED: "Đã cấp phát",
  REPAIRING: "Đang sửa chữa",
  BROKEN: "Hỏng",
  DISPOSED: "Đã thanh lý",
};

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN");
}

export function formatMoney(value?: number | null): string {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}
