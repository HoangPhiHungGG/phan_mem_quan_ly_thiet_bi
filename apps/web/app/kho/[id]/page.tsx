"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Eye, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  DEVICE_TYPE_LABELS,
  USAGE_STATUS_LABELS,
  formatDate,
  formatMoney,
} from "@/lib/catalogs";

type Ref = { name?: string; displayName?: string } | null;
type Device = {
  _id: string;
  assetCode: string;
  serial?: string;
  usageStatus: string;
  techCondition: string;
  purchasedAt?: string;
  purchasePrice?: number;
  warrantyUntil?: string;
  notes?: string;
  deviceTypeId?: Ref;
  modelId?: Ref;
  supplierId?: Ref;
  warehouseId?: Ref;
  locationId?: Ref;
  departmentId?: Ref;
  keeperId?: Ref;
};
type PartBalance = {
  _id: string;
  quantity: number;
  partId?: {
    code?: string;
    name?: string;
    minQty?: number;
    isActive?: boolean;
    unitId?: { name?: string };
    deviceTypeId?: { name?: string };
  };
};
type Transaction = {
  _id: string;
  type: string;
  quantity: number;
  createdAt: string;
  partId?: { code?: string; name?: string };
  receiptId?: { code?: string } | null;
  createdBy?: { displayName?: string } | null;
  note?: string;
};
const refName = (ref?: Ref) => ref?.name ?? ref?.displayName ?? "—";

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [balances, setBalances] = useState<PartBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      apiFetch<{ data: Device[] }>(`/api/devices?warehouseId=${id}&limit=100`),
      apiFetch<{ data: PartBalance[] }>(`/api/inventory?warehouseId=${id}`),
      apiFetch<{ data: Transaction[] }>(
        `/api/inventory/transactions?warehouseId=${id}&limit=20`,
      ),
    ])
      .then(([deviceResult, balanceResult, transactionResult]) => {
        setDevices(deviceResult.data);
        setBalances(balanceResult.data);
        setTransactions(transactionResult.data);
      })
      .catch(() => setError("Không thể tải thiết bị trong kho."));
  }, [id]);
  async function viewDevice(deviceId: string) {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ data: Device }>(
        `/api/devices/${deviceId}`,
      );
      setSelected(result.data);
    } catch {
      setError("Không thể tải chi tiết thiết bị.");
    } finally {
      setLoading(false);
    }
  }
  const fields: [string, string][] = selected
    ? [
        ["Mã tài sản", selected.assetCode],
        ["Serial", selected.serial ?? "—"],
        ["Loại thiết bị", refName(selected.deviceTypeId)],
        ["Model", refName(selected.modelId)],
        ["Nhà cung cấp", refName(selected.supplierId)],
        ["Ngày mua", formatDate(selected.purchasedAt)],
        ["Giá mua", formatMoney(selected.purchasePrice)],
        ["Bảo hành đến", formatDate(selected.warrantyUntil)],
        [
          "Tình trạng kỹ thuật",
          DEVICE_TYPE_LABELS[selected.techCondition] ?? selected.techCondition,
        ],
        [
          "Trạng thái sử dụng",
          USAGE_STATUS_LABELS[selected.usageStatus] ?? selected.usageStatus,
        ],
        ["Kho", refName(selected.warehouseId)],
        ["Vị trí", refName(selected.locationId)],
        ["Bộ phận", refName(selected.departmentId)],
        ["Người giữ", refName(selected.keeperId)],
        ["Ghi chú", selected.notes ?? "—"],
      ]
    : [];
  return (
    <div className="space-y-6">
      <Link href="/kho" className="text-sm underline">
        ← Danh sách kho
      </Link>
      <div>
        <h2 className="text-2xl font-bold">Chi tiết kho</h2>
        <p className="text-sm text-muted-foreground">Thiết bị thuộc kho này</p>
      </div>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-3">Mã tài sản</th>
              <th className="p-3">Serial</th>
              <th className="p-3">Model</th>
              <th className="p-3">Kỹ thuật</th>
              <th className="p-3">Vị trí</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((item) => (
              <tr
                key={item._id}
                className="border-b last:border-0 hover:bg-accent/30"
              >
                <td className="p-3 font-medium">
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => void viewDevice(item._id)}
                  >
                    {item.assetCode}
                  </button>
                </td>
                <td className="p-3">{item.serial ?? "—"}</td>
                <td className="p-3">{refName(item.modelId)}</td>
                <td className="p-3">
                  {DEVICE_TYPE_LABELS[item.techCondition] ?? item.techCondition}
                </td>
                <td className="p-3">{refName(item.locationId)}</td>
                <td className="p-3">
                  {USAGE_STATUS_LABELS[item.usageStatus] ?? item.usageStatus}
                </td>
                <td className="p-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void viewDevice(item._id)}
                  >
                    <Eye /> Xem chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!devices.length && !error && (
        <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          Chưa có thiết bị trong kho.
        </p>
      )}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Tồn linh kiện theo kho</h3>
        {!balances.length ? (
          <p className="text-sm text-muted-foreground">
            Chưa có số dư linh kiện.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b">
                <tr>
                  <th className="p-2">Mã</th>
                  <th className="p-2">Linh kiện</th>
                  <th className="p-2">Loại</th>
                  <th className="p-2">Đơn vị</th>
                  <th className="p-2">Tồn</th>
                  <th className="p-2">Tồn tối thiểu</th>
                  <th className="p-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((item) => (
                  <tr key={item._id} className="border-b last:border-0">
                    <td className="p-2">{item.partId?.code ?? "—"}</td>
                    <td className="p-2">{item.partId?.name ?? "—"}</td>
                    <td className="p-2">
                      {item.partId?.deviceTypeId?.name ?? "—"}
                    </td>
                    <td className="p-2">{item.partId?.unitId?.name ?? "—"}</td>
                    <td className="p-2 font-medium">{item.quantity}</td>
                    <td className="p-2">{item.partId?.minQty ?? 0}</td>
                    <td className="p-2">
                      {item.quantity > 0 ? "Còn hàng" : "Hết hàng"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Lịch sử nhập / xuất</h3>
        {!transactions.length ? (
          <p className="text-sm text-muted-foreground">Chưa có giao dịch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b">
                <tr>
                  <th className="p-2">Ngày</th>
                  <th className="p-2">Mã phiếu</th>
                  <th className="p-2">Loại giao dịch</th>
                  <th className="p-2">Linh kiện</th>
                  <th className="p-2">SL vào</th>
                  <th className="p-2">SL ra</th>
                  <th className="p-2">Người thực hiện</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item._id} className="border-b last:border-0">
                    <td className="p-2">
                      {new Date(item.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-2">{item.receiptId?.code ?? "—"}</td>
                    <td className="p-2">
                      {[
                        "OPENING",
                        "PURCHASE",
                        "RETURN",
                        "TRANSFER_IN",
                      ].includes(item.type)
                        ? "Nhập kho"
                        : "Xuất kho"}
                    </td>
                    <td className="p-2">
                      {item.partId?.code} — {item.partId?.name}
                    </td>
                    <td className="p-2">
                      {[
                        "OPENING",
                        "PURCHASE",
                        "RETURN",
                        "TRANSFER_IN",
                      ].includes(item.type)
                        ? item.quantity
                        : "—"}
                    </td>
                    <td className="p-2">
                      {[
                        "OPENING",
                        "PURCHASE",
                        "RETURN",
                        "TRANSFER_IN",
                      ].includes(item.type)
                        ? "—"
                        : item.quantity}
                    </td>
                    <td className="p-2">
                      {item.createdBy?.displayName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {loading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="rounded bg-card p-4">
            <Loader2 className="animate-spin" /> Đang tải...
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-card p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Chi tiết thiết bị</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelected(null)}
              >
                <X />
              </Button>
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={() => setSelected(null)}>
                Đóng
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
