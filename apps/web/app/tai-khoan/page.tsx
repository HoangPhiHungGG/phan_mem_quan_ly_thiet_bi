"use client";

import { useAuth } from "@/components/auth/auth-provider";

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Thông tin tài khoản</h2>
        <p className="text-sm text-muted-foreground">
          Phiên đăng nhập và quyền hiện đang có hiệu lực
        </p>
      </div>
      <div className="grid gap-4 rounded-lg border bg-card p-6 sm:grid-cols-2">
        <Field label="Họ tên" value={user.displayName} />
        <Field label="Mã nhân viên" value={user.employeeCode} />
        <Field label="Email" value={user.email} />
        <Field label="Trạng thái" value={user.status} />
      </div>
      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold">Vai trò</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.roleCodes.length ? (
            user.roleCodes.map((role) => (
              <span
                key={role}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
              >
                {role}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              Chưa được gán vai trò.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
