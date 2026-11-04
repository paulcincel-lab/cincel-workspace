"use client"

import { useFormFieldId } from "@/components/ui/shadcn/form-field"
import { cn } from "@/lib/utils"

function Textarea({ className, id, ...props }: React.ComponentProps<"textarea">) {
  const fieldId = useFormFieldId()
  return (
    <textarea
      id={id ?? fieldId}
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
