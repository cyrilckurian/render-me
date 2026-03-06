import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface PromptBarProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  floorPlanPreview: string;
  styleName?: string;
  isCustom?: boolean;
}

export function PromptBar({ value, onChange, onSend, floorPlanPreview, styleName, isCustom }: PromptBarProps) {
  const canSend = value.trim().length > 0;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="border-t border-border bg-card px-4 py-4"
    >
      <div className="max-w-3xl mx-auto">
        {/* Style tag */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm">
            <img src={floorPlanPreview} alt="" className="w-5 h-5 rounded object-cover" />
            <span className="text-muted-foreground">Floor plan</span>
          </div>
          {styleName && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-primary font-medium">{styleName}</span>
            </div>
          )}
          {isCustom && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-primary font-medium">Custom Style</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-end gap-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isCustom ? "Describe the rendering style you want to create..." : "Edit the prompt or hit send to generate..."}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canSend) {
                e.preventDefault();
                onSend(value);
              }
            }}
          />
          <button
            onClick={() => canSend && onSend(value)}
            disabled={!canSend}
            className={`
              flex-shrink-0 p-3 rounded-lg transition-all
              ${canSend
                ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                : "bg-muted text-muted-foreground cursor-not-allowed"
              }
            `}
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
