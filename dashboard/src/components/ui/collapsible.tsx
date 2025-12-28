import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '../../lib/utils'

type CollapsibleContextValue = {
  open: boolean
  toggle: () => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null)

function useCollapsible(): CollapsibleContextValue {
  const context = React.useContext(CollapsibleContext)
  if (!context) {
    throw new Error('Collapsible components must be used within <Collapsible>')
  }
  return context
}

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean
}

const Collapsible = ({ defaultOpen = false, className, children, ...props }: CollapsibleProps): JSX.Element => {
  const [open, setOpen] = React.useState(defaultOpen)

  const value = React.useMemo<CollapsibleContextValue>(
    () => ({
      open,
      toggle: () => setOpen((previous) => !previous)
    }),
    [open]
  )

  return (
    <CollapsibleContext.Provider value={value}>
      <div className={cn('group/collapsible', className)} data-state={open ? 'open' : 'closed'} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ className, children, asChild, onClick, ...props }, ref) => {
    const { open, toggle } = useCollapsible()
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        className={cn('flex items-center gap-2', className)}
        data-state={open ? 'open' : 'closed'}
        onClick={(event) => {
          onClick?.(event)
          toggle()
        }}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
CollapsibleTrigger.displayName = 'CollapsibleTrigger'

const CollapsibleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { open } = useCollapsible()

    return (
      <div
        ref={ref}
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:hidden',
          className
        )}
        data-state={open ? 'open' : 'closed'}
        {...props}
      >
        {children}
      </div>
    )
  }
)
CollapsibleContent.displayName = 'CollapsibleContent'

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
