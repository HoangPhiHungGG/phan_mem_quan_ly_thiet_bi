import type { Metadata } from "next";
import "./globals.css";
import { AdminShell } from "@/components/layout/admin-shell";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = {
  title: "PMQLTB | Quản lý thiết bị",
  description: "Hệ thống quản lý thiết bị và linh kiện",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
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
