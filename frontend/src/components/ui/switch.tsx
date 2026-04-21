import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Base track
      "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
      "transition-all duration-300 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--aurora-1))]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Unchecked: soft glass track with inset shadow
      "data-[state=unchecked]:bg-foreground/[0.08] data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]",
      // Checked: aurora gradient with ambient glow
      "data-[state=checked]:bg-[linear-gradient(135deg,hsl(var(--aurora-5)),hsl(var(--aurora-1))_55%,hsl(var(--aurora-4)))]",
      "data-[state=checked]:shadow-[0_0_0_1px_hsl(var(--aurora-1)/0.35),0_6px_20px_-6px_hsl(var(--aurora-1)/0.55),inset_0_1px_0_rgba(255,255,255,0.25)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white",
        "shadow-[0_2px_6px_rgba(17,18,35,0.25),0_0_0_0.5px_rgba(17,18,35,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]",
        "transition-transform duration-300 ease-out",
        "data-[state=checked]:translate-x-[1.375rem] data-[state=unchecked]:translate-x-0.5"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
