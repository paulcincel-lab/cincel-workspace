"use client"

import * as React from "react"

const FormFieldIdContext = React.createContext<string | undefined>(undefined)

/**
 * Groups one label with one control. Label, Input, Textarea and SelectTrigger rendered inside pick up
 * a shared generated id (htmlFor on the label, id on the control), so the control gets an accessible
 * name without wiring ids by hand. Use one FormField per control; an explicit id/htmlFor still wins.
 */
function FormField({ id, children, ...props }: React.ComponentProps<"div">) {
  const generatedId = React.useId()
  return (
    <FormFieldIdContext.Provider value={id ?? generatedId}>
      <div data-slot="form-field" {...props}>
        {children}
      </div>
    </FormFieldIdContext.Provider>
  )
}

function useFormFieldId(): string | undefined {
  return React.useContext(FormFieldIdContext)
}

export { FormField, useFormFieldId }
