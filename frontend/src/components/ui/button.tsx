import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-[0.75rem] text-sm font-medium tracking-tight ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-[transform,box-shadow,background-color,color,border-color] duration-300 ease-out",
  {
    variants: {
      variant: {
        // Ink primary with a rotating aurora border on hover
        default:
          "shimmer bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.12),_0_6px_24px_-8px_hsl(var(--primary)/0.4)] hover:-translate-y-[1px] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.16),_0_12px_32px_-8px_hsl(var(--primary)/0.5)] active:translate-y-0",
        // Aurora gradient primary — for special moments
        aurora:
          "shimmer text-white shadow-[0_10px_40px_-10px_hsl(var(--aurora-1)/0.55)] hover:-translate-y-[1px] hover:shadow-[0_16px_48px_-10px_hsl(var(--aurora-1)/0.65)] bg-[linear-gradient(115deg,hsl(var(--aurora-5)),hsl(var(--aurora-1))_40%,hsl(var(--aurora-4)))] [background-size:200%_100%] bg-left hover:bg-right [transition:background-position_700ms_ease,transform_300ms,box-shadow_300ms]",
        // Glass outline — transparent, sits on aurora bg
        glass:
          "shimmer glass text-foreground hover:-translate-y-[1px]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_6px_20px_-6px_hsl(var(--destructive)/0.4)] hover:bg-destructive/90 hover:-translate-y-[1px]",
        outline:
          "border border-border bg-background/60 backdrop-blur-md hover:bg-accent hover:text-accent-foreground hover:border-foreground/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-foreground/[0.04] hover:text-foreground",
        link:
          "text-foreground underline-offset-4 hover:underline decoration-foreground/30 hover:decoration-foreground",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-[0.6rem] px-3.5",
        lg: "h-12 rounded-[0.9rem] px-7 text-[0.95rem]",
        xl: "h-14 rounded-[1rem] px-9 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {children}
          </span>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
