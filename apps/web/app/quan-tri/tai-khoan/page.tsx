"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  MoreVertical,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type Ref = { _id: string; code?: string; name: string };
type Employee = {
  _id: string;
  employeeCode?: string;
  displayName: string;
  email?: string;
  departmentId?: Ref;
  positionId?: Ref;
};
type Role = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
  system: boolean;
  userCount: number;
};
type Assignment = { _id: string; roleId: Role };
type UserRow = {
  id: string;
  employeeCode: string;
  displayName: string;
  email: string;
  status: string;
  primaryDepartmentId?: Ref | string;
  lastLoginAt?: string;
  assignments: Assignment[];
};
type PermissionGroup = {
  module: string;
  permissions: readonly { code: string; label: string }[];
};
type AuditRow = {
  _id: string;
  action: string;
  entityType?: string;
  outcome: string;
  createdAt: string;
  actorUserId?: { displayName: string; employeeCode: string };
};
type Meta = { page: number; limit: number; total: number; totalPages: number };

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring";
const statuses: Record<string, string> = {
  ACTIVE: "Hoạt động",
  LOCKED: "Đã khóa",
  INACTIVE: "Ngừng hoạt động",
  DISABLED: "Ngừng hoạt động",
  INVITED: "Chờ kích hoạt",
};
const auditNames: Record<string, string> = {
  USER_CREATED: "Tạo tài khoản",
  USER_UPDATED: "Cập nhật tài khoản",
  USER_LOCKED: "Khóa tài khoản",
  USER_UNLOCKED: "Mở khóa tài khoản",
  USER_DEACTIVATED: "Vô hiệu hóa tài khoản",
  USER_ACTIVATED: "Kích hoạt lại tài khoản",
  USER_DELETED: "Xóa tài khoản",
  PASSWORD_RESET: "Đặt lại mật khẩu",
  ROLE_ASSIGNED: "Gán vai trò",
  ROLE_CREATED: "Tạo vai trò",
  ROLE_UPDATED: "Cập nhật vai trò",
  PERMISSIONS_UPDATED: "Cập nhật quyền",
};

export default function UsersAdminPage() {
  const { user: me, hasPermission, refresh } = useAuth();
  const can = useCallback(
    (permission: string, legacy?: string) =>
      hasPermission(permission) || Boolean(legacy && hasPermission(legacy)),
    [hasPermission],
  );
  const tabs = useMemo(
    () =>
      [
        can("users.view", "users.read") && ["users", "Tài khoản"],
        can("roles.view", "roles.read") && ["roles", "Vai trò & phân quyền"],
        can("audit.view") && ["audit", "Nhật ký quản trị"],
      ].filter(Boolean) as [Tab, string][],
    [can],
  );
  const [tab, setTab] = useState<Tab>("users"),
    [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [users, setUsers] = useState<UserRow[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [departments, setDepartments] = useState<Ref[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]),
    [groups, setGroups] = useState<PermissionGroup[]>([]),
    [audits, setAudits] = useState<AuditRow[]>([]);
  const [meta, setMeta] = useState<Meta>({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    }),
    [page, setPage] = useState(1);
  const [q, setQ] = useState(""),
    [departmentId, setDepartmentId] = useState(""),
    [roleId, setRoleId] = useState(""),
    [status, setStatus] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const [createOpen, setCreateOpen] = useState(false),
    [editingUser, setEditingUser] = useState<UserRow | null>(null),
    [assigningUser, setAssigningUser] = useState<UserRow | null>(null),
    [resetUser, setResetUser] = useState<UserRow | null>(null),
    [deletingUser, setDeletingUser] = useState<UserRow | null>(null),
    [editingRole, setEditingRole] = useState<Role | "new" | null>(null);

  const load = useCallback(async () => {
    if (!tabs.length) {
      setMessage("Bạn không có quyền truy cập khu vực quản trị.");
      setState("error");
      return;
    }
    setState("loading");
    setMessage("");
    try {
      const shared: Promise<unknown>[] = [];
      if (can("roles.view", "roles.read"))
        shared.push(
          apiFetch<{ data: Role[] }>("/api/roles").then((r) =>
            setRoles(r.data),
          ),
          apiFetch<{ data: PermissionGroup[] }>("/api/permissions").then((r) =>
            setGroups(r.data),
          ),
        );
      if (hasPermission("departments.read"))
        shared.push(
          apiFetch<{ data: Ref[] }>("/api/departments").then((r) =>
            setDepartments(r.data),
          ),
        );
      await Promise.all(shared);
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("q", q.trim());
      if (tab === "users") {
        if (departmentId) params.set("departmentId", departmentId);
        if (roleId) params.set("roleId", roleId);
        if (status) params.set("status", status);
        const r = await apiFetch<{ data: UserRow[]; meta: Meta }>(
          `/api/users?${params}`,
        );
        setUsers(r.data);
        setMeta(r.meta);
      }
      if (tab === "audit") {
        const r = await apiFetch<{ data: AuditRow[]; meta: Meta }>(
          `/api/admin-audit-logs?${params}`,
        );
        setAudits(r.data);
        setMeta(r.meta);
      }
      setState("ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể tải dữ liệu quản trị.",
      );
      setState("error");
    }
  }, [
    can,
    departmentId,
    hasPermission,
    page,
    q,
    roleId,
    status,
    tab,
    tabs.length,
  ]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!tabs.some(([id]) => id === tab) && tabs[0]) setTab(tabs[0][0]);
  }, [tab, tabs]);

  async function openCreate() {
    try {
      const r = await apiFetch<{ data: Employee[] }>(
        "/api/users/eligible-employees",
      );
      setEmployees(r.data);
      setCreateOpen(true);
    } catch (error) {
      showError(error);
    }
  }
  function showError(error: unknown) {
    setMessage(
      error instanceof Error ? error.message : "Yêu cầu không thành công.",
    );
  }
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          employeeId: data.get("employeeId"),
          email: data.get("email"),
          roleId: data.get("roleId"),
          password: data.get("password"),
          status: data.get("status"),
          mustChangePassword: data.get("mustChangePassword") === "on",
        }),
      });
      setCreateOpen(false);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: data.get("email"),
        }),
      });
      setEditingUser(null);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(
    row: UserRow,
    action: "lock" | "unlock" | "deactivate" | "activate",
  ) {
    const labels = {
      lock: "khóa",
      unlock: "mở khóa",
      deactivate: "vô hiệu hóa",
      activate: "kích hoạt lại",
    };
    const detail =
      action === "deactivate"
        ? " Tài khoản sẽ không thể đăng nhập nhưng lịch sử nghiệp vụ vẫn được giữ lại."
        : "";
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn ${labels[action]} tài khoản ${row.displayName}?${detail}`,
      )
    )
      return;
    try {
      await apiFetch(`/api/users/${row.id}/${action}`, { method: "POST" });
      await load();
    } catch (e) {
      showError(e);
    }
  }
  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assigningUser) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/api/users/${assigningUser.id}/assign-role`, {
        method: "POST",
        body: JSON.stringify({ roleId: data.get("roleId") }),
      });
      if (assigningUser.id === me?.id) await refresh();
      setAssigningUser(null);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function deleteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deletingUser) return;
    const data = new FormData(event.currentTarget);
    if (data.get("confirmation") !== "XÓA") {
      setMessage('Hãy nhập chính xác "XÓA" để xác nhận.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/users/${deletingUser.id}`, { method: "DELETE" });
      setDeletingUser(null);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch(`/api/users/${resetUser.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({
          password: data.get("password"),
          mustChangePassword: true,
        }),
      });
      setResetUser(null);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRole) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: data.get("name"),
      description: data.get("description"),
      isActive: data.get("isActive") === "on",
      permissions: data.getAll("permissions").map(String),
    };
    if (editingRole === "new") body.code = data.get("code");
    try {
      await apiFetch(
        editingRole === "new" ? "/api/roles" : `/api/roles/${editingRole._id}`,
        {
          method: editingRole === "new" ? "POST" : "PATCH",
          body: JSON.stringify(body),
        },
      );
      await refresh();
      setEditingRole(null);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tài khoản & phân quyền"
        description="Quản lý tài khoản đăng nhập, vai trò và lịch sử thay đổi quyền"
      />
      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setPage(1);
              setQ("");
            }}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {message}
        </div>
      )}
      {state === "loading" ? (
        <div className="flex min-h-52 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : state === "error" && !tabs.length ? (
        <EmptyState title="Không có quyền truy cập" description={message} />
      ) : (
        <>
          {tab === "users" && (
            <Accounts
              users={users}
              roles={roles}
              departments={departments}
              q={q}
              setQ={setQ}
              filters={{ departmentId, roleId, status }}
              setters={{ setDepartmentId, setRoleId, setStatus }}
              reload={() => {
                setPage(1);
                void load();
              }}
              openCreate={openCreate}
              edit={setEditingUser}
              assign={setAssigningUser}
              changeStatus={changeStatus}
              reset={setResetUser}
              remove={setDeletingUser}
              permissions={{
                create:
                  can("users.create", "users.manage") &&
                  can("users.assign_role", "roles.assign"),
                edit: can("users.update", "users.manage"),
                assign: can("users.assign_role", "roles.assign"),
                lock: can("users.lock", "users.manage"),
                activate: can("users.activate", "users.manage"),
                reset: can("users.reset_password", "users.manage"),
                delete: can("users.delete", "users.manage"),
              }}
              me={me?.id}
            />
          )}
          {tab === "roles" && (
            <Roles
              roles={roles}
              canManage={can("roles.manage")}
              edit={setEditingRole}
            />
          )}
          {tab === "audit" && (
            <Audit
              rows={audits}
              q={q}
              setQ={setQ}
              reload={() => {
                setPage(1);
                void load();
              }}
            />
          )}
          {tab !== "roles" && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
      <Dialog
        open={Boolean(assigningUser)}
        onOpenChange={(open) => !open && setAssigningUser(null)}
        title="Sửa vai trò"
        description="Quyền mới có hiệu lực ngay sau khi lưu."
      >
        {assigningUser && (
          <AssignRoleForm
            user={assigningUser}
            roles={roles.filter((role) => role.isActive)}
            groups={groups}
            busy={busy}
            submit={assignRole}
            cancel={() => setAssigningUser(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tạo tài khoản"
        description="Chọn nhân viên chưa có tài khoản đăng nhập."
      >
        <CreateForm
          employees={employees}
          roles={roles.filter((r) => r.isActive)}
          busy={busy}
          show={showPassword}
          setShow={setShowPassword}
          submit={createUser}
        />
      </Dialog>
      <Dialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => !open && setDeletingUser(null)}
        title="Xóa tài khoản"
        description="Hành động này không thể hoàn tác."
      >
        {deletingUser && (
          <form onSubmit={deleteUser} className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3">
              <Read label="Tên" value={deletingUser.displayName} />
              <Read label="Mã nhân viên" value={deletingUser.employeeCode} />
            </div>
            <p className="text-sm">
              Chỉ tài khoản chưa phát sinh lịch sử nghiệp vụ mới có thể xóa.
              Nhập <b>XÓA</b> để xác nhận.
            </p>
            <input
              className={inputClass}
              name="confirmation"
              autoComplete="off"
              required
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingUser(null)}
              >
                Hủy
              </Button>
              <Button variant="destructive" disabled={busy}>
                <Trash2 />
                Xóa tài khoản
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
        title="Chi tiết tài khoản"
      >
        {editingUser && (
          <UserForm
            user={editingUser}
            busy={busy}
            submit={saveUser}
            editable={can("users.update", "users.manage")}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(resetUser)}
        onOpenChange={(open) => !open && setResetUser(null)}
        title="Đặt lại mật khẩu"
        description="Mọi phiên đăng nhập hiện tại sẽ bị thu hồi."
      >
        {resetUser && (
          <form onSubmit={resetPassword} className="space-y-4">
            <b className="text-sm">{resetUser.displayName}</b>
            <Password show={showPassword} setShow={setShowPassword} />
            <Button disabled={busy}>Đặt lại mật khẩu</Button>
          </form>
        )}
      </Dialog>
      <Dialog
        open={Boolean(editingRole)}
        onOpenChange={(open) => !open && setEditingRole(null)}
        title={editingRole === "new" ? "Tạo vai trò" : "Vai trò & phân quyền"}
        className="max-w-4xl"
      >
        {editingRole && (
          <RoleForm
            role={editingRole}
            groups={groups}
            busy={busy}
            submit={saveRole}
            editable={can("roles.manage")}
          />
        )}
      </Dialog>
    </div>
  );
}

type Tab = "users" | "roles" | "audit";
function Accounts({
  users,
  roles,
  departments,
  q,
  setQ,
  filters,
  setters,
  reload,
  openCreate,
  edit,
  assign,
  changeStatus,
  reset,
  remove,
  permissions,
  me,
}: {
  users: UserRow[];
  roles: Role[];
  departments: Ref[];
  q: string;
  setQ(v: string): void;
  filters: { departmentId: string; roleId: string; status: string };
  setters: {
    setDepartmentId(v: string): void;
    setRoleId(v: string): void;
    setStatus(v: string): void;
  };
  reload(): void;
  openCreate(): void;
  edit(v: UserRow): void;
  assign(v: UserRow): void;
  changeStatus(
    v: UserRow,
    action: "lock" | "unlock" | "deactivate" | "activate",
  ): void;
  reset(v: UserRow): void;
  remove(v: UserRow): void;
  permissions: {
    create: boolean;
    edit: boolean;
    assign: boolean;
    lock: boolean;
    activate: boolean;
    reset: boolean;
    delete: boolean;
  };
  me?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_180px_auto_auto]">
        <Field label="Tìm kiếm">
          <input
            className={inputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã NV, họ tên, email..."
          />
        </Field>
        <Field label="Bộ phận">
          <select
            className={inputClass}
            value={filters.departmentId}
            onChange={(e) => setters.setDepartmentId(e.target.value)}
          >
            <option value="">Tất cả</option>
            {departments.map((x) => (
              <option key={x._id} value={x._id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vai trò">
          <select
            className={inputClass}
            value={filters.roleId}
            onChange={(e) => setters.setRoleId(e.target.value)}
          >
            <option value="">Tất cả</option>
            {roles.map((x) => (
              <option key={x._id} value={x._id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select
            className={inputClass}
            value={filters.status}
            onChange={(e) => setters.setStatus(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </Field>
        <Button className="self-end" variant="outline" onClick={reload}>
          Lọc
        </Button>
        {permissions.create && (
          <Button className="self-end" onClick={openCreate}>
            <Plus />
            Tạo tài khoản
          </Button>
        )}
      </div>
      {!users.length ? (
        <EmptyState
          title="Chưa có tài khoản phù hợp"
          description="Thay đổi bộ lọc hoặc tạo tài khoản cho nhân viên."
        />
      ) : (
        <Table
          headers={[
            "Mã NV",
            "Họ tên",
            "Email",
            "Bộ phận",
            "Vai trò",
            "Trạng thái",
            "Đăng nhập gần nhất",
            "Thao tác",
          ]}
        >
          {users.map((row) => (
            <tr className="border-t" key={row.id}>
              <Cell strong>{row.employeeCode}</Cell>
              <Cell>{row.displayName}</Cell>
              <Cell>{row.email}</Cell>
              <Cell>
                {typeof row.primaryDepartmentId === "object"
                  ? row.primaryDepartmentId?.name
                  : "—"}
              </Cell>
              <Cell>
                {row.assignments
                  .map((a) => a.roleId?.name)
                  .filter(Boolean)
                  .join(", ") || "Chưa gán"}
              </Cell>
              <Cell>
                <Badge
                  variant={
                    row.status === "ACTIVE"
                      ? "success"
                      : row.status === "LOCKED"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {statuses[row.status] ?? row.status}
                </Badge>
              </Cell>
              <Cell>
                {row.lastLoginAt
                  ? new Date(row.lastLoginAt).toLocaleString("vi-VN")
                  : "Chưa đăng nhập"}
              </Cell>
              <Cell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => edit(row)}>
                    Chi tiết
                  </Button>
                  {permissions.assign && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => assign(row)}
                    >
                      Sửa vai trò
                    </Button>
                  )}
                  {(permissions.edit ||
                    permissions.reset ||
                    permissions.lock ||
                    permissions.activate ||
                    permissions.delete) && (
                    <details className="relative">
                      <summary
                        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border hover:bg-accent"
                        title="Thao tác khác"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </summary>
                      <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
                        {permissions.edit && (
                          <MenuAction onClick={() => edit(row)}>
                            Sửa thông tin tài khoản
                          </MenuAction>
                        )}
                        <MenuAction onClick={() => edit(row)}>
                          Xem quyền
                        </MenuAction>
                        {permissions.reset && (
                          <MenuAction onClick={() => reset(row)}>
                            <KeyRound />
                            Reset mật khẩu
                          </MenuAction>
                        )}
                        {permissions.lock &&
                          row.id !== me &&
                          row.status === "ACTIVE" && (
                            <MenuAction
                              onClick={() => changeStatus(row, "lock")}
                            >
                              <LockKeyhole />
                              Khóa tài khoản
                            </MenuAction>
                          )}
                        {permissions.lock &&
                          row.id !== me &&
                          row.status === "LOCKED" && (
                            <MenuAction
                              onClick={() => changeStatus(row, "unlock")}
                            >
                              <RefreshCw />
                              Mở khóa tài khoản
                            </MenuAction>
                          )}
                        {permissions.activate &&
                          row.id !== me &&
                          ["ACTIVE", "LOCKED"].includes(row.status) && (
                            <MenuAction
                              onClick={() => changeStatus(row, "deactivate")}
                            >
                              Vô hiệu hóa tài khoản
                            </MenuAction>
                          )}
                        {permissions.activate &&
                          row.id !== me &&
                          ["INACTIVE", "DISABLED"].includes(row.status) && (
                            <MenuAction
                              onClick={() => changeStatus(row, "activate")}
                            >
                              Kích hoạt lại
                            </MenuAction>
                          )}
                        {permissions.delete && row.id !== me && (
                          <MenuAction destructive onClick={() => remove(row)}>
                            <Trash2 />
                            Xóa tài khoản
                          </MenuAction>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </Cell>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
function Roles({
  roles,
  canManage,
  edit,
}: {
  roles: Role[];
  canManage: boolean;
  edit(v: Role | "new"): void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && (
          <Button onClick={() => edit("new")}>
            <Plus />
            Tạo vai trò
          </Button>
        )}
      </div>
      <Table
        headers={[
          "Vai trò",
          "Mô tả",
          "Người dùng",
          "Số quyền",
          "Trạng thái",
          "Thao tác",
        ]}
      >
        {roles.map((role) => (
          <tr className="border-t" key={role._id}>
            <Cell>
              <b>{role.name}</b>
              <div className="text-xs text-muted-foreground">{role.code}</div>
            </Cell>
            <Cell>{role.description || "—"}</Cell>
            <Cell>{role.userCount}</Cell>
            <Cell>{role.permissions.length}</Cell>
            <Cell>
              <Badge variant={role.isActive ? "success" : "secondary"}>
                {role.isActive ? "Hoạt động" : "Ngừng hoạt động"}
              </Badge>
            </Cell>
            <Cell>
              <Button size="sm" variant="outline" onClick={() => edit(role)}>
                <ShieldCheck />
                {canManage ? "Sửa quyền" : "Xem quyền"}
              </Button>
            </Cell>
          </tr>
        ))}
      </Table>
    </div>
  );
}
function Audit({
  rows,
  q,
  setQ,
  reload,
}: {
  rows: AuditRow[];
  q: string;
  setQ(v: string): void;
  reload(): void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex max-w-xl gap-2">
        <input
          className={inputClass}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm hành động hoặc đối tượng..."
        />
        <Button variant="outline" onClick={reload}>
          Tìm
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState
          title="Chưa có nhật ký quản trị"
          description="Các thay đổi tài khoản và quyền sẽ xuất hiện tại đây."
        />
      ) : (
        <Table
          headers={[
            "Thời gian",
            "Người thao tác",
            "Hành động",
            "Đối tượng",
            "Kết quả",
          ]}
        >
          {rows.map((row) => (
            <tr className="border-t" key={row._id}>
              <Cell>{new Date(row.createdAt).toLocaleString("vi-VN")}</Cell>
              <Cell>
                {row.actorUserId?.displayName ?? "Hệ thống"}
                <div className="text-xs text-muted-foreground">
                  {row.actorUserId?.employeeCode}
                </div>
              </Cell>
              <Cell strong>{auditNames[row.action] ?? row.action}</Cell>
              <Cell>{row.entityType || "—"}</Cell>
              <Cell>
                <Badge
                  variant={
                    row.outcome === "SUCCESS" ? "success" : "destructive"
                  }
                >
                  {row.outcome === "SUCCESS" ? "Thành công" : "Thất bại"}
                </Badge>
              </Cell>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function CreateForm({
  employees,
  roles,
  busy,
  show,
  setShow,
  submit,
}: {
  employees: Employee[];
  roles: Role[];
  busy: boolean;
  show: boolean;
  setShow(v: boolean): void;
  submit(e: FormEvent<HTMLFormElement>): void;
}) {
  const [id, setId] = useState("");
  const employee = employees.find((x) => x._id === id);
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nhân viên *">
        <select
          className={inputClass}
          name="employeeId"
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Chọn nhân viên</option>
          {employees.map((x) => (
            <option key={x._id} value={x._id}>
              {x.employeeCode} · {x.displayName}
            </option>
          ))}
        </select>
      </Field>
      {employee && (
        <div className="grid gap-3 rounded-md bg-muted/50 p-3 sm:grid-cols-2">
          <Read label="Mã nhân viên" value={employee.employeeCode} />
          <Read label="Họ tên" value={employee.displayName} />
          <Read label="Bộ phận" value={employee.departmentId?.name} />
          <Read label="Chức vụ" value={employee.positionId?.name} />
        </div>
      )}
      <Field label="Email đăng nhập *">
        <input
          key={employee?._id}
          className={inputClass}
          name="email"
          type="email"
          required
          defaultValue={employee?.email}
        />
      </Field>
      <Field label="Vai trò *">
        <select className={inputClass} name="roleId" required>
          <option value="">Chọn vai trò</option>
          {roles.map((x) => (
            <option value={x._id} key={x._id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Password show={show} setShow={setShow} />
      <Field label="Trạng thái">
        <select className={inputClass} name="status" defaultValue="ACTIVE">
          <option value="ACTIVE">Hoạt động</option>
          <option value="LOCKED">Đã khóa</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
      </Field>
      <label className="flex gap-2 text-sm">
        <input name="mustChangePassword" type="checkbox" defaultChecked />
        Yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên
      </label>
      <Button disabled={busy || !employees.length}>
        {busy && <Loader2 className="animate-spin" />}Tạo tài khoản
      </Button>
    </form>
  );
}
function UserForm({
  user,
  busy,
  submit,
  editable,
}: {
  user: UserRow;
  busy: boolean;
  submit(e: FormEvent<HTMLFormElement>): void;
  editable: boolean;
}) {
  const effectivePermissions = [
    ...new Set(
      user.assignments.flatMap(
        (assignment) => assignment.roleId?.permissions ?? [],
      ),
    ),
  ];
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 rounded-md bg-muted/50 p-3 sm:grid-cols-2">
        <Read label="Mã nhân viên" value={user.employeeCode} />
        <Read label="Họ tên" value={user.displayName} />
        <Read label="Trạng thái" value={statuses[user.status]} />
      </div>
      <Field label="Email đăng nhập">
        <input
          className={inputClass}
          name="email"
          type="email"
          required
          defaultValue={user.email}
          disabled={!editable}
        />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium">Quyền hiệu lực hiện tại</p>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border p-2">
          {effectivePermissions.length ? (
            effectivePermissions.map((permission) => (
              <Badge key={permission} variant="outline">
                {permission}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Chưa có quyền</span>
          )}
        </div>
      </div>
      {editable && <Button disabled={busy}>Lưu thay đổi</Button>}
    </form>
  );
}

function AssignRoleForm({
  user,
  roles,
  groups,
  busy,
  submit,
  cancel,
}: {
  user: UserRow;
  roles: Role[];
  groups: PermissionGroup[];
  busy: boolean;
  submit(e: FormEvent<HTMLFormElement>): void;
  cancel(): void;
}) {
  const currentRole = user.assignments[0]?.roleId;
  const [roleId, setRoleId] = useState(currentRole?._id ?? "");
  const nextRole = roles.find((role) => role._id === roleId);
  const summarize = (permissions: string[]) =>
    groups
      .map((group) => ({
        module: group.module,
        actions: group.permissions
          .filter((permission) => permissions.includes(permission.code))
          .map((permission) => permission.label),
      }))
      .filter((group) => group.actions.length)
      .slice(0, 6);
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 rounded-md bg-muted/50 p-3 sm:grid-cols-2">
        <Read label="Nhân viên" value={user.displayName} />
        <Read label="Mã nhân viên" value={user.employeeCode} />
        <Read
          label="Vai trò hiện tại"
          value={currentRole?.name ?? "Chưa gán"}
        />
      </div>
      <Field label="Vai trò mới *">
        <select
          className={inputClass}
          name="roleId"
          required
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
        >
          <option value="">Chọn vai trò</option>
          {roles.map((role) => (
            <option key={role._id} value={role._id}>
              {role.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <PermissionPreview
          title="Quyền hiện tại"
          items={summarize(currentRole?.permissions ?? [])}
        />
        <PermissionPreview
          title="Quyền sau thay đổi"
          items={summarize(nextRole?.permissions ?? [])}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancel}>
          Hủy
        </Button>
        <Button disabled={busy || !roleId || roleId === currentRole?._id}>
          {busy && <Loader2 className="animate-spin" />}Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}

function PermissionPreview({
  title,
  items,
}: {
  title: string;
  items: { module: string; actions: string[] }[];
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {items.length ? (
        <ul className="space-y-1 text-xs">
          {items.map((item) => (
            <li key={item.module}>
              <b>{item.module}:</b> {item.actions.join(", ")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Chưa có quyền</p>
      )}
    </div>
  );
}
function RoleForm({
  role,
  groups,
  busy,
  submit,
  editable,
}: {
  role: Role | "new";
  groups: PermissionGroup[];
  busy: boolean;
  submit(e: FormEvent<HTMLFormElement>): void;
  editable: boolean;
}) {
  const selected = role === "new" ? [] : role.permissions,
    locked = !editable || (role !== "new" && role.code === "SYSTEM_ADMIN");
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên vai trò *">
          <input
            className={inputClass}
            name="name"
            required
            defaultValue={role === "new" ? "" : role.name}
          />
        </Field>
        <Field label="Mã vai trò *">
          <input
            className={inputClass}
            name="code"
            required
            disabled={role !== "new"}
            pattern="[A-Za-z][A-Za-z0-9_-]+"
            defaultValue={role === "new" ? "" : role.code}
          />
        </Field>
        <Field label="Mô tả" className="sm:col-span-2">
          <input
            className={inputClass}
            name="description"
            defaultValue={role === "new" ? "" : role.description}
          />
        </Field>
      </div>
      <label className="flex gap-2 text-sm">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={role === "new" || role.isActive}
          disabled={locked}
        />
        Hoạt động
      </label>
      <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-2">
        {groups.map((group) => (
          <fieldset className="rounded-md border p-3" key={group.module}>
            <legend className="px-1 text-sm font-semibold">
              {group.module}
            </legend>
            {!locked && (
              <div className="mb-2 flex justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={(event) =>
                    event.currentTarget
                      .closest("fieldset")
                      ?.querySelectorAll<HTMLInputElement>(
                        'input[name="permissions"]',
                      )
                      .forEach((input) => (input.checked = true))
                  }
                >
                  Chọn tất cả
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={(event) =>
                    event.currentTarget
                      .closest("fieldset")
                      ?.querySelectorAll<HTMLInputElement>(
                        'input[name="permissions"]',
                      )
                      .forEach((input) => (input.checked = false))
                  }
                >
                  Bỏ tất cả
                </Button>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.permissions.map((p) => (
                <label className="flex items-start gap-2 text-sm" key={p.code}>
                  <input
                    className="mt-0.5"
                    type="checkbox"
                    name="permissions"
                    value={p.code}
                    defaultChecked={locked || selected.includes(p.code)}
                    disabled={locked}
                    onChange={(event) => {
                      if (
                        event.currentTarget.checked &&
                        (group.module !== "Quản trị"
                          ? p.code !== group.permissions[0].code
                          : [
                              "users.create",
                              "users.update",
                              "users.assign_role",
                              "users.lock",
                              "users.activate",
                              "users.reset_password",
                              "users.delete",
                              "roles.manage",
                              "roles.assign",
                            ].includes(p.code))
                      ) {
                        const viewPermission = event.currentTarget
                          .closest("fieldset")
                          ?.querySelector<HTMLInputElement>(
                            p.code.startsWith("roles.")
                              ? 'input[value="roles.view"]'
                              : p.code.startsWith("users.")
                                ? 'input[value="users.view"]'
                                : 'input[name="permissions"]',
                          );
                        if (viewPermission) viewPermission.checked = true;
                      }
                    }}
                  />
                  <span>
                    {p.label}
                    <small className="block text-muted-foreground">
                      {p.code}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {locked && (
        <p className="text-xs text-muted-foreground">
          Vai trò Quản trị viên luôn có toàn bộ quyền để tránh khóa hệ thống.
        </p>
      )}
      <Button disabled={busy || locked}>Lưu vai trò</Button>
    </form>
  );
}
function Password({
  show,
  setShow,
}: {
  show: boolean;
  setShow(v: boolean): void;
}) {
  return (
    <Field label="Mật khẩu ban đầu *">
      <div className="relative">
        <input
          className={`${inputClass} pr-10`}
          name="password"
          type={show ? "text" : "password"}
          minLength={12}
          maxLength={128}
          required
          pattern="(?=.*[A-Za-z])(?=.*[0-9]).{12,}"
        />
        <button
          type="button"
          className="absolute right-2 top-2"
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <small className="text-muted-foreground">
        Tối thiểu 12 ký tự, gồm chữ và số.
      </small>
    </Field>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/60 text-left">
          <tr>
            {headers.map((x) => (
              <th key={x} className="px-4 py-3 font-medium">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Cell({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td className={cn("px-4 py-3", strong && "font-medium")}>{children}</td>
  );
}
function MenuAction({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick(): void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick();
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5 text-sm font-medium", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Read({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value || "—"}</div>
    </div>
  );
}
