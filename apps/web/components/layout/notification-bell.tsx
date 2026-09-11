"use client";

import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Notification = {
  _id: string;
  title: string;
  message: string;
  severity: string;
  route?: string;
  isRead: boolean;
  createdAt: string;
};
const relativeTime = (value: string) => {
  const diff = Date.now() - new Date(value).getTime();
  const minute = Math.floor(diff / 60000);
  if (minute < 1) return "Vừa xong";
  if (minute < 60) return `${minute} phút trước`;
  const hour = Math.floor(minute / 60);
  if (hour < 24) return `${hour} giờ trước`;
  if (hour < 48) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const refreshCount = async () => {
    try {
      setCount(
        (
          await apiFetch<{ unreadCount: number }>(
            "/api/notifications/unread-count",
          )
        ).unreadCount,
      );
    } catch {
      /* API status remains usable when notifications are unavailable */
    }
  };
  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ data: Notification[] }>(
        "/api/notifications?limit=8",
      );
      setItems(result.data);
      await refreshCount();
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), 60000);
    const focus = () => void refreshCount();
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", focus);
    };
  }, []);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };
  const read = async (item: Notification) => {
    if (!item.isRead) {
      await apiFetch(`/api/notifications/${item._id}/read`, {
        method: "PATCH",
      });
      setItems((current) =>
        current.map((entry) =>
          entry._id === item._id ? { ...entry, isRead: true } : entry,
        ),
      );
      setCount((current) => Math.max(0, current - 1));
    }
    setOpen(false);
    if (item.route) router.push(item.route);
  };
  const readAll = async () => {
    await apiFetch("/api/notifications/read-all", { method: "PATCH" });
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setCount(0);
  };
  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Thông báo"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Thông báo</h2>
            <button
              onClick={() => void readAll()}
              disabled={count === 0}
              className="flex items-center gap-1 text-xs text-secondary disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              Đánh dấu đã đọc
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Bạn chưa có thông báo nào.
              </p>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  key={item._id}
                  onClick={() => void read(item)}
                  className={`block w-full border-b p-4 text-left hover:bg-muted/70 ${!item.isRead ? "bg-secondary/5" : ""}`}
                >
                  <div className="flex gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : item.severity === "CRITICAL" ? "bg-red-600" : "bg-secondary"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.message}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {relativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <Link
            onClick={() => setOpen(false)}
            href="/thong-bao"
            className="block p-3 text-center text-sm font-medium text-secondary hover:bg-muted"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}
