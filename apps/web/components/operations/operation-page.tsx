"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Printer } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { loadCatalogOptions, type CatalogOption } from "@/lib/catalogs";

type Kind = "ISSUE" | "LOAN" | "TRANSFER" | "RECOVERY";
type Row = {
  _id: string;
  code: string;
  type: Kind;
  status: string;
  operationDate: string;
  dueDate?: string;
  reason: string;
  sourceWarehouseId?: { name: string };
  destinationWarehouseId?: { name: string };
  receiverKeeperId?: { displayName: string };
  lines: {
    kind: string;
    quantity: number;
    deviceId?: { assetCode: string; serial?: string };
    partId?: { code: string; name: string };
  }[];
};
type Device = { _id: string; assetCode: string; serial?: string };
type Part = { _id: string; code: string; name: string };
const LABEL: Record<Kind, string> = {
  ISSUE: "Cấp phát",
  LOAN: "Mượn/trả",
  TRANSFER: "Điều chuyển",
  RECOVERY: "Thu hồi",
};
const STATUS: Record<string, string> = {
  DRAFT: "Nháp",
  IN_TRANSIT: "Đang vận chuyển",
  PARTIAL: "Trả một phần",
  COMPLETED: "Hoàn tất",
  REJECTED: "Từ chối",
};

export function OperationPage({ type }: { type: Kind }) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [keepers, setKeepers] = useState<CatalogOption[]>([]);
  const [departments, setDepartments] = useState<CatalogOption[]>([]);
  const [show, setShow] = useState(false);
  const [kind, setKind] = useState<"DEVICE" | "PART">("DEVICE");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canManage = hasPermission("operations.manage");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiFetch<{ data: Row[] }>(
        `/api/operations?type=${type}&limit=100`,
      );
      setRows(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [type]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void Promise.all([
      apiFetch<{ data: Device[] }>(
        "/api/devices?usageStatus=IN_STOCK&limit=100",
      ),
      apiFetch<{ data: Part[] }>("/api/parts?limit=100"),
      loadCatalogOptions("warehouses"),
      loadCatalogOptions("keepers"),
      loadCatalogOptions("departments"),
    ])
      .then(
        ([
          deviceResult,
          partResult,
          warehouseResult,
          keeperResult,
          departmentResult,
        ]) => {
          setDevices(deviceResult.data);
          setParts(partResult.data);
          setWarehouses(warehouseResult);
          setKeepers(keeperResult);
          setDepartments(departmentResult);
        },
      )
      .catch(() => undefined);
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) =>
      String(form.get(name) ?? "").trim() || undefined;
    const selectedId = get("itemId");
    setError("");
    try {
      await apiFetch("/api/operations", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          code: get("code"),
          type,
          operationDate: get("operationDate"),
          sourceWarehouseId: get("sourceWarehouseId"),
          destinationWarehouseId: get("destinationWarehouseId"),
          receiverKeeperId: get("receiverKeeperId"),
          receiverDepartmentId: get("receiverDepartmentId"),
          senderKeeperId:
            type === "RECOVERY" ? get("senderKeeperId") : undefined,
          dueDate: type === "LOAN" ? get("dueDate") : undefined,
          reason: get("reason"),
          lines: [
            {
              kind,
              deviceId: kind === "DEVICE" ? selectedId : undefined,
              partId: kind === "PART" ? selectedId : undefined,
              quantity: kind === "PART" ? Number(get("quantity") ?? 0) : 1,
              handoverCondition: get("condition") ?? "GOOD",
            },
          ],
        }),
      });
      setShow(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo phiếu.");
    }
  }
  async function action(row: Row, action: "complete" | "receive" | "reject") {
    try {
      const body =
        action === "reject"
          ? { reason: window.prompt("Lý do từ chối nhận:") }
          : undefined;
      if (action === "reject" && !body?.reason) return;
      await apiFetch(`/api/operations/${row._id}/${action}`, {
        method: "PATCH",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật chứng từ.");
    }
  }
  function print(row: Row) {
    const list = row.lines
      .map(
        (line) =>
          `<li>${line.deviceId?.assetCode ?? line.partId?.name ?? ""} — ${line.quantity}</li>`,
      )
      .join("");
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.write(
      `<title>Biên bản ${row.code}</title><main><h1>BIÊN BẢN ${LABEL[row.type].toUpperCase()}</h1><p>Mã phiếu: ${row.code}</p><p>Ngày: ${new Date(row.operationDate).toLocaleDateString("vi-VN")}</p><p>Bên nhận: ${row.receiverKeeperId?.displayName ?? ""}</p><p>Lý do: ${row.reason}</p><h3>Danh sách bàn giao</h3><ul>${list}</ul><p>Người giao: __________________ &nbsp;&nbsp; Người nhận: __________________</p></main><script>print()</script>`,
    );
    popup.document.close();
  }
  const sourceRequired = type !== "RECOVERY";
  const destinationRequired =
    type === "TRANSFER" || type === "RECOVERY" || type === "LOAN";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{LABEL[type]}</h2>
          <p className="text-sm text-muted-foreground">
            Tạo phiếu, giao nhận và lưu biên bản bàn giao.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShow((value) => !value)}>
            <Plus /> Tạo phiếu
          </Button>
        )}
      </div>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {show && (
        <form
          onSubmit={create}
          className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2"
        >
          <Input
            name="code"
            label="Mã phiếu *"
            required
            placeholder={`${type}-YYYYMMDD-001`}
          />
          <Input
            name="operationDate"
            label="Ngày *"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          {sourceRequired && (
            <Select
              name="sourceWarehouseId"
              label="Kho xuất *"
              required
              options={warehouses}
              placeholder="Chọn kho"
            />
          )}
          {destinationRequired && (
            <Select
              name="destinationWarehouseId"
              label="Kho nhận *"
              required={destinationRequired}
              options={warehouses}
              placeholder="Chọn kho"
            />
          )}
          {(type === "ISSUE" || type === "LOAN") && (
            <Select
              name="receiverKeeperId"
              label="Người nhận *"
              required
              options={keepers}
              placeholder="Chọn người nhận"
            />
          )}
          {type === "RECOVERY" && (
            <Select
              name="senderKeeperId"
              label="Người bàn giao"
              options={keepers}
              placeholder="Chọn người đang giữ"
            />
          )}
          {(type === "ISSUE" || type === "LOAN") && (
            <Select
              name="receiverDepartmentId"
              label="Bộ phận nhận"
              options={departments}
              placeholder="Chọn bộ phận"
            />
          )}
          {type === "LOAN" && (
            <Input name="dueDate" label="Hạn trả *" type="date" required />
          )}
          <Select
            label="Loại dòng"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as "DEVICE" | "PART")
            }
            options={[
              { value: "DEVICE", label: "Thiết bị" },
              { value: "PART", label: "Linh kiện / vật tư" },
            ]}
          />
          {kind === "DEVICE" ? (
            <Select
              name="itemId"
              label="Thiết bị *"
              required
              options={devices.map((item) => ({
                value: item._id,
                label: `${item.assetCode}${item.serial ? ` · ${item.serial}` : ""}`,
              }))}
              placeholder="Chọn thiết bị"
            />
          ) : (
            <>
              <Select
                name="itemId"
                label="Linh kiện *"
                required
                options={parts.map((item) => ({
                  value: item._id,
                  label: `${item.code} · ${item.name}`,
                }))}
                placeholder="Chọn linh kiện"
              />
              <Input
                name="quantity"
                label="Số lượng *"
                type="number"
                min="1"
                defaultValue="1"
                required
              />
            </>
          )}
          <Select
            name="condition"
            label="Tình trạng khi giao/nhận"
            options={[
              { value: "GOOD", label: "Tốt" },
              { value: "DEGRADED", label: "Giảm chất lượng" },
              { value: "BROKEN", label: "Hỏng" },
            ]}
          />
          <Textarea
            name="reason"
            label="Lý do *"
            required
            className="md:col-span-2"
          />
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit">Lưu nháp</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShow(false)}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Mã phiếu</th>
              <th className="p-3">Ngày</th>
              <th className="p-3">Giao / nhận</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-6" colSpan={5}>
                  <Loader2 className="animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-6 text-muted-foreground" colSpan={5}>
                  Chưa có chứng từ.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr className="border-t" key={row._id}>
                  <td className="p-3 font-medium">{row.code}</td>
                  <td className="p-3">
                    {new Date(row.operationDate).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="p-3">
                    {row.receiverKeeperId?.displayName ??
                      row.destinationWarehouseId?.name ??
                      ""}
                  </td>
                  <td className="p-3">{STATUS[row.status] ?? row.status}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => print(row)}
                      >
                        <Printer /> In
                      </Button>
                      {canManage && row.status === "DRAFT" && (
                        <Button
                          size="sm"
                          onClick={() => action(row, "complete")}
                        >
                          {type === "TRANSFER" ? "Xuất kho" : "Hoàn tất"}
                        </Button>
                      )}
                      {canManage && row.status === "IN_TRANSIT" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => action(row, "receive")}
                          >
                            Xác nhận nhận
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => action(row, "reject")}
                          >
                            Từ chối
                          </Button>
                        </>
                      )}
                      {canManage &&
                        type === "LOAN" &&
                        (row.status === "COMPLETED" ||
                          row.status === "PARTIAL") && (
                          <Button
                            size="sm"
                            onClick={() => action(row, "receive")}
                          >
                            Nhận trả
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
