"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      router.replace(returnTo?.startsWith("/") ? returnTo : "/");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể đăng nhập.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <MonitorSmartphone className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Đăng nhập PMQLTB</h1>
            <p className="text-sm text-muted-foreground">
              Hệ thống quản lý thiết bị
            </p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium">
            Email
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Mật khẩu
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              type="password"
              autoComplete="current-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting && <Loader2 className="animate-spin" />}
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </main>
  );
}
