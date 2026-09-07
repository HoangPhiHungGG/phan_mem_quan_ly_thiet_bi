import type { Metadata } from "next";
import "./globals.css";
import { AdminShell } from "@/components/layout/admin-shell";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = {
  title: "PMQLTB - Quản lý thiết bị điện tử và linh kiện",
  description:
    "Hệ thống quản lý thiết bị điện tử và linh kiện cho Phòng IT, kho và các bộ phận sử dụng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <AdminShell>{children}</AdminShell>
        </AuthProvider>
      </body>
    </html>
  );
}
