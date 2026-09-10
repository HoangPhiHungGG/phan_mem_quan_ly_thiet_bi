"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        "fixed max-h-[80vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border bg-card p-6 text-foreground shadow-lg backdrop:bg-black/50",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onOpenChange(false);
        }
      }}
    >
      {title && (
        <h2 id={titleId} className="pr-8 text-lg font-semibold">
          {title}
        </h2>
      )}
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <div className={title ? "mt-4" : ""}>{children}</div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted"
        aria-label="Đóng"
      >
        <X className="h-4 w-4" />
      </button>
    </dialog>
  );
}
