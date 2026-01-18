import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export type ImageCardProps = {
  caption: string
  imageUrl?: string
  children?: ReactNode
  className?: string
}

export function ImageCard({ caption, imageUrl, children, className }: ImageCardProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex h-full flex-col border-2 border-slate-900 bg-white shadow-[4px_4px_0px_#0f172a] transition hover:-translate-y-1 hover:shadow-[6px_6px_0px_#0f172a]',
        className
      )}
    >
      <div className="relative overflow-hidden border-b-2 border-slate-900 bg-amber-100">
        {imageUrl ? (
          <img src={imageUrl} alt={caption} className="h-52 w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-52 w-full items-center justify-center text-sm font-semibold uppercase tracking-wide text-slate-600">
            Image unavailable
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-base font-black uppercase tracking-wide text-slate-900">{caption}</p>
        {children}
      </div>
    </div>
  )
}
