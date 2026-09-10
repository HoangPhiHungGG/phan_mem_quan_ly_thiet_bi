"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

export type CurrentUser = {
  id: string;
  employeeCode: string;
  email: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
  primaryDepartmentId?: string;
  roleCodes: string[];
  permissions: string[];
  scopes: Array<{
    departmentMode: string;
    departmentIds: string[];
    warehouseMode: string;
    warehouseIds: string[];
  }>;
};

type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  hasPermission(permission: string): boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ user: CurrentUser }>("/api/auth/me");
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname === "/dang-nhap") {
      setLoading(false);
      return;
    }
    void refresh();
  }, [pathname, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<{ user: CurrentUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
      hasPermission: (permission) =>
        Boolean(user?.permissions.includes(permission)),
    }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải nằm trong AuthProvider");
  return value;
}
