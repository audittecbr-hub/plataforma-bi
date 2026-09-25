"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: `${defaultClassNames.root}`,
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "relative flex items-center justify-center pt-1",
        caption_label: "text-sm font-bold capitalize",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-1 top-1 z-10 grid size-7 place-items-center rounded-lg border border-input bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        button_next:
          "absolute right-1 top-1 z-10 grid size-7 place-items-center rounded-lg border border-input bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        chevron: "size-4",
        month_grid: "w-full border-collapse",
        weekdays: "flex w-full",
        weekday: "eyebrow flex size-9 items-center justify-center text-[10px] text-muted-foreground",
        weeks: "",
        week: "mt-1.5 flex w-full",
        day: "relative flex size-9 items-center justify-center p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button:
          "grid size-9 place-items-center rounded-lg p-0 font-normal tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:opacity-100",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-[var(--primary-hover)] [&>button:hover]:text-primary-foreground",
        today: "[&>button]:ring-1 [&>button]:ring-primary/40 [&>button]:font-medium",
        outside: "text-faint aria-selected:opacity-40",
        disabled: "text-faint opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        dropdowns: "flex items-center justify-center gap-1",
        dropdown: "cursor-pointer rounded-md border border-input bg-surface px-2 py-1 text-sm",
        months_dropdown: "",
        years_dropdown: "",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
