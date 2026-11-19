import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-base shadow-none transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/80 focus-visible:border-[#007aff] focus-visible:ring-[3px] focus-visible:ring-[#007aff]/20 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
