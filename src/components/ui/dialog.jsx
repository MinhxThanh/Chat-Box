// dialog.jsx
import * as React from "react"
import { X } from "lucide-react"
import { cva } from "class-variance-authority"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility to merge classes with variants
function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Dialog variants using class-variance-authority
const dialogVariants = cva(
  "fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full bg-background max-w-lg rounded-lg shadow-lg focus:outline-none",
  {
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

// Overlay style
const overlayClass = "fixed inset-0 z-40 bg-black/50"

// Dialog root context for traps and accessibility
const DialogContext = React.createContext()

export function Dialog({ open, onOpenChange, children, className }) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = ""
      }
    }
  }, [open])

  if (!open) return null
  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className={overlayClass} onClick={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(dialogVariants(), className)}
        tabIndex={-1}
        style={{ zIndex: 50 }}
      >
        {children}
      </div>
    </DialogContext.Provider>
  )
}

// Dialog Header
export function DialogHeader({ children, className }) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  )
}

// Dialog Title
export function DialogTitle({ children, className }) {
  return (
    <h2 className={cn("text-lg font-semibold", className)}>{children}</h2>
  )
}

// Dialog Description
export function DialogDescription({ children, className }) {
  return <p className={cn("text-sm text-gray-500", className)}>{children}</p>
}

// Dialog Close Button
export function DialogClose({ className }) {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <button
      type="button"
      className={cn(
        "absolute right-4 top-4 p-2 rounded hover:bg-gray-100 focus:outline-none",
        className
      )}
      aria-label="Close"
      onClick={() => onOpenChange(false)}
    >
      <X className="w-5 h-5" />
    </button>
  )
}

// Dialog Footer
export function DialogFooter({ children, className }) {
  return (
    <div className={cn("mt-6 flex justify-end gap-2", className)}>
      {children}
    </div>
  )
}
