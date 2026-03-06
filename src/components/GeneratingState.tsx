import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface GeneratingStateProps {
  styleName: string;
  /** Starting progress value (0–94). Use e.g. 25 to give impression render was already in progress. */
  initialProgress?: number;
  /** Override the heading text */
  headingText?: string;
}

export function GeneratingState({ styleName, initialProgress = 0, headingText }: GeneratingStateProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const DURATION = 90000;
    const INTERVAL = 400;
    const steps = DURATION / INTERVAL;

    // Fast phase: animate from 0 → initialProgress in ~2 seconds
    const fastSteps = initialProgress > 0 ? Math.ceil(2000 / INTERVAL) : 0;
    let current = 0;

    const timer = setInterval(() => {
      current += 1;
      let pct: number;
      if (current <= fastSteps && initialProgress > 0) {
        // Quick ramp to initialProgress
        pct = Math.round((current / fastSteps) * initialProgress);
      } else {
        // Normal slow progression from initialProgress toward 95%
        const slowCurrent = current - fastSteps;
        pct = Math.min(95, Math.round((1 - Math.exp((-2 * slowCurrent) / steps)) * 100) + initialProgress);
      }
      setProgress(Math.min(95, pct));
      if (pct >= 95) clearInterval(timer);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [initialProgress]);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Circular progress */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" width="128" height="128" viewBox="0 0 128 128">
          {/* Track */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="6"
          />
          {/* Progress */}
          <motion.circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </svg>
        <span className="font-display text-2xl font-bold text-foreground tabular-nums">
          {progress}%
        </span>
      </div>

      <div className="text-center">
        <h3 className="font-display text-xl font-bold text-foreground mb-2">
          {headingText ?? "Generating your render"}
        </h3>
        <p className="text-muted-foreground text-sm">
          Applying <span className="font-medium text-foreground">{styleName}</span> style to your floor plan...
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          This may take up to 90 seconds.
        </p>
      </div>
    </div>
  );
}
