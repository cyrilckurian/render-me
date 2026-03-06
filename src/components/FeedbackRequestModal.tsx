import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquarePlus } from "lucide-react";

interface FeedbackRequestModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackRequestModal({ open, onClose }: FeedbackRequestModalProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!text.trim()) { onClose(); return; }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("render_feedback" as never).insert({
        user_id: session?.user?.id || null,
        expectation: text.trim(),
        reality: null,
        rating: "feature_request",
      } as never);
      toast.success("Thanks! We'll review your feedback.");
    } catch {
      toast.error("Failed to send feedback.");
    } finally {
      setSending(false);
      setText("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setText(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-primary" />
            Feedback or feature request
          </DialogTitle>
          <DialogDescription>
            Share what's on your mind — a bug, a missing feature, or anything else.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <Textarea
            placeholder="e.g. I'd love to be able to batch-render multiple floor plans at once…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="resize-none"
            rows={5}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setText(""); onClose(); }}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSend} disabled={sending || !text.trim()}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
