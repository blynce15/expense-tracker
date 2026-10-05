import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { EMOJIS } from '../lib/emojis'
import { fetchLookups } from '../lib/lookups'
import { supabase } from '../lib/supabase'

const COLORS = ['#1f9d55', '#e8590c', '#1f4fe0', '#6741d9', '#495057', '#d6336c', '#0c8599', '#f08c00', '#1c7ed6', '#c23b22', '#0f8a5f', '#868e96']

const KINDS = [
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
]

export default function Categories() {
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | { kind } for new | category
  const [showArchived, setShowArchived] = useState(false)
  const [reordering, setReordering] = useState(null) // null | 'expense' | 'income'

  const load = useCallback(() => {
    fetchLookups()
      .then((data) => setCategories(data.categories))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load categories: {error}</p>
  if (!categories) return null

  const archived = categories.filter((c) => c.archived)

  return (
    <div className="px-4 pt-1 pb-6">
      {KINDS.map((kind) => {
        const active = categories.filter((c) => c.kind === kind.value && !c.archived)
        return (
          <section key={kind.value} className="mt-4 first:mt-1">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <h2 className="text-sm font-semibold text-muted">{kind.label}</h2>
              {active.length > 1 && reordering !== kind.value && (
                <button onClick={() => setReordering(kind.value)} className="py-1 text-sm font-semibold text-cobalt">
                  Reorder
                </button>
              )}
            </div>
            {reordering === kind.value ? (
              <ReorderList
                categories={active}
                onDone={() => {
                  setReordering(null)
                  load()
                }}
              />
            ) : (
              <>
                <CategoryList categories={active} onSelect={setEditing} />
                <button
                  onClick={() => setEditing({ kind: kind.value })}
                  className="mt-2 w-full rounded-2xl bg-card py-3.5 text-base font-medium text-cobalt"
                >
                  Add {kind.value} category
                </button>
              </>
            )}
          </section>
        )
      })}

      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((s) => !s)} className="py-2 text-sm font-medium text-muted">
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && <CategoryList categories={archived} onSelect={setEditing} />}
        </div>
      )}

      {editing && (
        <CategoryForm
          category={editing.id ? editing : null}
          kind={editing.kind}
          // New categories go to the end of their list
          nextSortOrder={Math.max(0, ...categories.filter((c) => c.kind === editing.kind).map((c) => c.sort_order)) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function CategoryList({ categories, onSelect }) {
  if (categories.length === 0) return null
  return (
    <ul className="overflow-hidden rounded-2xl bg-card">
      {categories.map((c) => (
        <li key={c.id} className="border-b border-line last:border-0">
          <button onClick={() => onSelect(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <span className="grid size-10 place-items-center rounded-xl text-lg" style={{ backgroundColor: `${c.color}22` }}>
              {c.icon}
            </span>
            <span className="flex-1 text-base font-medium">{c.name}</span>
            <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function ReorderList({ categories, onDone }) {
  const [order, setOrder] = useState(categories)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function move(index, delta) {
    const next = [...order]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    setOrder(next)
  }

  async function save() {
    setBusy(true)
    setError(null)
    // Only update the categories whose position actually changed
    const changed = order
      .map((c, i) => ({ id: c.id, sort_order: i + 1, before: c.sort_order }))
      .filter((c) => c.sort_order !== c.before)
    const results = await Promise.all(
      changed.map((c) => supabase.from('categories').update({ sort_order: c.sort_order }).eq('id', c.id)),
    )
    setBusy(false)
    const failed = results.find((r) => r.error)
    if (failed) return setError(failed.error.message)
    onDone()
  }

  const arrow = 'grid size-11 place-items-center rounded-full text-ink disabled:text-line'

  return (
    <>
      <ul className="overflow-hidden rounded-2xl bg-card">
        {order.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-line py-1.5 pr-1 pl-4 last:border-0">
            <span className="grid size-10 place-items-center rounded-xl text-lg" style={{ backgroundColor: `${c.color}22` }}>
              {c.icon}
            </span>
            <span className="flex-1 text-base font-medium">{c.name}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} className={arrow} aria-label={`Move ${c.name} up`}>
              <Icon name="chevronUp" />
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className={arrow}
              aria-label={`Move ${c.name} down`}
            >
              <Icon name="chevronDown" />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      <button
        onClick={save}
        disabled={busy}
        className="mt-2 w-full rounded-2xl bg-cobalt py-3.5 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
      >
        Done
      </button>
    </>
  )
}

function CategoryForm({ category, kind, nextSortOrder, onClose, onSaved }) {
  const isNew = !category
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [color, setColor] = useState(category?.color ?? COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(action) {
    setBusy(true)
    setError(null)
    const { error } = await action()
    setBusy(false)
    if (error) {
      if (error.code === '23505') return setError('You already have a category with that name.')
      if (error.code === '23503') return setError('This category is used by transactions, so it can’t be deleted. Archive it instead.')
      return setError(error.message)
    }
    onSaved()
  }

  function save(e) {
    e.preventDefault()
    const row = { name: name.trim(), icon: icon.trim() || '📦', color }
    run(() =>
      isNew
        ? supabase.from('categories').insert({ ...row, kind, sort_order: nextSortOrder })
        : supabase.from('categories').update(row).eq('id', category.id),
    )
  }

  function remove() {
    if (!window.confirm(`Delete "${category.name}"? This can't be undone.`)) return
    run(() => supabase.from('categories').delete().eq('id', category.id))
  }

  const inputClass = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt'

  return (
    <Sheet title={isNew ? `New ${kind} category` : 'Edit category'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <div className="flex gap-2">
          <label className="w-20 shrink-0">
            <span className="mb-1.5 block text-sm font-medium text-muted">Emoji</span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className={`${inputClass} px-0 text-center text-2xl`}
              aria-label="Emoji"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Coffee"
              className={`${inputClass} py-3.5`}
            />
          </label>
        </div>

        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setIcon(em)}
              aria-pressed={icon === em}
              className={`grid aspect-square place-items-center rounded-lg text-xl ${icon === em ? 'bg-cobalt/15 ring-2 ring-cobalt' : ''}`}
            >
              {em}
            </button>
          ))}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Color</legend>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={`size-9 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          {isNew ? 'Add category' : 'Save changes'}
        </button>

        {!isNew && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => supabase.from('categories').update({ archived: !category.archived }).eq('id', category.id))}
              className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium"
            >
              {category.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium text-loss"
            >
              Delete
            </button>
          </div>
        )}
      </form>
    </Sheet>
  )
}
