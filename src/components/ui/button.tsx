import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-[7px] rounded-sm font-mono text-[11px] font-bold tracking-[.06em] uppercase whitespace-nowrap transition-[opacity,transform] outline-none select-none hover:opacity-85 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "border border-border-hi bg-secondary text-secondary-foreground",
        ghost: "bg-transparent text-text-3 hover:bg-bg-3 hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        link: "normal-case tracking-normal text-primary underline-offset-4 hover:underline hover:opacity-100",
      },
      size: {
        default: "px-[18px] py-[9px]",
        xs: "px-2 py-1 text-[10px]",
        sm: "px-3 py-1.5 text-[10px]",
        lg: "px-6 py-3",
        icon: "size-8 p-0",
        "icon-xs": "size-6 p-0",
        "icon-sm": "size-7 p-0",
        "icon-lg": "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
