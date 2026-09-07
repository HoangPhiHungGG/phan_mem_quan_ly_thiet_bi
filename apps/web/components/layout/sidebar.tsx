"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Cpu,
  Package,
  Warehouse,
  FolderTree,
  Send,
  Repeat,
  ArrowLeftRight,
  Undo2,
  Wrench,
  ClipboardCheck,
  Trash2,
  BarChart3,
  Settings,
  MonitorSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/thiet-bi", label: "Thiết bị", icon: Cpu },
  { href: "/linh-kien", label: "Linh kiện", icon: Package },
  { href: "/kho", label: "Kho", icon: Warehouse },
  {
    href: "/nhap-kho",
    label: "Nhập kho",
    icon: Package,
    permission: "receipts.read",
  },
  {
    href: "/danh-muc",
    label: "Danh mục",
    icon: FolderTree,
    permission: "catalog.read",
  },
  {
    href: "/cap-phat",
    label: "Cấp phát",
    icon: Send,
    permission: "operations.read",
  },
  {
    href: "/muon-tra",
    label: "Mượn/trả",
    icon: Repeat,
    permission: "operations.read",
  },
  {
    href: "/dieu-chuyen",
    label: "Điều chuyển",
    icon: ArrowLeftRight,
    permission: "operations.read",
  },
  {
    href: "/thu-hoi",
    label: "Thu hồi",
    icon: Undo2,
    permission: "operations.read",
  },
  { href: "/sua-chua", label: "Sửa chữa", icon: Wrench },
  { href: "/kiem-ke", label: "Kiểm kê", icon: ClipboardCheck },
  { href: "/thanh-ly", label: "Thanh lý", icon: Trash2 },
  {
    href: "/bao-cao",
    label: "Báo cáo",
    icon: BarChart3,
    permission: "reports.read",
  },
  {
    href: "/quan-tri/tai-khoan",
    label: "Quản trị",
    icon: Settings,
    permission: "users.read",
  },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-primary text-primary-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-primary-foreground/10 px-6">
          <MonitorSmartphone className="h-6 w-6" />
          <div>
            <p className="text-sm font-semibold leading-tight">PMQLTB</p>
            <p className="text-xs text-primary-foreground/70">
              Quản lý thiết bị & linh kiện
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {visibleItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-secondary text-secondary-foreground"
                        : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-primary-foreground/10 px-6 py-4">
          <p className="text-xs text-primary-foreground/60">
            Phòng IT · Phiên bản 0.1.0
          </p>
        </div>
      </aside>
    </>
  );
}
