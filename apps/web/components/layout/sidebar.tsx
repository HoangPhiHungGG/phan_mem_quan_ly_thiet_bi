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
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [{ href: "/", label: "Tổng quan", icon: LayoutDashboard }],
  },
  {
    label: "Tài sản",
    items: [
      { href: "/thiet-bi", label: "Thiết bị", icon: Cpu },
      { href: "/linh-kien", label: "Linh kiện", icon: Package },
      {
        href: "/danh-muc",
        label: "Danh mục",
        icon: FolderTree,
        permission: "catalog.read",
      },
    ],
  },
  {
    label: "Tổ chức",
    items: [
      {
        href: "/nhan-su",
        label: "Nhân sự",
        icon: Users,
        permission: "catalog.read",
      },
    ],
  },
  {
    label: "Kho",
    items: [
      { href: "/kho", label: "Kho", icon: Warehouse },
      {
        href: "/nhap-kho",
        label: "Nhập kho",
        icon: Package,
        permission: "receipts.read",
      },
    ],
  },
  {
    label: "Nghiệp vụ",
    items: [
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
    ],
  },
  {
    label: "Vòng đời tài sản",
    items: [
      {
        href: "/sua-chua",
        label: "Sửa chữa",
        icon: Wrench,
        permission: "repair.view",
      },
      {
        href: "/kiem-ke",
        label: "Kiểm kê",
        icon: ClipboardCheck,
        permission: "inventory.view",
      },
      {
        href: "/thanh-ly",
        label: "Thanh lý",
        icon: Trash2,
        permission: "liquidation.view",
      },
    ],
  },
  {
    label: "Hệ thống",
    items: [
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
    ],
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
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || hasPermission(item.permission),
      ),
    }))
    .filter((group) => group.items.length > 0);

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
          "flex h-dvh w-64 shrink-0 flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground shadow-xl transition-transform md:static md:translate-x-0 md:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
          "fixed inset-y-0 left-0 z-50 md:static",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-primary-foreground/10 px-5">
          <MonitorSmartphone className="h-5 w-5" />
          <div>
            <p className="text-sm font-semibold leading-tight">PMQLTB</p>
            <p className="text-xs text-primary-foreground/70">
              Quản lý thiết bị & linh kiện
            </p>
          </div>
        </div>

        <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-6">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/45">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
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
                          "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-secondary text-secondary-foreground"
                            : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                        )}
                      >
                        <span className="flex w-5 shrink-0 justify-center">
                          <Icon className="h-4 w-4" />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <footer className="shrink-0 border-t border-primary-foreground/10 bg-primary px-5 py-3">
          <p className="text-xs text-primary-foreground/60">
            Phòng IT · Phiên bản 0.1.0
          </p>
        </footer>
      </aside>
    </>
  );
}
