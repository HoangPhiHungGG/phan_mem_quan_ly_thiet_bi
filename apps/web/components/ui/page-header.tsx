"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: "default" | "outline" | "secondary" | "ghost";
  };
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  action,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && (
          <Button
            variant={action.variant ?? "default"}
            size="sm"
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

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
