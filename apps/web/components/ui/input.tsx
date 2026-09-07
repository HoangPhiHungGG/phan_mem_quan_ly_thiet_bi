"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const baseControl =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export function Input({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input className={cn(baseControl, className)} {...props} />
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea className={cn(baseControl, className)} {...props} />
    </label>
  );
}

export type SelectOption = { value: string; label: string };

export function Select({
  label,
  options,
  placeholder,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select className={cn(baseControl, className)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
