import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { compact?: boolean }>(
  ({ className, compact, type, ...props }, ref) => (
    <input
      type={type}
      data-compact={compact}
      className={cn(
        "block-input flex w-full text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
