"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import {
  DEVICE_TYPE_LABELS,
  USAGE_STATUS_LABELS,
  formatDate,
  formatMoney,
  loadCatalogOptions,
  type CatalogOption,
} from "@/lib/catalogs";

type Ref = { _id: string; name?: string; displayName?: string } | null;

type DeviceDetail = {
  _id: string;
  assetCode: string;
  serial?: string;
  modelId: Ref;
  deviceTypeId: Ref;
  supplierId: Ref;
  purchasedAt?: string;
  purchasePrice?: number;
  warrantyUntil?: string;
  techCondition: string;
  usageStatus: string;
  warehouseId: Ref;
  locationId: Ref;
  departmentId: Ref;
  keeperId: Ref;
  attachments: { name: string; url?: string; note?: string }[];
  notes?: string;
};

type Attachment = { name: string; url?: string; note?: string };

type RepairHistory = {
  _id: string;
  code: string;
  repairDate: string;
  issueDescription: string;
  vendor?: string;
  repairType: string;
  totalCost: number;
  result?: string;
  status: string;
};
type LiquidationHistory = {
  _id: string;
  code: string;
  liquidationDate?: string;
  method: string;
  totalValue: number;
  completedBy?: Ref;
  lines: Array<{ deviceId?: Ref; liquidationValue: number }>;
};
const LIQUIDATION_METHOD_LABELS: Record<string, string> = {
  SALE: "Bán",
  DESTROY: "Tiêu hủy",
  DONATE: "Cho/tặng",
  TRANSFER: "Chuyển nhượng",
  OTHER: "Khác",
};

const REPAIR_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  RECEIVED: "Đã tiếp nhận",
  REPAIRING: "Đang sửa chữa",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  UNREPAIRABLE: "Không thể sửa",
};

const REPAIR_TYPE_LABELS: Record<string, string> = {
  INTERNAL: "Nội bộ",
  WARRANTY: "Bảo hành",
  EXTERNAL: "Đơn vị bên ngoài",
};

export default function DeviceDetailPage() {
  const { hasPermission } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [repairHistory, setRepairHistory] = useState<RepairHistory[]>([]);
  const [liquidationHistory, setLiquidationHistory] = useState<
    LiquidationHistory[]
  >([]);
  const [opts, setOpts] = useState<Record<string, CatalogOption[]>>({});
  const canManage = hasPermission("devices.manage");

  const load = useCallback(() => {
    setState("loading");
    apiFetch<{ data: DeviceDetail }>(`/api/devices/${id}`)
      .then((result) => {
        setDevice(result.data);
        setAttachments(result.data.attachments ?? []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    if (!hasPermission("repair.view")) return;
    apiFetch<{ data: RepairHistory[] }>(`/api/repairs/device/${id}/history`)
      .then((result) => setRepairHistory(result.data))
      .catch(() => setRepairHistory([]));
  }, [hasPermission, id]);
  useEffect(() => {
    if (!hasPermission("liquidation.view")) return;
    apiFetch<{ data: LiquidationHistory[] }>(
      `/api/liquidations/device/${id}/history`,
    )
      .then((result) => setLiquidationHistory(result.data))
      .catch(() => setLiquidationHistory([]));
  }, [hasPermission, id]);
  useEffect(() => {
    Promise.all([
      loadCatalogOptions("device-models"),
      loadCatalogOptions("device-types"),
      loadCatalogOptions("suppliers"),
    ])
      .then(([models, deviceTypes, suppliers]) =>
        setOpts({ models, deviceTypes, suppliers }),
      )
      .catch(() => undefined);
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaved(false);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const raw = form.get(name);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    try {
      await apiFetch(`/api/devices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          serial: value("serial"),
          modelId: value("modelId"),
          deviceTypeId: value("deviceTypeId"),
          supplierId: value("supplierId"),
          purchasedAt: value("purchasedAt"),
          purchasePrice: value("purchasePrice")
            ? Number(value("purchasePrice"))
            : undefined,
          warrantyUntil: value("warrantyUntil"),
          techCondition: form.get("techCondition"),
          notes: value("notes"),
        }),
      });
      setSaved(true);
      load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể lưu.");
    }
  }

  async function saveAttachments() {
    setFormError("");
    setSaved(false);
    try {
      await apiFetch(`/api/devices/${id}/attachments`, {
        method: "PATCH",
        body: JSON.stringify({
          attachments: attachments.filter((item) => item.name.trim()),
        }),
      });
      setSaved(true);
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể lưu tệp đính kèm.",
      );
    }
  }
  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải hồ sơ...
      </div>
    );
  }
  if (state === "error" || !device) {
    return (
      <p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        Không thể tải hồ sơ thiết bị.{" "}
        <Link href="/thiet-bi" className="underline">
          Về danh sách
        </Link>
      </p>
    );
  }

  const info: [string, string][] = [
    ["Mã tài sản", device.assetCode],
    ["Serial", device.serial ?? "—"],
    ["Ngày mua", formatDate(device.purchasedAt)],
    ["Giá mua", formatMoney(device.purchasePrice)],
    ["Bảo hành đến", formatDate(device.warrantyUntil)],
    [
      "Tình trạng kỹ thuật",
      DEVICE_TYPE_LABELS[device.techCondition] ?? device.techCondition,
    ],
    [
      "Trạng thái sử dụng",
      USAGE_STATUS_LABELS[device.usageStatus] ?? device.usageStatus,
    ],
    ["Bộ phận", device.departmentId?.name ?? "—"],
    ["Kho", device.warehouseId?.name ?? "—"],
    ["Vị trí", device.locationId?.name ?? "—"],
    ["Người giữ", device.keeperId?.displayName ?? "—"],
    ["Nhà cung cấp", device.supplierId?.name ?? "—"],
    ["Ghi chú", device.notes ?? "—"],
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/thiet-bi"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Danh sách thiết bị
      </Link>

      <div>
        <h2 className="text-2xl font-bold">
          Hồ sơ thiết bị · {device.assetCode}
        </h2>
        <p className="text-sm text-muted-foreground">
          Model: {device.modelId?.name ?? "—"} · Loại:{" "}
          {device.deviceTypeId?.name ?? "—"}
        </p>
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
      {hasPermission("repair.view") && (
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3">
            <h3 className="text-base font-semibold">Lịch sử sửa chữa</h3>
            <p className="text-xs text-muted-foreground">
              Toàn bộ phiếu sửa chữa đã lập cho thiết bị này.
            </p>
          </div>
          {repairHistory.length === 0 ? (
            <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
              Thiết bị chưa có lịch sử sửa chữa.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-2">Ngày</th>
                    <th className="p-2">Mã phiếu</th>
                    <th className="p-2">Lỗi</th>
                    <th className="p-2">Đơn vị sửa</th>
                    <th className="p-2 text-right">Chi phí</th>
                    <th className="p-2">Kết quả</th>
                    <th className="p-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {repairHistory.map((repair) => (
                    <tr key={repair._id} className="border-b last:border-0">
                      <td className="p-2">{formatDate(repair.repairDate)}</td>
                      <td className="p-2 font-medium">
                        <Link
                          href={`/sua-chua?repairId=${repair._id}`}
                          className="text-primary hover:underline"
                        >
                          {repair.code}
                        </Link>
                      </td>
                      <td className="max-w-56 p-2">
                        <p className="line-clamp-2">
                          {repair.issueDescription}
                        </p>
                      </td>
                      <td className="p-2">
                        {repair.vendor ||
                          REPAIR_TYPE_LABELS[repair.repairType] ||
                          "—"}
                      </td>
                      <td className="p-2 text-right">
                        {formatMoney(repair.totalCost)}
                      </td>
                      <td className="max-w-52 p-2">
                        <p className="line-clamp-2">{repair.result ?? "—"}</p>
                      </td>
                      <td className="p-2">
                        {REPAIR_STATUS_LABELS[repair.status] ?? repair.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {hasPermission("liquidation.view") && (
        <section className="rounded-lg border bg-card p-4">
          <h3 className="text-base font-semibold">Lịch sử thanh lý</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Thông tin thanh lý vẫn được lưu sau khi tài sản rời vòng đời sử
            dụng.
          </p>
          {liquidationHistory.length === 0 ? (
            <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
              Thiết bị chưa được thanh lý.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-2">Ngày thanh lý</th>
                    <th className="p-2">Mã phiếu</th>
                    <th className="p-2">Hình thức</th>
                    <th className="p-2 text-right">Giá trị</th>
                    <th className="p-2">Người thực hiện</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidationHistory.map((item) => {
                    const line = item.lines.find(
                      (value) => value.deviceId?._id === id,
                    );
                    return (
                      <tr key={item._id} className="border-b last:border-0">
                        <td className="p-2">
                          {formatDate(item.liquidationDate)}
                        </td>
                        <td className="p-2">
                          <Link
                            href={`/thanh-ly?liquidationId=${item._id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {item.code}
                          </Link>
                        </td>
                        <td className="p-2">
                          {LIQUIDATION_METHOD_LABELS[item.method] ??
                            item.method}
                        </td>
                        <td className="p-2 text-right">
                          {formatMoney(
                            line?.liquidationValue ?? item.totalValue,
                          )}
                        </td>
                        <td className="p-2">
                          {item.completedBy?.displayName ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {canManage && (
        <>
          <form
            onSubmit={saveProfile}
            className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <h3 className="text-base font-semibold sm:col-span-2 lg:col-span-3">
              Sửa hồ sơ
            </h3>
            <Input
              name="serial"
              label="Serial"
              defaultValue={device.serial ?? ""}
              maxLength={120}
            />
            <Select
              name="modelId"
              label="Model thiết bị"
              placeholder="-- Không chọn --"
              options={opts.models ?? []}
              defaultValue={device.modelId?._id ?? ""}
            />
            <Select
              name="deviceTypeId"
              label="Loại thiết bị"
              placeholder="-- Không chọn --"
              options={opts.deviceTypes ?? []}
              defaultValue={device.deviceTypeId?._id ?? ""}
            />
            <Select
              name="supplierId"
              label="Nhà cung cấp"
              placeholder="-- Không chọn --"
              options={opts.suppliers ?? []}
              defaultValue={device.supplierId?._id ?? ""}
            />
            <Input
              name="purchasedAt"
              label="Ngày mua"
              type="date"
              defaultValue={
                device.purchasedAt ? device.purchasedAt.slice(0, 10) : ""
              }
            />
            <Input
              name="purchasePrice"
              label="Giá mua (đ)"
              type="number"
              min={0}
              defaultValue={device.purchasePrice ?? ""}
            />
            <Input
              name="warrantyUntil"
              label="Bảo hành đến"
              type="date"
              defaultValue={
                device.warrantyUntil ? device.warrantyUntil.slice(0, 10) : ""
              }
            />
            <Select
              name="techCondition"
              label="Tình trạng kỹ thuật"
              required
              defaultValue={device.techCondition}
              options={Object.entries(DEVICE_TYPE_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            <Textarea
              name="notes"
              label="Ghi chú"
              className="sm:col-span-2 lg:col-span-3"
              defaultValue={device.notes ?? ""}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Người giữ, bộ phận, kho/vị trí và trạng thái sử dụng không sửa
              trực tiếp ở đây — thay đổi qua nghiệp vụ cấp phát/thu hồi/điều
              chuyển.
            </p>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Lưu hồ sơ</Button>
            </div>
          </form>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-base font-semibold">Tệp đính kèm</h3>
            <div className="space-y-3">
              {attachments.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Input
                    label="Tên tệp"
                    value={item.name}
                    onChange={(e) => {
                      const next = [...attachments];
                      next[index] = { ...item, name: e.target.value };
                      setAttachments(next);
                    }}
                  />
                  <Input
                    label="Liên kết"
                    value={item.url ?? ""}
                    onChange={(e) => {
                      const next = [...attachments];
                      next[index] = { ...item, url: e.target.value };
                      setAttachments(next);
                    }}
                  />
                  <Input
                    label="Ghi chú"
                    value={item.note ?? ""}
                    onChange={(e) => {
                      const next = [...attachments];
                      next[index] = { ...item, note: e.target.value };
                      setAttachments(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-4"
                    onClick={() =>
                      setAttachments(attachments.filter((_, i) => i !== index))
                    }
                  >
                    Xóa
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAttachments([...attachments, { name: "" }])}
                >
                  Thêm dòng
                </Button>
                <Button type="button" onClick={saveAttachments}>
                  Lưu tệp đính kèm
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
