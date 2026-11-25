"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  resizable?: boolean
  disableResize?: boolean
  minWidth?: number
  maxWidth?: number
  initialWidth?: number
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  (
    {
      className,
      children,
      resizable = true,
      disableResize = false,
      minWidth = 56,
      maxWidth = 960,
      initialWidth,
      style,
      ...props
    },
    ref
  ) => {
    const [width, setWidth] = React.useState<number | null>(initialWidth ?? null)
    const [isResizing, setIsResizing] = React.useState(false)
    const startXRef = React.useRef(0)
    const startWidthRef = React.useRef(0)
    const resizingRef = React.useRef(false)

    const beginResize = React.useCallback((clientX: number, element: HTMLTableCellElement | null) => {
      if (!element) return
      resizingRef.current = true
      setIsResizing(true)
      startXRef.current = clientX
      startWidthRef.current = width ?? element.getBoundingClientRect().width
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }, [width])

    React.useEffect(() => {
      if (!resizable || disableResize) return

      function onMove(event: MouseEvent) {
        if (!resizingRef.current) return
        const delta = event.clientX - startXRef.current
        const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta))
        setWidth(next)
      }

      function onUp() {
        if (!resizingRef.current) return
        resizingRef.current = false
        setIsResizing(false)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
      return () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }, [disableResize, maxWidth, minWidth, resizable])

    return (
      <th
        ref={ref}
        className={cn(
          "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
          resizable && !disableResize && "relative",
          className
        )}
        data-resizing={isResizing ? "true" : "false"}
        style={{
          ...style,
          width: width ?? style?.width,
          minWidth: width ?? style?.minWidth ?? minWidth,
          maxWidth: style?.maxWidth ?? maxWidth,
        }}
        {...props}
      >
        {children}
        {resizable && !disableResize ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize column"
            tabIndex={0}
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            aria-valuenow={Math.round(width ?? initialWidth ?? minWidth)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
              event.preventDefault()
              event.stopPropagation()
              const measured = event.currentTarget.parentElement?.getBoundingClientRect().width ?? minWidth
              setWidth(current => {
                if (event.key === "Home") return minWidth
                if (event.key === "End") return maxWidth
                const next = (current ?? measured) + (event.key === "ArrowRight" ? 10 : -10)
                return Math.min(maxWidth, Math.max(minWidth, next))
              })
            }}
            onMouseDown={(event) => beginResize(event.clientX, event.currentTarget.parentElement as HTMLTableCellElement)}
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none"
          >
            <div className={cn(
              "absolute right-0 top-1/2 h-5 w-px -translate-y-1/2 bg-border/80 opacity-0 transition-opacity",
              isResizing && "opacity-100",
            )} />
          </div>
        ) : null}
      </th>
    )
  }
)
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
