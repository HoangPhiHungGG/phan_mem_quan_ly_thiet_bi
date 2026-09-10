"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { useAuth } from "../auth/auth-provider";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const loginPage = pathname === "/dang-nhap";
  const changePasswordPage = pathname === "/doi-mat-khau";

  useEffect(() => {
    if (!loading && !user && !loginPage) {
      router.replace(`/dang-nhap?returnTo=${encodeURIComponent(pathname)}`);
    }
    if (!loading && user && loginPage) router.replace("/");
    if (!loading && user?.mustChangePassword && !changePasswordPage) {
      router.replace("/doi-mat-khau");
    }
  }, [changePasswordPage, loading, user, loginPage, pathname, router]);

  if (loginPage || changePasswordPage) return <>{children}</>;
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-secondary" />
        <span className="ml-3 text-sm text-muted-foreground">
          Đang kiểm tra phiên đăng nhập...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-5 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
