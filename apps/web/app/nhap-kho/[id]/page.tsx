"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Ref = { name?: string; code?: string } | null;
type ReceiptLine = {
  type: string;
  quantity: number;
  note?: string;
  device?: { assetCode: string; serial?: string };
  part?: { partId?: Ref; serials?: string[] };
};
type Receipt = {
  _id: string;
  code: string;
  receiptDate: string;
  source: string;
  status: string;
  requiresApproval: boolean;
  warehouseId?: Ref;
  openingSource?: string;
  openingReason?: string;
  lines: ReceiptLine[];
  createdBy?: { displayName?: string };
};
const statusLabel: Record<string, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  COMPLETED: "Hoàn tất",
  REVERSED: "Đã đảo",
  CANCELLED: "Đã hủy",
};

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("receipts.manage");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    apiFetch<{ data: Receipt }>(`/api/inbound-receipts/${id}`)
      .then((result) => setReceipt(result.data))
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Không thể tải phiếu.",
        ),
      );
  }, [id]);
  useEffect(() => load(), [load]);
  async function action(path: "submit" | "approve" | "complete" | "reverse") {
    if (path === "reverse") {
      const ok = window.confirm(
        "Bạn có chắc muốn đảo phiếu này?\n\nTồn kho sẽ bị giảm lại đúng số đã nhập và thiết bị sẽ quay về trạng thái Chưa nhập kho.",
      );
      if (!ok) return;
    }
    setError("");
    try {
      setBusy(true);
      await apiFetch(`/api/inbound-receipts/${id}/${path}`, {
        method: "PATCH",
      });
      load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Thao tác không thành công.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!receipt)
    return (
      <div className="flex gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" />
        Đang tải phiếu...
      </div>
    );
  const mayComplete = receipt.requiresApproval
    ? receipt.status === "APPROVED"
    : receipt.status === "DRAFT" || receipt.status === "SUBMITTED";
  return (
    <div className="space-y-6">
      <Link
        href="/nhap-kho"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách phiếu nhập
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{receipt.code}</h2>
          <p className="text-sm text-muted-foreground">
            {statusLabel[receipt.status] ?? receipt.status} ·{" "}
            {new Date(receipt.receiptDate).toLocaleDateString("vi-VN")}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {receipt.status === "DRAFT" && (
              <Button disabled={busy} onClick={() => void action("submit")}>
                Gửi duyệt
              </Button>
            )}
            {receipt.status === "SUBMITTED" && receipt.requiresApproval && (
              <Button disabled={busy} onClick={() => void action("approve")}>
                Duyệt
              </Button>
            )}
            {mayComplete && (
              <Button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Hoàn tất phiếu? Tồn kho sẽ tăng và không thể sửa trực tiếp.",
                    )
                  )
                    void action("complete");
                }}
              >
                {busy && <Loader2 className="animate-spin" />}Hoàn tất nhập kho
              </Button>
            )}
            {receipt.status === "COMPLETED" && (
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => void action("reverse")}
              >
                {busy && <Loader2 className="animate-spin" />}Đảo phiếu
              </Button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <dl className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Kho</dt>
          <dd className="font-medium">{receipt.warehouseId?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nguồn</dt>
          <dd className="font-medium">
            {receipt.source === "OPENING"
              ? "Số dư đầu kỳ"
              : receipt.source === "PURCHASE"
                ? "Mua sắm"
                : "Khác"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Người tạo</dt>
          <dd className="font-medium">
            {receipt.createdBy?.displayName ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duyệt</dt>
          <dd className="font-medium">
            {receipt.requiresApproval ? "Có yêu cầu" : "Không yêu cầu"}
          </dd>
        </div>
        {receipt.source === "OPENING" && (
          <>
            <div>
              <dt className="text-muted-foreground">Nguồn dữ liệu</dt>
              <dd className="font-medium">{receipt.openingSource ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Lý do</dt>
              <dd className="font-medium">{receipt.openingReason ?? "—"}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-3">Loại</th>
              <th className="p-3">Hàng hóa / mã tài sản</th>
              <th className="p-3">Serial</th>
              <th className="p-3">Số lượng</th>
              <th className="p-3">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="p-3">
                  {line.type === "DEVICE" ? "Thiết bị" : "Linh kiện"}
                </td>
                <td className="p-3 font-medium">
                  {line.type === "DEVICE"
                    ? line.device?.assetCode
                    : `${line.part?.partId?.code ?? ""} ${line.part?.partId?.name ?? ""}`}
                </td>
                <td className="p-3">
                  {line.type === "DEVICE"
                    ? (line.device?.serial ?? "—")
                    : line.part?.serials?.join(", ") || "—"}
                </td>
                <td className="p-3">{line.quantity}</td>
                <td className="p-3">{line.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {receipt.status === "COMPLETED" && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-700">
          Phiếu đã hoàn tất. Thiết bị, serial, giao dịch kho và số dư đã được
          ghi nhận; không thể sửa hoặc xóa trực tiếp.
        </p>
      )}
    </div>
  );
}
