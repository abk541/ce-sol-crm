import { Calendar, X } from 'lucide-react'
import type { MandatoryEvent } from '../../types'

export function makeMandatoryEvent(partial: Partial<MandatoryEvent> = {}): MandatoryEvent {
  return {
    id: crypto.randomUUID(),
    label: partial.label ?? '',
    date: partial.date ?? '',
    time: partial.time ?? '',
  }
}

export function MandatoryEventsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: MandatoryEvent[] | undefined
  onChange: (next: MandatoryEvent[]) => void
  disabled?: boolean
}) {
  const list = value ?? []
  const update = (id: string, patch: Partial<MandatoryEvent>) =>
    onChange(list.map(e => (e.id === id ? { ...e, ...patch } : e)))
  const remove = (id: string) => onChange(list.filter(e => e.id !== id))
  const add = () => onChange([...list, makeMandatoryEvent()])

  return (
    <div className="space-y-2">
      {list.length === 0 && (
        <p className="text-xs italic text-slate-400">No mandatory events yet.</p>
      )}
      {list.map(ev => (
        <div key={ev.id} className="flex items-center gap-2">
          <input
            type="text"
            value={ev.label}
            onChange={e => update(ev.id, { label: e.target.value })}
            placeholder="Event name (e.g., Site visit)"
            className="input-field flex-1"
            disabled={disabled}
          />
          <input
            type="date"
            value={ev.date}
            onChange={e => update(ev.id, { date: e.target.value })}
            className="input-field w-[150px]"
            disabled={disabled}
          />
          <input
            type="time"
            value={ev.time ?? ''}
            onChange={e => update(ev.id, { time: e.target.value })}
            className="input-field w-[110px]"
            disabled={disabled}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(ev.id)}
              className="rounded-md p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
              title="Remove event">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={add}
          className="text-xs font-semibold text-indigo-600 hover:underline">
          + Add event
        </button>
      )}
    </div>
  )
}

export function MandatoryEventsList({
  events,
  legacy,
  toneDark = true,
}: {
  events?: MandatoryEvent[]
  legacy?: string
  toneDark?: boolean
}) {
  if (events && events.length) {
    return (
      <ul className="space-y-1.5">
        {events.map(ev => (
          <li
            key={ev.id}
            className={`flex flex-wrap items-center gap-2 text-sm ${toneDark ? 'text-slate-200' : 'text-slate-700'}`}>
            <Calendar size={12} className="text-amber-400" />
            <span className="font-medium">{ev.label || 'Untitled event'}</span>
            <span className={`text-xs ${toneDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {ev.date || '—'}
              {ev.time ? ` at ${ev.time}` : ''}
            </span>
          </li>
        ))}
      </ul>
    )
  }
  if (legacy && legacy.trim()) {
    return (
      <p className={`py-1 text-sm leading-6 ${toneDark ? 'text-slate-200' : 'text-slate-700'}`}>{legacy}</p>
    )
  }
  return null
}
