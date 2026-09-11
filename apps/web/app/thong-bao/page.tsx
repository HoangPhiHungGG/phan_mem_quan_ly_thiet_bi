"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
type Item = {
  _id: string;
  title: string;
  message: string;
  severity: string;
  route?: string;
  isRead: boolean;
  createdAt: string;
};
export default function NotificationsPage() {
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      setItems(
        (
          await apiFetch<{ data: Item[] }>(
            `/api/notifications?status=${status}&limit=50`,
          )
        ).data,
      );
    } catch {
      setError("Không thể tải thông báo.");
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  const readAll = async () => {
    await apiFetch("/api/notifications/read-all", { method: "PATCH" });
    void load();
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Thông báo</h1>
          <p className="text-sm text-muted-foreground">
            Các việc cần bạn chú ý từ hệ thống.
          </p>
        </div>
        <Button variant="outline" onClick={() => void readAll()}>
          <CheckCheck /> Đánh dấu tất cả đã đọc
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant={status === "all" ? "default" : "outline"}
          onClick={() => setStatus("all")}
        >
          Tất cả
        </Button>
        <Button
          variant={status === "unread" ? "default" : "outline"}
          onClick={() => setStatus("unread")}
        >
          Chưa đọc
        </Button>
        <Button
          variant={status === "read" ? "default" : "outline"}
          onClick={() => setStatus("read")}
        >
          Đã đọc
        </Button>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded border border-dashed p-10 text-center text-sm text-muted-foreground">
          Không có thông báo {status === "unread" ? "chưa đọc" : "nào"}.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {items.map((item) => (
            <Link
              href={item.route ?? "/thong-bao"}
              key={item._id}
              className={`block border-b p-4 last:border-0 hover:bg-muted ${item.isRead ? "" : "bg-secondary/5"}`}
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.message}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.createdAt))}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
