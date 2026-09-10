"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export default function ChangePasswordPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch<void>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        }),
      });
      window.location.assign("/");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể đổi mật khẩu.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Đổi mật khẩu</h1>
            <p className="text-sm text-muted-foreground">
              Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.
            </p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <PasswordInput name="currentPassword" label="Mật khẩu hiện tại" />
          <PasswordInput name="newPassword" label="Mật khẩu mới" policy />
          <PasswordInput name="confirmPassword" label="Xác nhận mật khẩu mới" />
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? "Đang cập nhật..." : "Đổi mật khẩu"}
          </Button>
        </form>
      </div>
    </main>
  );
}

function PasswordInput({
  name,
  label,
  policy,
}: {
  name: string;
  label: string;
  policy?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        name={name}
        type="password"
        minLength={12}
        maxLength={128}
        required
        pattern={policy ? "(?=.*[A-Za-z])(?=.*[0-9]).{12,}" : undefined}
        autoComplete={
          name === "currentPassword" ? "current-password" : "new-password"
        }
      />
      {policy && (
        <small className="text-muted-foreground">
          Tối thiểu 12 ký tự, gồm chữ và số.
        </small>
      )}
    </label>
  );
}
