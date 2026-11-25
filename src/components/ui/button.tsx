import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 border-ink text-sm font-extrabold tracking-tight transition-[transform,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)] active:translate-y-0.5 active:shadow-[2px_2px_0_var(--ink)]",
        secondary: "bg-secondary text-secondary-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)]",
        accent: "bg-accent text-accent-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)]",
        outline: "bg-card text-foreground shadow-[3px_3px_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--ink)]",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground shadow-[4px_4px_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)]",
        link: "min-h-0 border-transparent bg-transparent px-0 py-0 text-primary underline underline-offset-4 shadow-none hover:text-pink",
      },
      size: {
        default: "h-control px-4",
        sm: "h-control-sm rounded-lg px-3",
        lg: "h-13 min-h-13 rounded-2xl px-7 text-base",
        "icon-sm": "size-control-sm rounded-lg p-0",
        icon: "size-control p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
export { buttonVariants };
