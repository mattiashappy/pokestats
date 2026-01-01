import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { cn } from '../../lib/utils'

const dialogBaseClasses =
  'relative z-50 grid w-full max-w-2xl gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900'

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error('Dialog components must be used within a Dialog')
  return ctx
}

type DialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? Boolean(open) : internalOpen

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  const value = React.useMemo(() => ({ open: resolvedOpen, setOpen }), [resolvedOpen, setOpen])

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
}

type DialogTriggerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  asChild?: boolean
  children: React.ReactNode
  onClick?: (event: React.MouseEvent<Element>) => void
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const { setOpen } = useDialogContext()

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        ref,
        onClick: (event: React.MouseEvent<Element>) => {
          onClick?.(event)
          if (!event.defaultPrevented) setOpen(true)
          if (React.isValidElement(children) && typeof children.props.onClick === 'function') {
            children.props.onClick(event)
          }
        },
      })
    }

    return (
      <button
        type="button"
        ref={ref}
        {...props}
        onClick={(event: React.MouseEvent<Element>) => {
          onClick?.(event)
          if (!event.defaultPrevented) setOpen(true)
        }}
      >
        {children}
      </button>
    )
  },
)
DialogTrigger.displayName = 'DialogTrigger'

type DialogContentProps = React.HTMLAttributes<HTMLDivElement>

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useDialogContext()

    if (!open) return null

    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          aria-hidden
          onClick={() => setOpen(false)}
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(dialogBaseClasses, className)}
          {...props}
        >
          {children}
        </div>
      </div>,
      document.body,
    )
  },
)
DialogContent.displayName = 'DialogContent'

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>( (
  { className, ...props },
  ref,
) => <h2 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />,
)
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>( (
  { className, ...props },
  ref,
) => <p ref={ref} className={cn('text-sm text-slate-600 dark:text-slate-400', className)} {...props} />,
)
DialogDescription.displayName = 'DialogDescription'

const DialogClose = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const { setOpen } = useDialogContext()

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        ref,
        onClick: (event: React.MouseEvent<Element>) => {
          onClick?.(event)
          setOpen(false)
          if (React.isValidElement(children) && typeof children.props.onClick === 'function') {
            children.props.onClick(event)
          }
        },
      })
    }

    return (
      <button
        type="button"
        ref={ref}
        {...props}
        onClick={(event: React.MouseEvent<Element>) => {
          onClick?.(event)
          setOpen(false)
        }}
      >
        {children}
      </button>
    )
  },
)
DialogClose.displayName = 'DialogClose'

const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>

const DialogOverlay = () => null

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
