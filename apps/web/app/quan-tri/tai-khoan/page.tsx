"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type UserRow = {
  id: string;
  employeeCode: string;
  displayName: string;
  email: string;
  status: string;
};

export default function UsersAdminPage() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState("");

  const loadUsers = useCallback(() => {
    if (!hasPermission("users.read")) {
      setState("error");
      return;
    }
    apiFetch<{ data: UserRow[] }>("/api/users")
      .then((result) => {
        setUsers(result.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [hasPermission]);

  useEffect(() => loadUsers(), [loadUsers]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          employeeCode: form.get("employeeCode"),
          displayName: form.get("displayName"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setShowCreate(false);
      setState("loading");
      loadUsers();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể tạo tài khoản.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Quản lý tài khoản</h2>
        <p className="text-sm text-muted-foreground">
          Tài khoản, trạng thái và phạm vi truy cập
        </p>
      </div>
      {hasPermission("users.manage") && (
        <Button onClick={() => setShowCreate((value) => !value)}>
          <Plus /> Tạo tài khoản
        </Button>
      )}
      {showCreate && (
        <form
          onSubmit={createUser}
          className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"
        >
          <Input name="employeeCode" label="Mã nhân viên" />
          <Input name="displayName" label="Họ tên" />
          <Input name="email" label="Email" type="email" />
          <Input
            name="password"
            label="Mật khẩu ban đầu"
            type="password"
            minLength={12}
          />
          {formError && (
            <p className="text-sm text-red-700 sm:col-span-2">{formError}</p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Lưu tài khoản</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}
      {state === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải tài khoản...
        </div>
      )}
      {state === "error" && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-4 text-sm text-red-700"
        >
          Không có quyền hoặc không thể tải danh sách tài khoản.
        </p>
      )}
      {state === "ready" && !users.length && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có tài khoản.
        </p>
      )}
      {state === "ready" && users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3">Mã nhân viên</th>
                <th className="p-3">Họ tên</th>
                <th className="p-3">Email</th>
                <th className="p-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{user.employeeCode}</td>
                  <td className="p-3">{user.displayName}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">{user.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Input({
  name,
  label,
  type = "text",
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  minLength?: number;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        minLength={minLength}
        required
        className="mt-1 w-full rounded-md border px-3 py-2"
      />
    </label>
  );
}
