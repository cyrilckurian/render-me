"use client";

import { createContext, useContext } from "react";

interface SidebarContextValue {
  openOverlay: () => void;
  isLoggedIn: boolean;
}

export const SidebarContext = createContext<SidebarContextValue>({
  openOverlay: () => {},
  isLoggedIn: false,
});

export function useSidebar() {
  return useContext(SidebarContext);
}
