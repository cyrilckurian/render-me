import { useCallback, useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, FileText } from "lucide-react";
import { motion } from "framer-motion";

interface FloorPlanUploadProps {
  preview: string | null;
  isPdf?: boolean;
  fileName?: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function FloorPlanUpload({ preview, isPdf, fileName, onUpload, onRemove }: FloorPlanUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isAccepted = (file: File) =>
    file.type.startsWith("image/") || file.type === "application/pdf";

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files[0] && isAccepted(files[0])) {
        onUpload(files[0]);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  if (preview) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative rounded-lg overflow-hidden border border-border bg-card max-w-md mx-auto"
      >
        {isPdf ? (
          <div className="w-full h-40 flex flex-col items-center justify-center bg-muted gap-3">
            <FileText className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground font-medium truncate max-w-[80%]">{fileName}</p>
          </div>
        ) : (
          <img src={preview} alt="Floor plan preview" className="w-full max-h-72 object-contain bg-muted" />
        )}
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isPdf ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            <span>{isPdf ? "PDF floor plan uploaded — first page will be rendered" : "Floor plan uploaded"}</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200
        ${isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
          <Upload className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-display font-semibold text-foreground">
            Upload your floor plan
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Drag & drop or click to browse · PNG, JPG, WEBP, PDF
          </p>
        </div>
      </div>
    </div>
  );
}
