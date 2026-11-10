"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Accessible name of each thumb's range input. */
  thumbLabel?: string
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabel,
  ...props
}: SliderProps) {
  const thumbs = React.useMemo(
    () =>
      Array.isArray(value)
        ? value.length
        : Array.isArray(defaultValue)
          ? defaultValue.length
          : 1,
    [value, defaultValue]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("w-full", className)}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center py-2 select-none data-[disabled]:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full flex-1 overflow-hidden rounded-full bg-muted select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="h-full bg-primary select-none"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbs }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            getAriaLabel={thumbLabel ? () => thumbLabel : undefined}
            className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm transition-[box-shadow] select-none outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background data-[disabled]:cursor-not-allowed"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
