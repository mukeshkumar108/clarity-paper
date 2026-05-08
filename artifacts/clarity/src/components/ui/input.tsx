import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[36px] w-full rounded-none border border-muted-stone bg-transparent px-[8px] py-[6px] text-inkwell shadow-none transition-all placeholder:text-muted-stone focus-visible:outline-none focus-visible:border-inkwell disabled:cursor-not-allowed disabled:opacity-50 text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
