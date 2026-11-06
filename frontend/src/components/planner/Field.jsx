import { useId } from 'react'

// Labelled input with an error message wired up through aria-describedby.
export default function Field({ label, error, hint, children }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-red-500 mt-1">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11px] dark:text-gray-500 text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  )
}
