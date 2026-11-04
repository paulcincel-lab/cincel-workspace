"use client"

import { useFormFieldId } from "@/components/ui/shadcn/form-field"
import { cn } from "@/lib/utils"

function Label({ className, htmlFor, ...props }: React.ComponentProps<"label">) {
  const fieldId = useFormFieldId()
  return (
    <label
      htmlFor={htmlFor ?? fieldId}
      data-slot="label"
      className={cn(
        "text-sm font-medium text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
