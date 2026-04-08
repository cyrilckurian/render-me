"use client";

import { createContext, useContext } from "react";

interface SidebarContextValue {
  openOverlay: () => void;
  isLoggedIn: boolean;
  userId: string | null;
  authReady: boolean;
  setIsGenerating: (v: boolean) => void;
}

export const SidebarContext = createContext<SidebarContextValue>({
  openOverlay: () => {},
  isLoggedIn: false,
  userId: null,
  authReady: false,
  setIsGenerating: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}
