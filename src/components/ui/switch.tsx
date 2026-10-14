"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

/** Approved Visual Direction 2 toggle: 36×20, white thumb, grey-lilac off, violet on. */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-switch-off transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-switch-on",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-px rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform data-checked:translate-x-[17px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
