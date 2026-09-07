"use client";

import { useState, useEffect } from "react";
import { Bell, Circle, LogOut, Menu, UserCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";

type ApiStatus = "loading" | "connected" | "error";

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("loading");
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/dang-nhap");
  }

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${apiUrl}/api/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          setApiStatus("connected");
        } else {
          setApiStatus("error");
        }
      } catch {
        setApiStatus("error");
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-md p-2 hover:bg-muted md:hidden"
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold sm:text-lg">
            Hệ thống quản lý thiết bị
          </h1>
          <p className="text-xs text-muted-foreground">
            Phòng IT · Kho · Các bộ phận sử dụng
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={cn(
            "hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium sm:flex",
            apiStatus === "connected" &&
              "border-green-200 bg-green-50 text-green-700",
            apiStatus === "error" && "border-red-200 bg-red-50 text-red-700",
            apiStatus === "loading" &&
              "border-gray-200 bg-gray-50 text-gray-600",
          )}
        >
          <Circle
            className={cn(
              "h-2 w-2 fill-current",
              apiStatus === "connected" && "text-green-500",
              apiStatus === "error" && "text-red-500",
              apiStatus === "loading" && "animate-pulse text-gray-400",
            )}
          />
          {apiStatus === "connected" && "API kết nối"}
          {apiStatus === "error" && "API mất kết nối"}
          {apiStatus === "loading" && "Đang kiểm tra API..."}
        </div>

        <button
          type="button"
          className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Thông báo"
        >
          <Bell className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((value) => !value)}
            className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
            aria-label="Menu tài khoản"
            aria-expanded={accountOpen}
          >
            <UserCircle className="h-5 w-5" />
            <span className="hidden max-w-32 truncate text-sm md:inline">
              {user?.displayName}
            </span>
          </button>
          {accountOpen && (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-md border bg-card p-2 shadow-lg">
              <p className="truncate px-2 py-1 text-sm font-medium">
                {user?.displayName}
              </p>
              <p className="truncate px-2 pb-2 text-xs text-muted-foreground">
                {user?.email}
              </p>
              <Link
                href="/tai-khoan"
                onClick={() => setAccountOpen(false)}
                className="block rounded px-2 py-2 text-sm hover:bg-muted"
              >
                Thông tin tài khoản
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
