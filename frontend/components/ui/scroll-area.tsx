import * as React from "react";

import { cn } from "@/lib/utils";

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
  viewportRef?: React.Ref<HTMLDivElement>;
};

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, viewportRef, ...props }, ref) => (
    <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
      <div
        ref={viewportRef}
        className="h-full overflow-y-auto pr-2 [scrollbar-color:rgba(148,163,184,0.75)_transparent] [scrollbar-width:thin]"
      >
        {children}
      </div>
    </div>
  ),
);
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
