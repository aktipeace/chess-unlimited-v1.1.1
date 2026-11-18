type ProgressBarProps = {
  label: string
  value: number
  max: number
  /** Optional readable alternative, for example "3 of 12 solved". */
  valueText?: string
}

/** Accessible progress bar; an empty `max` renders as an empty track. */
export function ProgressBar({ label, value, max, valueText }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="ui-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={valueText}>
      <i style={{ width: `${percent}%` }} />
    </div>
  )
}
