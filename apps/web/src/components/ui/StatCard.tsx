import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  sub?: string
  tone?: 'cyan' | 'green' | 'amber' | 'rose' | 'violet'
}

export function StatCard({ label, sub, tone = 'cyan', value }: StatCardProps) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  )
}
