import type { PropsWithChildren, ReactNode } from 'react'

interface CardProps {
  title?: string
  eyebrow?: string
  action?: ReactNode
  className?: string
}

export function Card({ action, children, className = '', eyebrow, title }: PropsWithChildren<CardProps>) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || eyebrow || action) && (
        <header className="card-header">
          <div>
            {eyebrow && <p className="card-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
