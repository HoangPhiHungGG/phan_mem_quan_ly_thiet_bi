"use client";

import { useEffect, useState } from "react";
import { Circle, Loader2, Server, Database } from "lucide-react";
import { apiFetch } from "@/lib/api";

type HealthState = {
  status: "loading" | "ok" | "error";
  api?: { status: string; uptime: number; timestamp: string };
  db?: { status: string };
  message?: string;
};

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [myAssets, setMyAssets] = useState<{
    devices: { assetCode: string; serial?: string; usageStatus: string }[];
    operations: {
      code: string;
      type: string;
      status: string;
      dueDate?: string;
    }[];
  } | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${apiUrl}/api/health/ready`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          setHealth({
            status: "ok",
            api: {
              status: data.status,
              uptime: data.uptime,
              timestamp: data.timestamp,
            },
            db: { status: data.database.status },
          });
        } else {
          setHealth({
            status: "error",
            message: `API trả về lỗi ${res.status}`,
          });
        }
      } catch {
        setHealth({
          status: "error",
          message: "Không thể kết nối tới API backend",
        });
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    apiFetch<{ data: NonNullable<typeof myAssets> }>("/api/operations/mine")
      .then((result) => setMyAssets(result.data))
      .catch(() => setMyAssets(null));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Tổng quan</h2>
        <p className="text-sm text-muted-foreground">
          Trạng thái hệ thống và kết nối
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* API status */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Server className="h-8 w-8 text-secondary" />
            <div>
              <h3 className="font-semibold">API Backend</h3>
              <p className="text-sm text-muted-foreground">NestJS · REST API</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {health.status === "loading" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">
                  Đang kiểm tra kết nối...
                </span>
              </>
            )}
            {health.status === "ok" && (
              <>
                <Circle className="h-3 w-3 fill-current text-green-500" />
                <span className="text-sm font-medium text-green-700">
                  Hoạt động
                </span>
                <span className="text-xs text-muted-foreground">
                  · uptime {Math.round(health.api?.uptime ?? 0)}s
                </span>
              </>
            )}
            {health.status === "error" && (
              <>
                <Circle className="h-3 w-3 fill-current text-red-500" />
                <span className="text-sm font-medium text-red-700">
                  Mất kết nối
                </span>
              </>
            )}
          </div>

          {health.status === "error" && health.message && (
            <p className="mt-2 text-xs text-red-600">{health.message}</p>
          )}
        </div>

        {/* Database status */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Database className="h-8 w-8 text-secondary" />
            <div>
              <h3 className="font-semibold">Cơ sở dữ liệu</h3>
              <p className="text-sm text-muted-foreground">
                MongoDB · Replica Set
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {health.status === "loading" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">
                  Đang kiểm tra kết nối...
                </span>
              </>
            )}
            {health.status === "ok" && health.db?.status === "connected" && (
              <>
                <Circle className="h-3 w-3 fill-current text-green-500" />
                <span className="text-sm font-medium text-green-700">
                  Đã kết nối
                </span>
              </>
            )}
            {health.status === "error" && (
              <>
                <Circle className="h-3 w-3 fill-current text-red-500" />
                <span className="text-sm font-medium text-red-700">
                  Không kết nối được
                </span>
              </>
            )}
          </div>

          {health.status === "error" && health.message && (
            <p className="mt-2 text-xs text-red-600">{health.message}</p>
          )}
        </div>
      </div>

      {myAssets && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold">Thiết bị đang giữ</h3>
            {myAssets.devices.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {myAssets.devices.map((device) => (
                  <li key={device.assetCode}>
                    {device.assetCode}
                    {device.serial ? ` · ${device.serial}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Chưa có thiết bị đang giữ.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold">Khoản mượn của tôi</h3>
            {myAssets.operations.filter((item) => item.type === "LOAN")
              .length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {myAssets.operations
                  .filter((item) => item.type === "LOAN")
                  .map((item) => (
                    <li key={item.code}>
                      {item.code} · {item.status}
                      {item.dueDate
                        ? ` · hạn ${new Date(item.dueDate).toLocaleDateString("vi-VN")}`
                        : ""}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Không có khoản mượn đang theo dõi.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6">
        <p className="text-sm text-muted-foreground">
          Các chỉ số KPI và biểu đồ sẽ được bổ sung khi có dữ liệu nghiệp vụ
          thực tế. Hiện tại chỉ hiển thị trạng thái kết nối thật của hệ thống.
        </p>
      </div>
    </div>
  );
}
