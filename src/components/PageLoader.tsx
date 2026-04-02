"use client";

import { motion } from "framer-motion";

export function PageLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Spinner */}
        <div className="relative w-10 h-10">
          <svg
            className="animate-spin"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="hsl(var(--muted))"
              strokeWidth="4"
            />
            <path
              d="M20 4 A16 16 0 0 1 36 20"
              stroke="hsl(var(--primary))"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span className="font-display text-sm font-semibold tracking-tight text-muted-foreground">
          renderme
        </span>
      </div>
    </motion.div>
  );
}
