"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  Building2,
  Eye,
  Loader2,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, apiFetchAllPages } from "@/lib/api";
import { loadCatalogOptions, CatalogOption, formatDate } from "@/lib/catalogs";

type Ref = { _id: string; name?: string; displayName?: string; code?: string };
type Employee = {
  _id: string;
  code?: string;
  employeeCode?: string;
  displayName?: string;
  name?: string;
  departmentId?: Ref;
  positionId?: Ref;
  phone?: string;
  email?: string;
  joinedAt?: string;
  status?: "ACTIVE" | "ON_LEAVE" | "RESIGNED";
  note?: string;
  isActive?: boolean;
};
type Department = {
  _id: string;
  code?: string;
  name?: string;
  managerKeeperId?: Ref;
  isActive?: boolean;
};
type Position = {
  _id: string;
  code?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
};
type Device = {
  _id: string;
  assetCode?: string;
  serial?: string;
  modelId?: { name?: string };
  usageStatus?: string;
  loanId?: string;
  keeperId?: Ref;
};
type OperationRow = {
  _id: string;
  code: string;
  type: string;
  status: string;
  operationDate: string;
  receiverKeeperId?: Ref;
  senderKeeperId?: Ref;
  lines: { kind: string; deviceId?: { assetCode?: string; serial?: string } }[];
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Đang làm việc",
  ON_LEAVE: "Tạm nghỉ",
  RESIGNED: "Đã nghỉ việc",
};
const statusColor = (status?: string) =>
  status === "ACTIVE"
    ? "bg-green-100 text-green-800"
    : status === "ON_LEAVE"
      ? "bg-amber-100 text-amber-800"
      : "bg-gray-200 text-gray-700";
const USAGE_LABEL: Record<string, string> = {
  IN_USE: "Đang sử dụng",
  IN_STOCK: "Trong kho",
  LENT: "Đang mượn",
  REPAIRING: "Đang sửa chữa",
  LOST: "Mất thiết bị",
  DISPOSED: "Đã thanh lý",
};
const OPERATION_LABEL: Record<string, string> = {
  ISSUE: "Cấp phát",
  LOAN: "Mượn/trả",
  TRANSFER: "Điều chuyển",
  RECOVERY: "Thu hồi",
};
export default function HumanResourcesPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<"employees" | "departments" | "positions">(
    "employees",
  );
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [posFilter, setPosFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({});
  const [posCounts, setPosCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<
    null | Employee | Department | Position
  >(null);
  const [detail, setDetail] = useState<Employee | null>(null);
  const [heldDevices, setHeldDevices] = useState<Device[]>([]);
  const [history, setHistory] = useState<OperationRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deptOptions, setDeptOptions] = useState<CatalogOption[]>([]);
  const [posOptions, setPosOptions] = useState<CatalogOption[]>([]);

  const canManage = hasPermission("catalog.manage");
  const canRead = hasPermission("catalog.read");

  const listUrl = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    if (q.trim()) params.set("q", q.trim());
    if (tab === "employees") {
      if (deptFilter) params.set("departmentId", deptFilter);
      if (posFilter) params.set("positionId", posFilter);
      if (statusFilter) params.set("status", statusFilter);
    }
    return params;
  }, [q, page, pageSize, tab, deptFilter, posFilter, statusFilter]);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (tab === "employees") {
        const result = await apiFetch<{
          data: Employee[];
          meta: { total: number };
        }>(`/api/catalog/keepers?${listUrl().toString()}`);
        setEmployees(result.data);
        setTotal(result.meta.total);
      } else if (tab === "departments") {
        const result = await apiFetch<{ data: Department[] }>(
          `/api/catalog/departments?limit=100`,
        );
        setDepts(result.data);
      } else {
        const result = await apiFetch<{ data: Position[] }>(
          `/api/catalog/positions?limit=100`,
        );
        setPositions(result.data);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [tab, listUrl, canRead]);

  const loadCounts = useCallback(async () => {
    try {
      const all = await apiFetchAllPages<Employee>(
        "/api/catalog/keepers",
        new URLSearchParams({ limit: "100" }),
      );
      const dc: Record<string, number> = {};
      const pc: Record<string, number> = {};
      for (const emp of all) {
        const d = emp.departmentId?._id ? String(emp.departmentId._id) : null;
        const p = emp.positionId?._id ? String(emp.positionId._id) : null;
        if (d) dc[d] = (dc[d] ?? 0) + 1;
        if (p) pc[p] = (pc[p] ?? 0) + 1;
      }
      setDeptCounts(dc);
      setPosCounts(pc);
    } catch {
      /* counts are best-effort */
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, q, deptFilter, posFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCounts();
    void loadCatalogOptions("departments").then(setDeptOptions);
    void loadCatalogOptions("positions").then(setPosOptions);
  }, [loadCounts]);

  const submitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    const form = new FormData(e.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    try {
      if (tab === "employees") {
        const body = {
          code: value("code") || undefined,
          employeeCode: value("employeeCode") || value("code") || undefined,
          name: value("fullName"),
          email: value("email") || undefined,
          phone: value("phone") || undefined,
          joinedAt: value("joinedAt") || undefined,
          status: value("status") || "ACTIVE",
          departmentId: value("departmentId") || undefined,
          positionId: value("positionId") || undefined,
          note: value("note") || undefined,
        };
        if (editing) {
          await apiFetch(`/api/catalog/keepers/${(editing as Employee)._id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        } else {
          await apiFetch("/api/catalog/keepers", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
      } else if (tab === "departments") {
        const body = {
          code: value("code") || undefined,
          name: value("name"),
          managerKeeperId: value("managerKeeperId") || undefined,
          description: value("description") || undefined,
        };
        if (editing) {
          await apiFetch(
            `/api/catalog/departments/${(editing as Department)._id}`,
            {
              method: "PATCH",
              body: JSON.stringify(body),
            },
          );
        } else {
          await apiFetch("/api/catalog/departments", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
      } else {
        const body = {
          code: value("code") || undefined,
          name: value("name"),
          description: value("description") || undefined,
        };
        if (editing) {
          await apiFetch(
            `/api/catalog/positions/${(editing as Position)._id}`,
            {
              method: "PATCH",
              body: JSON.stringify(body),
            },
          );
        } else {
          await apiFetch("/api/catalog/positions", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
      }
      setShowForm(false);
      setEditing(null);
      await load();
      await loadCounts();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Lưu không thành công.");
    }
  };

  const toggleActive = async (item: { _id: string }, current: boolean) => {
    const type =
      tab === "departments"
        ? "departments"
        : tab === "positions"
          ? "positions"
          : "keepers";
    try {
      await apiFetch(`/api/catalog/${type}/${item._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !current }),
      });
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Thao tác thất bại.");
    }
  };

  const markResigned = async (emp: Employee) => {
    let held: Device[] = [];
    try {
      const deviceResult = await apiFetch<{ data: Device[] }>(
        `/api/devices?keeperId=${emp._id}&limit=100`,
      );
      held = deviceResult.data;
    } catch {
      /* ignore */
    }
    const names = held
      .map((d) => d.assetCode)
      .filter(Boolean)
      .join(", ");
    const message =
      held.length > 0
        ? `Nhân viên hiện vẫn đang giữ ${held.length} tài sản${
            names ? `: ${names}` : ""
          }.\n\nVui lòng tạo phiếu thu hồi trước khi đánh dấu nghỉ việc.\n\nBạn có chắc chắn muốn đánh dấu nghỉ việc?`
        : `Đánh dấu ${emp.displayName ?? emp.name} đã nghỉ việc?`;
    if (!window.confirm(message)) return;
    try {
      await apiFetch(`/api/catalog/keepers/${emp._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "RESIGNED" }),
      });
      await load();
      await loadCounts();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Thao tác thất bại.");
    }
  };

  const openEdit = (item: Employee | Department | Position) => {
    setEditing(item);
    setShowForm(true);
  };

  const openDetail = async (emp: Employee) => {
    setDetail(emp);
    setDetailLoading(true);
    setHeldDevices([]);
    setHistory([]);
    try {
      const deviceResult = await apiFetch<{ data: Device[] }>(
        `/api/devices?keeperId=${emp._id}&limit=100`,
      );
      setHeldDevices(deviceResult.data);
    } catch {
      /* ignore */
    }
    try {
      const ops = await apiFetchAllPages<OperationRow>(
        "/api/operations",
        new URLSearchParams({ limit: "100" }),
      );
      const filtered = ops.filter(
        (o) =>
          String(o.receiverKeeperId?._id ?? "") === emp._id ||
          String(o.senderKeeperId?._id ?? "") === emp._id,
      );
      setHistory(filtered);
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const employeeCode = (emp: Employee) => emp.employeeCode || emp.code || "—";
  const employeeName = (emp: Employee) => emp.displayName || emp.name || "—";

  const renderForm = () => {
    const isEmp = tab === "employees";
    const isDept = tab === "departments";
    const target = editing as Employee | Department | Position | null;
    return (
      <form
        onSubmit={submitForm}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2"
      >
        <h2 className="font-semibold sm:col-span-2">
          {editing ? "Sửa" : "Thêm"}{" "}
          {isEmp ? "nhân viên" : isDept ? "bộ phận" : "chức vụ"}
        </h2>
        {isEmp && (
          <>
            <Input
              defaultValue={(target as Employee)?.employeeCode ?? ""}
              name="employeeCode"
              label="Mã nhân viên *"
              required
            />
            <Input
              defaultValue={(target as Employee)?.displayName ?? ""}
              name="fullName"
              label="Họ và tên *"
              required
            />
            <Select
              label="Bộ phận *"
              required
              placeholder="Chọn bộ phận"
              defaultValue={(target as Employee)?.departmentId?._id ?? ""}
              name="departmentId"
              options={deptOptions.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <Select
              label="Chức vụ *"
              required
              placeholder="Chọn chức vụ"
              defaultValue={(target as Employee)?.positionId?._id ?? ""}
              name="positionId"
              options={posOptions.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <Input
              defaultValue={(target as Employee)?.email ?? ""}
              name="email"
              label="Email"
              type="email"
            />
            <Input
              defaultValue={(target as Employee)?.phone ?? ""}
              name="phone"
              label="Số điện thoại"
            />
            <Input
              defaultValue={
                (target as Employee)?.joinedAt
                  ? ((target as Employee)?.joinedAt ?? "").slice(0, 10)
                  : ""
              }
              name="joinedAt"
              label="Ngày vào làm"
              type="date"
            />
            <Select
              label="Trạng thái *"
              defaultValue={
                ((target as Employee)?.status ?? "ACTIVE") as string
              }
              name="status"
              options={[
                { value: "ACTIVE", label: "Đang làm việc" },
                { value: "ON_LEAVE", label: "Tạm nghỉ" },
                { value: "RESIGNED", label: "Đã nghỉ việc" },
              ]}
            />
            <Textarea
              defaultValue={(target as Employee)?.note ?? ""}
              name="note"
              label="Ghi chú"
              className="sm:col-span-2"
            />
          </>
        )}
        {isDept && (
          <>
            <Input
              defaultValue={(target as Department)?.code ?? ""}
              name="code"
              label="Mã bộ phận *"
              required
            />
            <Input
              defaultValue={(target as Department)?.name ?? ""}
              name="name"
              label="Tên bộ phận *"
              required
            />
            <Select
              label="Người phụ trách"
              placeholder="Chọn người phụ trách"
              defaultValue={(target as Department)?.managerKeeperId?._id ?? ""}
              name="managerKeeperId"
              options={deptOptions.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <Textarea
              name="description"
              label="Mô tả"
              className="sm:col-span-2"
            />
          </>
        )}
        {!isEmp && !isDept && (
          <>
            <Input
              defaultValue={(target as Position)?.code ?? ""}
              name="code"
              label="Mã chức vụ *"
              required
            />
            <Input
              defaultValue={(target as Position)?.name ?? ""}
              name="name"
              label="Tên chức vụ *"
              required
            />
            <Textarea
              defaultValue={(target as Position)?.description ?? ""}
              name="description"
              label="Mô tả"
              className="sm:col-span-2"
            />
          </>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Lưu</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowForm(false);
              setEditing(null);
            }}
          >
            Hủy
          </Button>
        </div>
      </form>
    );
  };
  const renderEmployees = () => (
    <>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          label=""
          placeholder="Tìm mã nhân viên, họ tên, email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          label=""
          placeholder="Bộ phận"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          options={deptOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Select
          label=""
          placeholder="Chức vụ"
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          options={posOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Select
          label=""
          placeholder="Trạng thái"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "ACTIVE", label: "Đang làm việc" },
            { value: "ON_LEAVE", label: "Tạm nghỉ" },
            { value: "RESIGNED", label: "Đã nghỉ việc" },
          ]}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Mã nhân viên",
                "Họ tên",
                "Bộ phận",
                "Chức vụ",
                "Email",
                "Số điện thoại",
                "Trạng thái",
                "Thao tác",
              ].map((h) => (
                <th className="p-3 text-left" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr className="border-t" key={emp._id}>
                <td className="p-3 font-medium">{employeeCode(emp)}</td>
                <td className="p-3">{employeeName(emp)}</td>
                <td className="p-3">{emp.departmentId?.name ?? "—"}</td>
                <td className="p-3">{emp.positionId?.name ?? "—"}</td>
                <td className="p-3">{emp.email ?? "—"}</td>
                <td className="p-3">{emp.phone ?? "—"}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(emp.status)}`}
                  >
                    {STATUS_LABEL[emp.status ?? ""] ?? "—"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openDetail(emp)}
                    >
                      <Eye /> Xem chi tiết
                    </Button>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(emp)}
                      >
                        Sửa
                      </Button>
                    )}
                    {canManage && emp.status !== "RESIGNED" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void markResigned(emp)}
                      >
                        Nghỉ việc
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!employees.length && !loading && (
          <p className="p-8 text-center text-muted-foreground">
            <Users className="mx-auto mb-2" /> Chưa có nhân viên.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Trước
        </Button>
        <span className="text-sm text-muted-foreground">
          Trang {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </Button>
      </div>
    </>
  );

  const renderDepartments = () => (
    <>
      <Input
        className="max-w-sm"
        label=""
        placeholder="Tìm mã hoặc tên bộ phận..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Mã bộ phận",
                "Tên bộ phận",
                "Người phụ trách",
                "Số nhân viên",
                "Trạng thái",
                "Thao tác",
              ].map((h) => (
                <th className="p-3 text-left" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depts
              .filter((d) =>
                q.trim()
                  ? d.code?.toLowerCase().includes(q.trim().toLowerCase()) ||
                    d.name?.toLowerCase().includes(q.trim().toLowerCase())
                  : true,
              )
              .map((d) => (
                <tr className="border-t" key={d._id}>
                  <td className="p-3 font-medium">{d.code ?? "—"}</td>
                  <td className="p-3">{d.name}</td>
                  <td className="p-3">
                    {d.managerKeeperId?.displayName ?? "—"}
                  </td>
                  <td className="p-3">{deptCounts[d._id] ?? 0}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.isActive ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
                    >
                      {d.isActive ? "Hoạt động" : "Ngừng hoạt động"}
                    </span>
                  </td>
                  <td className="p-3">
                    {canManage && (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(d)}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void toggleActive(d, !!d.isActive)}
                        >
                          {d.isActive ? "Ngừng SD" : "Kích hoạt"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!depts.length && !loading && (
          <p className="p-8 text-center text-muted-foreground">
            <Building2 className="mx-auto mb-2" /> Chưa có bộ phận.
          </p>
        )}
      </div>
    </>
  );

  const renderPositions = () => (
    <>
      <Input
        className="max-w-sm"
        label=""
        placeholder="Tìm chức vụ..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Mã chức vụ",
                "Tên chức vụ",
                "Mô tả",
                "Số nhân viên",
                "Trạng thái",
                "Thao tác",
              ].map((h) => (
                <th className="p-3 text-left" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions
              .filter((p) =>
                q.trim()
                  ? p.code?.toLowerCase().includes(q.trim().toLowerCase()) ||
                    p.name?.toLowerCase().includes(q.trim().toLowerCase())
                  : true,
              )
              .map((p) => (
                <tr className="border-t" key={p._id}>
                  <td className="p-3 font-medium">{p.code ?? "—"}</td>
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.description ?? "—"}</td>
                  <td className="p-3">{posCounts[p._id] ?? 0}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.isActive ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
                    >
                      {p.isActive ? "Hoạt động" : "Ngừng hoạt động"}
                    </span>
                  </td>
                  <td className="p-3">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(p)}
                      >
                        Sửa
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!positions.length && !loading && (
          <p className="p-8 text-center text-muted-foreground">
            <Briefcase className="mx-auto mb-2" /> Chưa có chức vụ.
          </p>
        )}
      </div>
    </>
  );
  const renderMain = () => {
    if (tab === "employees") return renderEmployees();
    if (tab === "departments") return renderDepartments();
    return renderPositions();
  };
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản lý nhân sự</h1>
          <p className="text-sm text-muted-foreground">
            Dùng chung cho Cấp phát, Mượn/trả, Điều chuyển, Thu hồi và tài
            khoản.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormError("");
              setShowForm(true);
            }}
          >
            <Plus /> Thêm{" "}
            {tab === "employees"
              ? "nhân viên"
              : tab === "departments"
                ? "bộ phận"
                : "chức vụ"}
          </Button>
        )}
      </header>

      {formError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <div className="flex gap-2 border-b">
        <Button
          variant={tab === "employees" ? "default" : "ghost"}
          onClick={() => setTab("employees")}
        >
          <UserRound className="h-4 w-4" /> Nhân viên
        </Button>
        <Button
          variant={tab === "departments" ? "default" : "ghost"}
          onClick={() => setTab("departments")}
        >
          <Building2 className="h-4 w-4" /> Bộ phận / Phòng ban
        </Button>
        <Button
          variant={tab === "positions" ? "default" : "ghost"}
          onClick={() => setTab("positions")}
        >
          <Briefcase className="h-4 w-4" /> Chức vụ
        </Button>
      </div>

      {showForm && renderForm()}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        renderMain()
      )}

      <Dialog
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
        title={`Hồ sơ nhân viên ${detail ? employeeCode(detail) : ""}`}
        className="max-w-4xl"
      >
        {detail && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 font-semibold">Thông tin cá nhân</h3>
              <dl className="grid gap-3 md:grid-cols-2">
                {Object.entries({
                  "Mã nhân viên": employeeCode(detail),
                  "Họ tên": employeeName(detail),
                  Email: detail.email,
                  "Điện thoại": detail.phone,
                  "Bộ phận": detail.departmentId?.name,
                  "Chức vụ": detail.positionId?.name,
                  "Trạng thái": STATUS_LABEL[detail.status ?? ""] ?? "—",
                  "Ngày vào làm": detail.joinedAt
                    ? formatDate(detail.joinedAt)
                    : "—",
                  "Ghi chú": detail.note,
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-medium">{k}</dt>
                    <dd className="whitespace-pre-wrap text-muted-foreground">
                      {v || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">
                Tài sản đang giữ ({heldDevices.length})
              </h3>
              {detailLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              ) : heldDevices.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {[
                          "Mã tài sản",
                          "Tên thiết bị",
                          "Serial",
                          "Trạng thái",
                        ].map((h) => (
                          <th className="p-2 text-left" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heldDevices.map((d) => (
                        <tr className="border-t" key={d._id}>
                          <td className="p-2 font-medium">
                            {d.assetCode ?? "—"}
                          </td>
                          <td className="p-2">{d.modelId?.name ?? "—"}</td>
                          <td className="p-2">{d.serial ?? "—"}</td>
                          <td className="p-2">
                            {USAGE_LABEL[d.usageStatus ?? ""] ??
                              d.usageStatus ??
                              "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Không giữ tài sản nào.
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Lịch sử thiết bị</h3>
              {detailLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              ) : history.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {[
                          "Ngày",
                          "Nghiệp vụ",
                          "Mã phiếu",
                          "Tài sản",
                          "Trạng thái",
                        ].map((h) => (
                          <th className="p-2 text-left" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((o) => (
                        <tr className="border-t" key={o._id}>
                          <td className="p-2">{formatDate(o.operationDate)}</td>
                          <td className="p-2">
                            {OPERATION_LABEL[o.type] ?? o.type}
                          </td>
                          <td className="p-2 font-medium">{o.code}</td>
                          <td className="p-2">
                            {o.lines
                              .slice(0, 2)
                              .map((l) => l.deviceId?.assetCode ?? l.kind)
                              .join(", ") || "—"}
                          </td>
                          <td className="p-2">
                            {o.status === "COMPLETED"
                              ? "Hoàn tất"
                              : o.status === "DRAFT"
                                ? "Nháp"
                                : o.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Chưa có lịch sử.
                </p>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </main>
  );
}
