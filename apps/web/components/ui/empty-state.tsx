"use client";

import { ChevronRight, PackageIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type EmptyStateVariant = "default" | "notImplemented";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  variant = "default",
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const showNotImplemented = variant === "notImplemented";

  return (
    <div
      className={cn(
        "mx-auto flex max-w-lg flex-col items-center justify-center rounded-lg border bg-card p-6 text-center shadow-sm",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 rounded-full bg-muted p-3">{icon}</div>
      ) : (
        <div className="mb-4 rounded-full bg-muted p-3">
          <PackageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}

      {showNotImplemented && (
        <p className="mt-2 text-xs text-muted-foreground">
          Chức năng này sẽ được triển khai trong các bước tiếp theo.
        </p>
      )}

      {action && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={action.onClick}
          asChild={!!action.href}
        >
          {action.href ? (
            <a href={action.href} className="flex items-center gap-1">
              {action.label}
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          ) : (
            action.label
          )}
        </Button>
      )}
    </div>
  );
}
