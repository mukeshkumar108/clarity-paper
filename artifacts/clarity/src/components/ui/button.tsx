import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-inkwell text-canvas-parchment border border-inkwell shadow-subtle hover:-translate-y-px hover:bg-inkwell/92",
        destructive:
          "border border-red-600 bg-red-600 text-white shadow-subtle hover:bg-red-700",
        outline:
          "border border-pebble-gray bg-white/80 text-inkwell hover:border-inkwell/30 hover:bg-white",
        secondary:
          "border border-pebble-gray bg-pebble-gray/35 text-inkwell hover:bg-pebble-gray/55 hover:border-muted-stone",
        ghost: 
          "bg-transparent text-inkwell border-none hover:bg-pebble-gray/45",
        link: "text-onyx-outline underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-12 px-5 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
