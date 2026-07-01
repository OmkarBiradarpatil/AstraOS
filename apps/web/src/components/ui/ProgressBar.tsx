interface ProgressBarProps {
  value: number
  label: string
}

export function ProgressBar({ label, value }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div className="progress-block" aria-label={`${label}: ${Math.round(pct)} percent`}>
      <div className="progress-label">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
