import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  renderId: string | null;
}

export function FeedbackModal({ open, onClose, renderId }: FeedbackModalProps) {
  const [expectation, setExpectation] = useState("");
  const [reality, setReality] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!expectation.trim() && !reality.trim()) { onClose(); return; }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("render_feedback" as never).insert({
        render_id: renderId || null,
        user_id: session?.user?.id || null,
        expectation: expectation.trim() || null,
        reality: reality.trim() || null,
        rating: "thumbs_down",
      } as never);
      toast.success("Thanks for your feedback!");
    } catch {
      toast.error("Failed to send feedback.");
    } finally {
      setSending(false);
      setExpectation("");
      setReality("");
      onClose();
    }
  };

  const handleSkip = () => {
    setExpectation("");
    setReality("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">What went wrong?</DialogTitle>
          <DialogDescription>Help us improve by sharing what you expected vs. what you got. Both fields are optional.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">What did you expect?</label>
            <Textarea
              placeholder="e.g. A warm, photorealistic watercolor style with soft shadows…"
              value={expectation}
              onChange={(e) => setExpectation(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">What did you get instead?</label>
            <Textarea
              placeholder="e.g. The output was too dark and lacked detail in the walls…"
              value={reality}
              onChange={(e) => setReality(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleSkip}>Skip</Button>
            <Button className="flex-1" onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : "Send Feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
