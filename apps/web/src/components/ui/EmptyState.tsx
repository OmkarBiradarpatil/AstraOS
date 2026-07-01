import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  body: string
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ action, body, icon, title }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-icon">{icon}</span>}
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}
