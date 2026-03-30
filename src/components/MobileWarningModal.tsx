"use client";

import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Monitor } from "lucide-react";

interface MobileWarningModalProps {
  open: boolean;
  onProceed: () => void;
  onOpenChange: (open: boolean) => void;
}

export function MobileWarningModal({ open, onProceed, onOpenChange }: MobileWarningModalProps) {
  const router = useRouter();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm mx-4">
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
              <Monitor className="w-6 h-6 text-accent-foreground" />
            </div>
          </div>
          <AlertDialogTitle className="text-center">Best on Desktop</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            This feature involves drawing regions and detailed editing. It&apos;s best experienced on a larger screen with a mouse or trackpad.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={() => router.push("/")}
            className="w-full"
          >
            Switch to Desktop
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={onProceed}
            className="w-full mt-0"
          >
            Proceed anyway
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Hook: returns true if on mobile */
export function useMobileWarning() {
  const isMobile = useIsMobile();
  return isMobile;
}
