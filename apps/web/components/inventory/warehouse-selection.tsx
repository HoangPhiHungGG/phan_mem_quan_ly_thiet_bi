"use client";

import { createContext, useContext } from "react";

const WarehouseSelectionContext = createContext<string | null>(null);

export function WarehouseSelectionProvider({
  warehouseId,
  children,
}: {
  warehouseId: string;
  children: React.ReactNode;
}) {
  return (
    <WarehouseSelectionContext.Provider value={warehouseId}>
      {children}
    </WarehouseSelectionContext.Provider>
  );
}

export function useWarehouseSelection() {
  return useContext(WarehouseSelectionContext);
}
