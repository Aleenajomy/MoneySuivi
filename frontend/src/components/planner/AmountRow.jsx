import { useEffect, useId, useState } from 'react'
import { amountError } from '../../utils/planner'

/**
 * One editable planning amount. It saves when the field loses focus (or on Enter) and only if the
 * value changed and is valid; the saved figure is never a payment.
 */
export default function AmountRow({ label, hint, value, onSave, children }) {
  const id = useId()
  const [draft, setDraft] = useState(String(value ?? ''))
  const [error, setError] = useState('')
  useEffect(() => {
    setDraft(String(value ?? ''))
    setError('')
  }, [value])

  const commit = async () => {
    const text = draft.trim()
    const message = amountError(text, { label })
    setError(message)
    if (message || Number(text) === Number(value)) return
    try {
      await onSave(text)
    } catch {
      setDraft(String(value ?? ''))
    }
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 text-sm font-semibold dark:text-gray-200 text-slate-700">
          {label}
          {hint && <span className="block text-[11px] font-normal dark:text-gray-500 text-slate-400">{hint}</span>}
        </label>
        <div className="relative w-32 flex-shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm dark:text-gray-500 text-slate-400" aria-hidden="true">₹</span>
          <input
            id={id}
            className="input !pl-7 text-right tabular-nums"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={draft}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </div>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-[11px] text-red-500 mt-1 text-right">{error}</p>}
      {children}
    </div>
  )
}
