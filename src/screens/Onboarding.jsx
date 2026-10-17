import { useEffect, useRef, useState } from 'react'
import DatePicker from '../components/DatePicker'
import Avatar from '../components/Avatar'
import AmountPad from '../components/AmountPad'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import MerchantIcon from '../components/MerchantIcon'
import LynxWatermark from '../components/LynxWatermark'
import { BankLogo } from '../components/BankCard'
import { BANKS, bankFor, MEAL_CARDS } from '../lib/banks'
import { budgetPeriod } from '../lib/budget'
import { formatDayMonth, shiftDays, todayISO } from '../lib/dates'
import { DEFAULT_CATEGORIES } from '../lib/defaults'
import { EMOJIS } from '../lib/emojis'
import { centsToPad, formatCents, parseToCents } from '../lib/money'
import { cleanGetquinLink, fetchPortfolio } from '../lib/getquin'
import { allowLeavingOnce } from '../lib/applock'
import { fetchExistingCategories, saveOnboarding } from '../lib/onboarding'
import { squareJpeg } from '../lib/profile'
import { monthlyCents } from '../lib/recurring'
import { supabase } from '../lib/supabase'

// First-run setup for new users: profile (name, photo), accounts, budget day, categories,
// and regular payments. Nothing is saved until the end.

const STEPS = [
  { key: 'welcome' },
  { key: 'profile', title: 'Nice to meet you', center: true },
  { key: 'accounts', title: 'Accounts' },
  { key: 'day', title: 'When does your month start?', sub: 'Pick your payday. Your budget starts over on this day.' },
  { key: 'cats', title: 'Categories' },
  { key: 'payments', title: 'Regular payments' },
  { key: 'goals', title: 'Savings goals' },
  { key: 'invest', title: 'Investments' },
  { key: 'done' },
]
const NUMBERED = STEPS.length - 2

const TYPES = {
  debit: { label: 'Bank', placeholder: 'e.g. Revolut', color: '#1f4fe0' },
  meal: { label: 'Meal card', placeholder: 'e.g. Coverflex', color: '#f2705a' },
  cash: { label: 'Cash', placeholder: 'e.g. Wallet', color: '#2b8a3e' },
  savings: { label: 'Savings', placeholder: 'e.g. Savings', color: '#7048e8' },
}
const ACCOUNT_COLORS = [
  '#1f4fe0', '#0b1b45', '#4dabf7', '#0c8599', '#12b886', '#2b8a3e', '#94d82d', '#fab005',
  '#f08c00', '#e8590c', '#e03131', '#d6336c', '#ae3ec9', '#7048e8', '#495057', '#111111',
]
const CATEGORY_COLORS = ['#1f9d55', '#e8590c', '#1f4fe0', '#6741d9', '#d6336c', '#0c8599', '#f08c00', '#495057']
const CATEGORY_IDEAS = [
  ['Bills', '🧾', '#495057', 'expense'], ['Travel', '✈️', '#1c7ed6', 'expense'], ['Car', '🚗', '#1971c2', 'expense'],
  ['Coffee', '☕', '#8d6e63', 'expense'], ['Going out', '🍻', '#f08c00', 'expense'], ['Personal care', '💇', '#d6336c', 'expense'],
  ['Gym', '🏋️', '#2b8a3e', 'expense'], ['Education', '🎓', '#0c8599', 'expense'], ['Insurance', '🛡️', '#495057', 'expense'],
  ['Gifts', '🎁', '#e64980', 'expense'], ['Pets', '🐶', '#a0522d', 'expense'], ['Kids', '🧸', '#f06595', 'expense'],
  ['Donations', '❤️', '#e03131', 'expense'], ['Fees', '🏦', '#868e96', 'expense'],
  ['Bonus', '🎉', '#f08c00', 'income'], ['Freelance', '💻', '#0c8599', 'income'], ['Refunds', '↩️', '#495057', 'income'],
  ['Tax refund', '🧾', '#1f9d55', 'income'], ['Investments', '📈', '#1c7ed6', 'income'], ['Interest', '🏦', '#0f8a5f', 'income'],
  ['Sales', '🏷️', '#d6336c', 'income'], ['Gifts', '🎁', '#e64980', 'income'], ['Rent received', '🏠', '#6741d9', 'income'],
  ['Cashback', '🪙', '#e8a400', 'income'],
]
// Regular payment and income shortcuts: name (the logo comes from the name, src/lib/merchants.js),
// emoji when there's no logo, preferred categories (first one the user kept), days until due, kind.
// The amount starts empty: prices differ by plan and change (owner's choice).
const SUBS = ['Subscriptions', 'Entertainment', 'Other']
const UTILITIES = ['Bills', 'Other']
const PAYMENT_IDEAS = [
  ['Rent', '🏠', ['Housing', 'Bills'], 25, 'expense'], ['Netflix', '🎬', SUBS, 5, 'expense'], ['Spotify', '🎧', SUBS, 9, 'expense'],
  ['Disney+', '🎬', SUBS, 12, 'expense'], ['HBO Max', '🎬', SUBS, 15, 'expense'], ['Prime Video', '🎬', SUBS, 18, 'expense'],
  ['YouTube', '▶️', SUBS, 20, 'expense'], ['iCloud', '☁️', SUBS, 8, 'expense'], ['ChatGPT', '🤖', SUBS, 11, 'expense'],
  ['Claude', '🤖', SUBS, 14, 'expense'], ['MEO', '📱', UTILITIES, 6, 'expense'], ['NOS', '📱', UTILITIES, 6, 'expense'],
  ['Vodafone', '📱', UTILITIES, 6, 'expense'], ['EDP', '💡', UTILITIES, 18, 'expense'], ['Gym', '🏋️', ['Gym', 'Health', 'Other'], 3, 'expense'],
  ['Salary', '💼', ['Salary', 'Other income'], 20, 'income'], ['Coverflex', '🍽️', ['Other income', 'Salary'], 20, 'income'],
  ['Edenred', '🍽️', ['Other income', 'Salary'], 20, 'income'], ['Pluxee', '🍽️', ['Other income', 'Salary'], 20, 'income'],
  ['Rent received', '🏠', ['Rent received', 'Other income'], 5, 'income'], ['Freelance', '💻', ['Freelance', 'Other income'], 15, 'income'],
]
// value, label, "Every …", the period's name ("€13,99 a month")
const FREQUENCIES = [['weekly', 'Weekly', 'Every week', 'week'], ['monthly', 'Monthly', 'Every month', 'month'], ['yearly', 'Yearly', 'Every year', 'year']]

const GLYPHS = {
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  debit: 'M3 10h18M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18M12 3.5 21 8H3z',
  savings: 'M5 6.5a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5',
  meal: 'M6 3v6a3 3 0 0 0 6 0V3M9 3v18M17 21V3c-2 1.5-3 4-3 7s1 3.5 3 3.5',
  cash: 'M4.5 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6 12h.01M18 12h.01',
  calendar: 'M6 4.5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3zM3 9.5h18M8 2.5v4M16 2.5v4',
  tag: 'M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-7.1 7.1a1.5 1.5 0 0 1-2.1 0zM6.7 8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
  repeat: 'M17 2.5l3.5 3.5L17 9.5M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5M20.5 12.5V14a4 4 0 0 1-4 4h-13',
  chat: 'M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 21l1.4-4.4A8.5 8.5 0 1 1 20.5 12z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 18l-6-6 6-6',
}
function Glyph({ name, className = 'size-5', width = 1.9 }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  )
}

// Darker version of a #rrggbb color, for card gradients
const shade = (hex, f) =>
  '#' + hex.slice(1).match(/../g).map((h) => Math.round(parseInt(h, 16) * f).toString(16).padStart(2, '0')).join('')
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')
const budgetOf = (accounts) => accounts.filter((a) => ['debit', 'cash', 'meal'].includes(a.type)).reduce((s, a) => s + a.cents, 0)
const primaryClass =
  'w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_rgba(31,79,224,0.8)] active:bg-cobalt-deep disabled:opacity-40'

const newAccountForm = (type) => ({ type, name: '', amount: '', color: TYPES[type].color, error: null })
const defaultCategories = () =>
  DEFAULT_CATEGORIES.map((c) => ({ name: c.name, icon: c.icon, color: c.color, kind: c.kind, selected: true }))

export default function Onboarding({ email, onDone }) {
  const today = todayISO()
  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState([])
  const [accountForm, setAccountForm] = useState(newAccountForm('debit'))
  const [startDay, setStartDay] = useState(1)
  const [categories, setCategories] = useState(defaultCategories)
  const [categoryKind, setCategoryKind] = useState('expense')
  const [categoryForm, setCategoryForm] = useState(null)
  const [profile, setProfile] = useState({ name: '', photo: null })
  const [payments, setPayments] = useState([])
  const [paymentForm, setPaymentForm] = useState(null)
  const [goals, setGoals] = useState([])
  const [goalForm, setGoalForm] = useState(null)
  // Investments: the pasted getquin link and what reading it gave (status idle | loading | ok | error)
  const [invest, setInvest] = useState({ text: '', link: null, status: 'idle', portfolio: null })
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | failed
  const [saveError, setSaveError] = useState(null)
  const saved = useRef({})
  const nextKey = useRef(1)

  // A user who already has categories (from before onboarding existed) starts from those
  useEffect(() => {
    fetchExistingCategories()
      .then((rows) => rows.length && setCategories(rows.map((c) => ({ ...c, selected: !c.archived }))))
      .catch(() => {}) // Defaults are fine; saving will report any real problem
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step, accountForm === null, categoryForm === null, paymentForm === null, goalForm === null])

  async function save() {
    setSaveState('saving')
    setSaveError(null)
    try {
      await saveOnboarding({ profile, accounts, categories, payments, goals, getquinUrl: invest.status === 'ok' ? invest.link : null, startDay }, saved.current)
      setSaveState('saved')
    } catch (e) {
      setSaveError(e.message)
      setSaveState('failed')
    }
  }

  useEffect(() => {
    if (STEPS[step].key === 'done' && saveState === 'idle') save()
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const key = STEPS[step].key
  const go = (n) => setStep((s) => s + n)

  function back() {
    if (key === 'accounts' && accountForm && accounts.length) return setAccountForm(null)
    if (key === 'cats' && categoryForm) return setCategoryForm(null)
    if (key === 'payments' && paymentForm) return setPaymentForm(null)
    if (key === 'goals' && goalForm) return setGoalForm(null)
    go(-1)
  }

  // ---------- Actions ----------
  function addAccount() {
    const f = accountForm
    const cents = f.amount.trim() === '' ? 0 : parseToCents(f.amount)
    if (cents == null) return setAccountForm({ ...f, error: 'Enter an amount like 1.250 or 1250,50.' })
    setAccounts((list) => [...list, { key: nextKey.current++, type: f.type, name: f.name.trim() || TYPES[f.type].label, cents, color: f.color }])
    setAccountForm(null)
  }
  function openAccountForm() {
    const type = ['savings', 'cash', 'debit'].find((t) => !accounts.some((a) => a.type === t)) ?? 'debit'
    setAccountForm(newAccountForm(type))
  }

  function addCategory() {
    const f = categoryForm
    const name = f.name.trim()
    if (!name) return setCategoryForm({ ...f, error: 'Give your category a name.' })
    if (categories.some((c) => c.kind === f.kind && c.name.toLowerCase() === name.toLowerCase()))
      return setCategoryForm({ ...f, error: `You already have a category called ${name}.` })
    setCategories((list) => [...list, { name, icon: f.icon, color: f.color, kind: f.kind, selected: true }])
    setCategoryForm(null)
  }

  // Savings goals: the money in savings accounts (their starting balances) can be split into goals.
  // What isn't given to a goal stays in General savings; goals can never take more than there is.
  const savingsCents = accounts.filter((a) => a.type === 'savings').reduce((t, a) => t + a.cents, 0)
  const hasSavings = accounts.some((a) => a.type === 'savings')
  const goalsCents = (except) => goals.filter((g) => g.key !== except).reduce((t, g) => t + g.startCents, 0)
  function openGoalForm(idea, goal) {
    if (goal) {
      return setGoalForm({ key: goal.key, name: goal.name, icon: goal.icon, target: centsToPad(goal.targetCents), deadline: goal.deadline, start: goal.startCents ? centsToPad(goal.startCents) : '', error: null })
    }
    setGoalForm({ key: null, name: idea?.name ?? '', icon: idea?.icon ?? '🎯', target: '', deadline: null, start: '', error: null })
  }
  function addGoal() {
    const f = goalForm
    const targetCents = parseToCents(f.target) ?? 0
    const startCents = hasSavings ? (parseToCents(f.start) ?? 0) : 0
    if (!f.name.trim()) return setGoalForm({ ...f, error: 'Give the goal a name.' })
    if (!targetCents) return setGoalForm({ ...f, error: 'Set a target amount.' })
    const free = savingsCents - goalsCents(f.key)
    if (startCents > free) return setGoalForm({ ...f, error: `Only ${formatCents(Math.max(free, 0))} is free in savings.` })
    const goal = { key: f.key ?? nextKey.current++, name: f.name.trim(), icon: f.icon, targetCents, deadline: f.deadline, startCents }
    setGoals((list) => (f.key ? list.map((g) => (g.key === f.key ? goal : g)) : [...list, goal]))
    setGoalForm(null)
  }

  function openPaymentForm(idea, type = 'expense') {
    const income = type === 'income'
    // Money comes in to a spending account; payments go out of spending accounts
    const spendable = accounts.filter((a) => a.type !== 'savings')
    const names = categories.filter((c) => c.kind === type && c.selected).map((c) => c.name)
    setPaymentForm({
      type,
      name: idea?.[0] ?? '',
      icon: idea?.[1] ?? (income ? '💶' : '🔁'),
      amount: '',
      frequency: 'monthly',
      nextDue: shiftDays(today, idea?.[3] ?? 7),
      accountKey: spendable[0]?.key ?? accounts[0]?.key,
      categoryName: (idea?.[2] ?? []).find((n) => names.includes(n)) ?? names[0],
      error: null,
    })
  }
  function addPayment() {
    const f = paymentForm
    const cents = parseToCents(f.amount)
    if (!f.name.trim()) return setPaymentForm({ ...f, error: f.type === 'income' ? 'Give it a name, like Salary.' : 'Give it a name, like Rent or Netflix.' })
    if (!cents) return setPaymentForm({ ...f, error: 'Enter the amount.' })
    setPayments((list) => [...list, { ...f, name: f.name.trim(), cents }].sort((a, b) => a.nextDue.localeCompare(b.nextDue)))
    setPaymentForm(null)
  }

  // ---------- Bottom button ----------
  let footer = null
  if (key === 'welcome')
    footer = (
      <>
        <button onClick={() => go(1)} className={primaryClass}>Let’s start</button>
        <button onClick={() => supabase.auth.signOut()} className="mt-1 w-full py-2.5 text-sm font-medium text-muted">
          Sign out
        </button>
      </>
    )
  else if (key === 'profile')
    footer = (
      <button onClick={() => go(1)} disabled={!profile.name.trim()} className={primaryClass}>
        {profile.name.trim() ? 'Continue' : 'Enter your name'}
      </button>
    )
  else if (key === 'accounts')
    footer = accountForm ? (
      <button onClick={addAccount} className={primaryClass}>{accounts.length ? 'Add account' : 'Add this account'}</button>
    ) : (
      <button onClick={() => go(1)} className={primaryClass}>Continue</button>
    )
  else if (key === 'day') footer = <button onClick={() => go(1)} className={primaryClass}>Continue</button>
  else if (key === 'cats') {
    const expenses = categories.filter((c) => c.kind === 'expense' && c.selected).length
    footer = categoryForm ? (
      <button onClick={addCategory} className={primaryClass}>Add category</button>
    ) : (
      <button onClick={() => go(1)} disabled={!expenses} className={primaryClass}>{expenses ? 'Continue' : 'Pick at least one expense'}</button>
    )
  } else if (key === 'goals') {
    const over = goalsCents(null) > savingsCents
    footer = goalForm ? (
      <button onClick={addGoal} className={primaryClass}>{goalForm.key ? 'Save goal' : 'Add goal'}</button>
    ) : over ? (
      <button disabled className={primaryClass}>Goals are more than your savings</button>
    ) : goals.length ? (
      <button onClick={() => go(1)} className={primaryClass}>Continue</button>
    ) : (
      <button onClick={() => go(1)} className="w-full rounded-2xl bg-card py-4 text-lg font-semibold text-ink ring-1 ring-line">Skip for now</button>
    )
  } else if (key === 'invest')
    footer =
      invest.status === 'ok' ? (
        <button onClick={() => go(1)} className={primaryClass}>Continue</button>
      ) : invest.status === 'loading' ? (
        <button disabled className={primaryClass}>Continue</button>
      ) : (
        <button onClick={() => go(1)} className="w-full rounded-2xl bg-card py-4 text-lg font-semibold text-ink ring-1 ring-line">Skip for now</button>
      )
  else if (key === 'payments')
    footer = paymentForm ? (
      <button onClick={addPayment} className={primaryClass}>{paymentForm.type === 'income' ? 'Add income' : 'Add payment'}</button>
    ) : payments.length ? (
      <button onClick={() => go(1)} className={primaryClass}>Continue</button>
    ) : (
      <button onClick={() => go(1)} className="w-full rounded-2xl bg-card py-4 text-lg font-semibold text-ink ring-1 ring-line">Skip for now</button>
    )
  else if (key === 'done')
    footer =
      saveState === 'failed' ? (
        <button onClick={save} className={primaryClass}>Try again</button>
      ) : (
        <button onClick={onDone} disabled={saveState !== 'saved'} className={primaryClass}>
          {saveState === 'saved' ? 'Go to Home' : 'Saving your setup…'}
        </button>
      )

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-lg px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+7.5rem)]">
        {key === 'welcome' && <Welcome />}
        {key === 'done' && (
          <Finish accounts={accounts} startDay={startDay} categories={categories} goals={goals} payments={payments} saveState={saveState} saveError={saveError} />
        )}
        {key !== 'welcome' && key !== 'done' && (
          <>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={back} aria-label="Back" className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-ink">
                <Glyph name="back" width={2.4} />
              </button>
              <div className="flex flex-1 gap-1">
                {Array.from({ length: NUMBERED }, (_, i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${i < step - 1 ? 'bg-cobalt' : i === step - 1 ? 'bg-ink' : 'bg-line'}`} />
                ))}
              </div>
            </div>
            {!(key === 'goals' && goalForm) && (
              <>
                <h1 className={`mt-6 font-display text-[34px] leading-[1.02] font-extrabold tracking-tight ${STEPS[step].center ? 'text-center' : ''}`}>{STEPS[step].title}</h1>
                {STEPS[step].sub ? <p className="mt-2 mb-5 text-muted">{STEPS[step].sub}</p> : <div className="mb-5" />}
              </>
            )}

            {key === 'profile' && <ProfileStep email={email} profile={profile} setProfile={setProfile} />}
            {key === 'accounts' && (
              <AccountsStep
                accounts={accounts}
                form={accountForm}
                setForm={setAccountForm}
                onOpen={openAccountForm}
                onRemove={(k) => {
                  const rest = accounts.filter((a) => a.key !== k)
                  setAccounts(rest)
                  setPayments((list) => list.filter((p) => p.accountKey !== k))
                  if (!rest.length) setAccountForm(newAccountForm('debit'))
                }}
              />
            )}
            {key === 'day' && <DayStep today={today} startDay={startDay} setStartDay={setStartDay} />}
            {key === 'cats' && (
              <CategoriesStep
                categories={categories}
                setCategories={setCategories}
                kind={categoryKind}
                setKind={setCategoryKind}
                form={categoryForm}
                setForm={setCategoryForm}
              />
            )}
            {key === 'invest' && <InvestStep invest={invest} setInvest={setInvest} />}
            {key === 'goals' && (
              <GoalsStep
                today={today}
                goals={goals}
                form={goalForm}
                setForm={setGoalForm}
                savingsCents={savingsCents}
                hasSavings={hasSavings}
                savingsName={accounts.find((a) => a.type === 'savings')?.name}
                freeFor={(except) => savingsCents - goalsCents(except)}
                onOpen={openGoalForm}
                onRemove={(k) => {
                  setGoals((list) => list.filter((g) => g.key !== k))
                  setGoalForm(null)
                }}
              />
            )}
            {key === 'payments' && (
              <PaymentsStep
                today={today}
                accounts={accounts}
                categories={categories}
                payments={payments}
                form={paymentForm}
                setForm={setPaymentForm}
                onOpen={openPaymentForm}
                onRemove={(i) => setPayments((list) => list.filter((_, j) => j !== i))}
              />
            )}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper to-paper/0 pt-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mx-auto max-w-lg px-5">{footer}</div>
      </div>
    </div>
  )
}

// First page: just the big logo, the app's name and "Expense tracker", centred in the space above
// the Let's start button (the page's padding: safe areas + 1rem top, 7.5rem bottom).
function Welcome() {
  return (
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-8.5rem)] flex-col items-center justify-center pb-6">
      <img src="/logo.png" alt="" className="size-[168px] [@media(max-height:700px)]:size-[128px]" />
      <h1 className="mt-5 font-display text-[48px] leading-none font-extrabold tracking-tight">
        Lynx<span className="brand-text">OS</span>
      </h1>
      <p className="mt-2.5 text-lg text-muted">Expense tracker</p>
    </div>
  )
}

// A row in a settings-style group: label on the left, control on the right
function Row({ label, children }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 border-b border-line px-4 py-2 last:border-0">
      <span className="w-24 shrink-0 text-sm text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  )
}
const capClass = 'mt-5 mb-2 px-1 text-xs font-bold tracking-[.07em] text-muted uppercase'
const plainInput = 'bg-transparent text-right text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/60'

// big: the account colours, a longer row that scrolls sideways on the page background
function Swatches({ colors, value, onChange, big = false }) {
  return (
    <span className={`flex w-max ${big ? 'gap-2.5 p-1' : 'gap-1.5'}`}>
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label="Color"
          aria-pressed={value === c}
          className={`grid shrink-0 place-items-center rounded-full ${big ? 'size-8 ring-offset-paper' : 'size-[26px]'} ${value === c ? 'ring-2 ring-offset-2' : ''}`}
          style={{ backgroundColor: c, '--tw-ring-color': c }}
        >
          {value === c && <Glyph name="check" className="size-3.5 text-white" width={3.2} />}
        </button>
      ))}
    </span>
  )
}

function SectionAction({ label, onClick }) {
  return (
    <button onClick={onClick} className="text-sm font-semibold text-cobalt">
      {label}
    </button>
  )
}

function MiniCard({ account, className = 'h-11 w-16 rounded-xl', iconClass = 'size-4' }) {
  const bank = bankFor(account.name)
  return (
    <span
      className={`grid shrink-0 place-items-center text-white shadow-sm ring-1 ring-white/30 ${className}`}
      style={{ background: `linear-gradient(135deg, ${account.color}, ${shade(account.color, 0.7)})` }}
    >
      {bank ? <BankLogo bank={bank} className="aspect-square h-[62%]" /> : <Glyph name={account.type} className={iconClass} />}
    </span>
  )
}

function RemoveButton({ label, onClick }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid size-8 shrink-0 place-items-center rounded-full text-muted">
      <Glyph name="close" className="size-4" width={2.2} />
    </button>
  )
}

// ---------- Step 1: profile ----------
// Name and photo, shown in Profile and as the round avatar at the top of every tab.
// The photo is cropped to a square and shrunk on the phone; nothing is saved until the end.
function ProfileStep({ email, profile, setProfile }) {
  const input = useRef(null)
  const [error, setError] = useState(null)

  async function picked(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setProfile({ ...profile, photo: await squareJpeg(file) })
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }
  function choosePhoto() {
    allowLeavingOnce() // the photo library hides the app; don't lock it for that
    input.current.click()
  }

  const named = profile.name.trim()
  return (
    <div>
      {/* "Spotlight": the photo in the middle with soft rings (like the lock screen); tap it to add or change */}
      <div className="flex flex-col items-center">
        <div className="relative grid size-[230px] place-items-center [@media(max-height:700px)]:size-[180px]">
          <span className="absolute -inset-6 rounded-full border-[1.5px] border-cobalt/[.08] [@media(max-height:700px)]:-inset-3" aria-hidden="true" />
          <span className="absolute inset-0 rounded-full border-[1.5px] border-cobalt/15" aria-hidden="true" />
          <span className="absolute inset-6 rounded-full border-[1.5px] border-cobalt/20" aria-hidden="true" />
          <button type="button" onClick={choosePhoto} className="relative rounded-full" aria-label={profile.photo ? 'Change photo' : 'Add photo'}>
            <Avatar
              name={profile.name}
              email={email}
              photo={profile.photo}
              size={140}
              className="shadow-[0_22px_40px_-18px_rgba(31,79,224,0.9)] [@media(max-height:700px)]:!size-[110px]"
            />
            <span className="absolute right-0 bottom-0 grid size-[42px] place-items-center rounded-full bg-card text-cobalt shadow-[0_2px_8px_rgba(11,27,69,0.25)] [@media(max-height:700px)]:size-9">
              <Icon name="camera" size={20} strokeWidth={2.2} />
            </span>
          </button>
        </div>
        <input ref={input} type="file" accept="image/*" onChange={picked} className="hidden" />
        <p className={`mt-2 max-w-full truncate font-display text-[30px] leading-tight font-extrabold tracking-tight ${named ? '' : 'text-muted/40'}`}>
          {named || 'Your name'}
        </p>
        <p className="mt-2 max-w-full truncate rounded-full bg-card px-3 py-1.5 text-[13px] text-muted">{email}</p>
      </div>

      <label className="group mt-6 block rounded-[18px] border-2 border-line bg-card px-4 pt-2.5 pb-2 transition-colors focus-within:border-cobalt">
        <span className="block text-xs font-bold text-muted group-focus-within:text-cobalt">Your name</span>
        <input
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          placeholder="First name"
          maxLength={40}
          autoComplete="given-name"
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="mt-0.5 w-full bg-transparent text-lg font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/60"
        />
      </label>
      {error && <p className="mt-2 px-1 text-sm text-loss">{error}</p>}
    </div>
  )
}

// ---------- Step 2: accounts ----------
function AccountsStep({ accounts, form, setForm, onOpen, onRemove }) {
  const [padOpen, setPadOpen] = useState(false)
  const [allColors, setAllColors] = useState(false)

  if (form) {
    const t = TYPES[form.type]
    const cents = parseToCents(form.amount) ?? 0
    const [whole, decimals] = formatCents(cents).split(',')
    const bank = bankFor(form.name)
    const pickBank = (b) => setForm({ ...form, name: b.name, color: b.color, error: null })
    const shortcuts = form.type === 'meal' ? MEAL_CARDS : form.type === 'cash' ? [] : BANKS
    // A picked bank's own colour (not in the list) joins the start of the list
    const colors = ACCOUNT_COLORS.includes(form.color) ? ACCOUNT_COLORS : [form.color, ...ACCOUNT_COLORS]
    // The quick row: five styles, always including the selected one (it takes the last spot)
    const quick = colors.slice(0, 5).includes(form.color) ? colors.slice(0, 5) : [...colors.slice(0, 4), form.color]
    const pickColor = (color) => setForm({ ...form, color })
    return (
      <div>
        {accounts.length > 0 && (
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-muted">Account {accounts.length + 1}</p>
            <SectionAction label="Cancel" onClick={() => setForm(null)} />
          </div>
        )}
        {/* The account drawn as a bank card. The name is typed right on it and tapping the balance
            opens the number pad; both look like plain card text (no boxes or lines) */}
        <div
          className="relative h-[178px] overflow-clip rounded-[24px] p-5 text-white transition-[background,box-shadow] duration-300"
          style={{ background: `linear-gradient(140deg, ${form.color} 0%, ${shade(form.color, 0.62)} 100%)`, boxShadow: `0 18px 34px -18px ${form.color}` }}
        >
          <span className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -right-16 -bottom-24 size-56 rounded-full bg-white/[.06]" />
          <div className="relative flex items-center gap-3">
            {bank ? (
              <BankLogo bank={bank} className="size-11" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-[24%] bg-white/15">
                <Glyph name={form.type} className="size-[22px]" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, error: null })}
                placeholder={t.placeholder}
                maxLength={40}
                enterKeyHint="done"
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-label="Account name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                className="block w-full appearance-none truncate border-0 bg-transparent p-0 text-base leading-tight font-semibold text-white caret-white outline-none placeholder:text-white/55"
              />
              <span className="block text-xs text-white/70">{t.label}</span>
            </span>
          </div>
          <p className="relative mt-6 text-xs text-white/70">Balance today</p>
          <button onClick={() => setPadOpen(true)} aria-label="Balance today" className="tabular relative -mx-1 rounded-lg px-1 text-left font-display leading-tight font-bold active:bg-white/10">
            <span className={`text-[30px] ${cents ? '' : 'text-white/55'}`}>{whole}</span>
            <span className={`text-lg ${cents ? 'opacity-60' : 'text-white/40'}`}>,{decimals}</span>
          </button>
        </div>

        {/* Type as underlined tabs */}
        <div className="mt-5 flex justify-between border-b-[1.5px] border-line px-1" role="tablist">
          {Object.entries(TYPES).map(([type, info]) => (
            <button
              key={type}
              role="tab"
              aria-selected={form.type === type}
              onClick={() => setForm({ ...form, type, color: bank ? form.color : info.color, error: null })}
              className={`-mb-[1.5px] flex items-center gap-1.5 border-b-[2.5px] pt-2.5 pb-[11px] text-[13.5px] font-semibold whitespace-nowrap transition-colors ${
                form.type === type ? 'border-ink text-ink' : 'border-transparent text-muted'
              }`}
            >
              <Glyph name={type} className="size-[18px]" />
              {info.label}
            </button>
          ))}
        </div>

        {shortcuts.length > 0 && (
          <>
            <p className={capClass}>{form.type === 'meal' ? 'Your meal card' : 'Your bank'}</p>
            {/* One white card, thin lines between the logos */}
            <div className="grid grid-cols-4 overflow-hidden rounded-[20px] bg-card">
              {shortcuts.map((b, i) => {
                const lastRow = i >= Math.floor((shortcuts.length - 1) / 4) * 4
                return (
                  <button
                    key={b.name}
                    onClick={() => pickBank(b)}
                    aria-pressed={bank === b}
                    className={`flex min-w-0 flex-col items-center gap-1.5 px-1 pt-3.5 pb-3 transition-colors active:bg-paper ${
                      i % 4 !== 3 && i !== shortcuts.length - 1 ? 'border-r border-line' : ''
                    } ${lastRow ? '' : 'border-b border-line'}`}
                  >
                    <BankLogo
                      bank={b}
                      className={`size-10 transition-shadow ${bank === b ? 'shadow-[0_0_0_2.5px_var(--color-card),0_0_0_4.5px_var(--color-cobalt)]' : ''}`}
                    />
                    <span className={`line-clamp-2 w-full text-center text-[11.5px] leading-tight font-semibold ${bank === b ? 'text-cobalt' : ''}`}>{b.name}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <p className={capClass}>Card style</p>
        {/* Five mini cards and an arrow that opens every colour in a sheet */}
        <div className="flex items-center justify-between px-0.5">
          {quick.map((c) => (
            <MiniStyle key={c} color={c} selected={form.color === c} onClick={() => pickColor(c)} />
          ))}
          <button
            onClick={() => setAllColors(true)}
            aria-haspopup="dialog"
            aria-label="More colours"
            className="grid h-[34px] w-[50px] shrink-0 place-items-center rounded-[9px] border-[1.5px] border-line bg-card text-muted transition-colors active:bg-paper"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        {allColors && (
          <ColourSheet
            value={form.color}
            bankColor={ACCOUNT_COLORS.includes(form.color) ? null : form.color}
            bankName={bank?.name}
            onPick={(c) => {
              pickColor(c)
              setAllColors(false)
            }}
            onClose={() => setAllColors(false)}
          />
        )}
        {form.error && <p className="mt-2 px-1 text-sm text-loss">{form.error}</p>}

        {padOpen && (
          <AmountPad
            label="Balance today"
            amount={form.amount}
            onChange={(amount) => setForm({ ...form, amount, error: null })}
            onDone={() => setPadOpen(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.key} className="flex items-center gap-3 rounded-2xl bg-card p-3 pr-2">
            <MiniCard account={a} />
            <span className="min-w-0 flex-1">
              <b className="block truncate">{a.name}</b>
              <span className="text-xs text-muted">{TYPES[a.type].label}</span>
            </span>
            <b className="tabular font-display text-lg">
              {formatCents(a.cents)}
            </b>
            <RemoveButton label={`Remove ${a.name}`} onClick={() => onRemove(a.key)} />
          </li>
        ))}
      </ul>
      <button onClick={onOpen} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cobalt/30 py-3.5 font-semibold text-cobalt">
        <span className="grid size-6 place-items-center rounded-full bg-cobalt/10">
          <Glyph name="plus" className="size-4" width={2.4} />
        </span>
        Add another account
      </button>
    </div>
  )
}

// Every card colour in a sheet, with names, in groups (the order inside a group runs light to dark-ish)
const COLOUR_GROUPS = [
  ['Blues', [['#1f4fe0', 'Cobalt'], ['#0b1b45', 'Navy'], ['#4dabf7', 'Sky'], ['#7048e8', 'Purple']]],
  ['Greens', [['#0c8599', 'Teal'], ['#12b886', 'Mint'], ['#2b8a3e', 'Forest'], ['#94d82d', 'Lime']]],
  ['Warm', [['#fab005', 'Sun'], ['#f08c00', 'Amber'], ['#e8590c', 'Orange'], ['#e03131', 'Red']]],
  ['Others', [['#d6336c', 'Pink'], ['#ae3ec9', 'Violet'], ['#495057', 'Graphite'], ['#111111', 'Black']]],
]

function ColourSheet({ value, bankColor, bankName, onPick, onClose }) {
  // A bank's own colour (not one of the 16) gets its own group at the top
  const groups = bankColor ? [[bankName ? `${bankName} colour` : 'Bank colour', [[bankColor, bankName ?? 'Bank']]], ...COLOUR_GROUPS] : COLOUR_GROUPS
  return (
    <Sheet title="Card colour" onClose={onClose}>
      <div className="pb-2">
        {groups.map(([group, colours]) => (
          <section key={group} className="mt-5 first:mt-1">
            <p className="mb-2 px-0.5 text-xs font-bold tracking-[.07em] text-muted uppercase">{group}</p>
            <div className="grid grid-cols-4 gap-2.5">
              {colours.map(([c, name]) => {
                const selected = value === c
                return (
                  <button key={c} onClick={() => onPick(c)} aria-pressed={selected} className="flex min-w-0 flex-col items-center gap-1.5">
                    <span
                      className={`relative grid h-12 w-full place-items-center overflow-clip rounded-xl text-white transition-shadow ${
                        selected ? 'shadow-[0_0_0_2.5px_var(--color-paper),0_0_0_4.5px_var(--color-ink)]' : ''
                      }`}
                      style={{ background: `linear-gradient(140deg, ${c} 0%, ${shade(c, 0.62)} 100%)` }}
                    >
                      <span className="pointer-events-none absolute -top-3.5 -right-3 size-9 rounded-full bg-white/15" />
                      {selected && <Glyph name="check" className="relative size-4" width={3} />}
                    </span>
                    <span className={`truncate text-xs font-semibold ${selected ? 'text-ink' : 'text-muted'}`}>{name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

// A card style: a tiny card in the colour, with the same soft circle as the big card
function MiniStyle({ color, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Colour ${color}`}
      aria-pressed={selected}
      className={`relative h-[34px] w-[50px] shrink-0 overflow-clip rounded-[9px] transition-shadow ${
        selected ? 'shadow-[0_0_0_2.5px_var(--color-paper),0_0_0_4.5px_var(--color-ink)]' : ''
      }`}
      style={{ background: `linear-gradient(140deg, ${color} 0%, ${shade(color, 0.62)} 100%)` }}
    >
      <span className="pointer-events-none absolute -top-3 -right-2.5 size-[26px] rounded-full bg-white/15" />
      {selected && (
        <span className="absolute inset-0 grid place-items-center text-white">
          <Glyph name="check" className="size-3.5" width={3} />
        </span>
      )}
    </button>
  )
}

// ---------- Step 3: budget day ----------
function DayStep({ today, startDay, setStartDay }) {
  const p = budgetPeriod(today, startDay)
  const pct = ((p.dayNumber - 0.5) / p.days) * 100
  const left = p.days - p.dayNumber + 1
  return (
    <div>
      <div className="relative overflow-hidden rounded-[24px] bg-cobalt p-5 text-white shadow-[0_18px_34px_-18px_#1f4fe0]">
        <LynxWatermark />
        <p className="relative flex items-center gap-2 text-sm font-semibold text-white/80">
          <Glyph name="calendar" className="size-[18px]" />
          Your budget period
        </p>
        <p className="relative mt-3 font-display text-[26px] leading-tight font-bold">
          {formatDayMonth(p.start)} <span className="text-white/50">→</span> {formatDayMonth(p.end)}
        </p>
        <div className="relative mt-4 h-2 rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white/70" style={{ width: `${pct}%` }} />
          <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-4 ring-cobalt" style={{ left: `${pct}%` }} />
        </div>
        <div className="relative mt-2 flex justify-between text-xs text-white/75">
          <span>
            Today is day {p.dayNumber} of {p.days}
          </span>
          <span>
            Starts over in {left} day{left === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-[22px] bg-card p-3">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-sm text-muted">Day of the month</span>
          <b className="text-sm text-cobalt">The {ordinal(startDay)}</b>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              onClick={() => setStartDay(d)}
              aria-pressed={startDay === d}
              className={`tabular aspect-square rounded-xl text-[15px] font-semibold transition ${
                startDay === d ? 'bg-cobalt text-white shadow-[0_6px_14px_-6px_rgba(31,79,224,0.9)]' : 'text-ink'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        {startDay > 28 ? 'In shorter months the period starts on the last day of the month.' : 'You can change this any time in Settings.'}
      </p>
    </div>
  )
}

// ---------- Step 4: categories ----------
function CategoriesStep({ categories, setCategories, kind, setKind, form, setForm }) {
  if (form) return <CategoryCreator form={form} setForm={setForm} />

  const list = categories.filter((c) => c.kind === kind)
  // Ideas sit in the same grid as faded tiles; tapping one adds it
  const ideas = CATEGORY_IDEAS.filter(([name, , , k]) => k === kind && !categories.some((c) => c.kind === k && c.name === name))
  const toggle = (c) => setCategories((all) => all.map((x) => (x === c ? { ...x, selected: !x.selected } : x)))
  const addIdea = ([name, icon, color]) => setCategories((all) => [...all, { name, icon, color, kind, selected: true }])

  const tile = (key, on, icon, name, color, onClick) => (
    <button
      key={key}
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-[84px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] px-1 transition ${
        on ? '' : 'border-transparent bg-card opacity-45'
      }`}
      style={on ? { backgroundColor: `${color}2e`, borderColor: color } : undefined}
    >
      <span className={`text-[26px] leading-none ${on ? '' : 'grayscale'}`}>{icon}</span>
      <span className="w-full truncate text-center text-xs font-semibold">{name}</span>
    </button>
  )

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-card p-1">
        {[
          ['expense', 'Expenses'],
          ['income', 'Income'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-xl py-2.5 text-sm font-semibold transition ${
              kind === k ? 'bg-cobalt text-white shadow-[0_6px_14px_-8px_rgba(31,79,224,0.9)]' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {list.map((c) => tile(`${c.kind}-${c.name}`, c.selected, c.icon, c.name, c.color ?? '#868e96', () => toggle(c)))}
        {ideas.map((idea) => tile(`idea-${idea[0]}`, false, idea[1], idea[0], idea[2], () => addIdea(idea)))}
        <button
          onClick={() => setForm({ name: '', icon: kind === 'income' ? '💰' : '🛒', color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length], kind, error: null })}
          className="flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-cobalt/40 text-cobalt"
        >
          <Glyph name="plus" className="size-6" width={2.4} />
          <span className="text-xs font-semibold">New</span>
        </button>
      </div>
    </div>
  )
}

function CategoryCreator({ form, setForm }) {
  const income = form.kind === 'income'
  const emojis = EMOJIS.includes(form.icon) ? EMOJIS : [form.icon, ...EMOJIS]
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-muted">New {form.kind} category</p>
        <SectionAction label="Cancel" onClick={() => setForm(null)} />
      </div>

      {/* How it will look: the icon tile and the name */}
      <div className="flex flex-col items-center pt-3">
        <span className="grid size-[84px] place-items-center rounded-[26px] text-[44px] transition-colors" style={{ backgroundColor: `${form.color}33` }}>
          {form.icon}
        </span>
        <b className={`mt-3 max-w-full truncate font-display text-2xl ${form.name.trim() ? '' : 'text-muted/50'}`}>{form.name.trim() || 'Category name'}</b>
        <span className="text-sm text-muted">{income ? 'Income' : 'Expense'}</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-card">
        <Row label="Name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, error: null })}
            placeholder={income ? 'e.g. Freelance' : 'e.g. Pets'}
            maxLength={24}
            className={`w-full ${plainInput}`}
          />
        </Row>
      </div>

      <div className="-mx-5 mt-4 overflow-x-auto px-4">
        <Swatches big colors={CATEGORY_COLORS} value={form.color} onChange={(color) => setForm({ ...form, color })} />
      </div>

      <div className="mt-3 rounded-2xl bg-card p-3">
        <div className="grid max-h-[190px] grid-cols-8 gap-1 overflow-y-auto [scrollbar-width:none]">
          {emojis.map((e) => (
            <button
              key={e}
              onClick={() => setForm({ ...form, icon: e })}
              aria-label={e}
              aria-pressed={form.icon === e}
              className={`grid aspect-square place-items-center rounded-xl text-xl transition ${form.icon === e ? 'bg-cobalt/10 ring-2 ring-cobalt' : ''}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      {form.error && <p className="mt-2 px-1 text-sm text-loss">{form.error}</p>}
    </div>
  )
}

// ---------- Investments (getquin) ----------
// Paste the getquin share link; it's read right away through api/getquin.js (same as the Investments tab)
const SPARK = 'M0 58 C30 54 45 48 70 50 S110 36 135 40 175 22 200 28 245 12 270 14 290 8 300 6'
function Spark({ className = '' }) {
  return (
    <svg viewBox="0 0 300 70" preserveAspectRatio="none" className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${SPARK} V70 H0Z`} fill="url(#spark-fill)" />
      <path d={SPARK} fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
const tealCard = 'relative overflow-clip rounded-[26px] text-white shadow-[0_22px_36px_-22px_rgba(12,133,153,0.95)]'
const tealBg = { background: 'linear-gradient(140deg, #16b2c6 0%, #0c8599 48%, #075a68 100%)' }
const GetquinIcon = ({ className }) => <img src="/getquin.png" alt="" className={`block shrink-0 overflow-hidden bg-white object-cover ${className}`} />
const LINK_PATH = 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'
const LinkIcon = ({ className = 'size-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={LINK_PATH} />
  </svg>
)
const pct = (rate) => `${Math.abs(rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })}%`

function InvestStep({ invest, setInvest }) {
  const [all, setAll] = useState(false)
  const shown = invest.text.replace(/^https?:\/\//, '').replace(/\/$/, '')

  async function read(text) {
    const link = cleanGetquinLink(text)
    if (!link) return setInvest({ text, link: null, status: text.trim() ? 'error' : 'idle', portfolio: null })
    setInvest({ text, link, status: 'loading', portfolio: null })
    try {
      const portfolio = await fetchPortfolio(link)
      setInvest((v) => (v.link === link ? { ...v, status: 'ok', portfolio } : v))
    } catch {
      setInvest((v) => (v.link === link ? { ...v, status: 'error' } : v))
    }
  }
  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) return read(text)
    } catch {
      // No clipboard access: the box takes a normal paste instead
    }
    document.getElementById('getquin-link')?.focus()
  }
  const clear = () => setInvest({ text: '', link: null, status: 'idle', portfolio: null })

  const steps = (highlight) => (
    <div className="overflow-hidden rounded-[22px] bg-card px-4 py-1.5">
      {[
        ['Open getquin', 'Go to the portfolio you want to see here'],
        ['Share it', 'Tap Share and turn on the public link'],
        ['Paste it here', 'Copy the link and paste it above'],
      ].map(([title, sub], i) => (
        <div key={title} className={`relative flex gap-3 py-2.5 ${highlight === i ? '-mx-4 bg-warn-bg px-4' : ''}`}>
          {i < 2 && highlight !== i && highlight !== i + 1 && <span className="absolute top-10 -bottom-2 left-[14px] w-0.5 bg-line" aria-hidden="true" />}
          <span className={`relative grid size-[30px] shrink-0 place-items-center rounded-full text-[13.5px] font-extrabold ${highlight === i ? 'bg-[#f08c00] text-white' : 'bg-teal/12 text-teal'}`}>{i + 1}</span>
          <span>
            <b className="block text-[15px]">{title}</b>
            <span className="block text-[12.5px] text-muted">{sub}</span>
          </span>
        </div>
      ))}
    </div>
  )

  // 1 · Nothing pasted yet
  if (invest.status === 'idle') {
    return (
      <div>
        <div className={`${tealCard} px-5 pt-5 pb-[84px]`} style={tealBg}>
          <span className="pointer-events-none absolute -top-[70px] -right-[60px] size-[210px] rounded-full bg-white/9" />
          <Spark className="h-[78px] opacity-90" />
          <div className="relative flex items-center gap-3">
            <GetquinIcon className="size-[46px] rounded-[14px] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.4)]" />
            <span>
              <b className="block font-display text-[19px]">Connect getquin</b>
              <span className="block text-[12.5px] text-white/85">Optional · read-only</span>
            </span>
          </div>
          <p className="relative mt-3.5 max-w-[260px] text-sm leading-snug text-white/95">See your portfolio's value, what you put in each month and every position.</p>
        </div>

        <div className="mt-4 flex items-center gap-2.5 rounded-[20px] bg-card py-1.5 pr-1.5 pl-4 ring-[1.5px] ring-line ring-inset">
          <LinkIcon className="size-5 shrink-0 text-muted/50" />
          <input
            id="getquin-link"
            value={invest.text}
            onChange={(e) => setInvest({ ...invest, text: e.target.value })}
            onPaste={(e) => {
              e.preventDefault()
              read(e.clipboardData.getData('text'))
            }}
            onKeyDown={(e) => e.key === 'Enter' && read(e.currentTarget.value)}
            onBlur={(e) => e.target.value.trim() && read(e.target.value)}
            placeholder="Paste your share link"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck="false"
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/50"
          />
          <button onClick={paste} className="h-11 shrink-0 rounded-[15px] bg-teal px-4 text-sm font-bold text-white active:opacity-85">
            Paste
          </button>
        </div>

        <p className={capClass}>Where to find it</p>
        {steps(null)}
      </div>
    )
  }

  // The pasted link as a chip: reading / connected / couldn't read
  const chip = (
    <div
      className={`flex items-center gap-3 rounded-[20px] bg-card py-2.5 pr-3 pl-3 ring-2 ring-inset ${invest.status === 'error' ? 'ring-loss' : invest.status === 'ok' ? 'ring-line' : 'ring-teal'}`}
    >
      {invest.status === 'error' ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-loss/10 text-loss">
          <LinkIcon className="size-[18px]" />
        </span>
      ) : (
        <GetquinIcon className="size-9 rounded-[11px] ring-1 ring-line" />
      )}
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px]">{shown}</b>
        <span className={`block text-xs font-semibold ${invest.status === 'error' ? 'text-loss' : invest.status === 'ok' ? 'text-gain' : 'text-teal'}`}>
          {invest.status === 'error' ? "Couldn't read this link" : invest.status === 'ok' ? 'Connected' : 'Reading your portfolio…'}
        </span>
      </span>
      {invest.status === 'loading' ? (
        <span className="size-[22px] shrink-0 animate-spin rounded-full border-[2.5px] border-teal/20 border-t-teal" />
      ) : (
        <button onClick={clear} className="shrink-0 rounded-full bg-paper px-3 py-1.5 text-[13px] font-bold text-muted">
          {invest.status === 'ok' ? 'Change' : 'Clear'}
        </button>
      )}
    </div>
  )

  // 4 · Couldn't read it
  if (invest.status === 'error') {
    return (
      <div>
        {chip}
        <div className="mt-3 flex gap-3 rounded-[20px] bg-loss/8 p-4">
          <span className="grid size-[38px] shrink-0 place-items-center rounded-[12px] bg-card font-display text-lg font-extrabold text-loss shadow-[0_6px_14px_-10px_rgba(194,59,34,0.6)]">!</span>
          <span>
            <b className="block text-[15px]">Is the share turned on?</b>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">getquin only lets LynxOS read a portfolio whose public link is on. Turn it on, then paste the link again.</span>
          </span>
        </div>
        <p className={capClass}>Where to find it</p>
        {steps(1)}
      </div>
    )
  }

  // 2 · Reading
  if (invest.status === 'loading' || !invest.portfolio) {
    const bar = 'rounded-lg bg-gradient-to-r from-line/70 via-paper to-line/70'
    return (
      <div>
        {chip}
        <div className={`${tealCard} mt-3.5 p-5`} style={tealBg}>
          <span className="pointer-events-none absolute -top-[70px] -right-[60px] size-[210px] rounded-full bg-white/9" />
          <p className="relative text-[13px] font-semibold text-white/85">Portfolio value</p>
          <div className="relative mt-2 h-9 w-48 animate-pulse rounded-xl bg-white/20" />
          <div className="relative mt-2.5 h-3.5 w-28 animate-pulse rounded-md bg-white/14" />
          <div className="relative mt-4 grid grid-cols-2 gap-2">
            <div className="h-[50px] rounded-[15px] bg-white/12" />
            <div className="h-[50px] rounded-[15px] bg-white/12" />
          </div>
        </div>
        <p className={capClass}>Positions</p>
        <div className="overflow-hidden rounded-[22px] bg-card">
          {[70, 55, 62].map((w) => (
            <div key={w} className="flex animate-pulse items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className={`size-[42px] ${bar}`} />
              <span className="flex-1">
                <span className={`block h-3 ${bar}`} style={{ width: `${w}%` }} />
                <span className={`mt-2 block h-2.5 w-[38%] ${bar}`} />
              </span>
              <span className={`h-3.5 w-16 ${bar}`} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 3 · Connected
  const p = invest.portfolio
  const gain = p.value_cents - p.invested_cents
  const rate = p.invested_cents ? gain / p.invested_cents : 0
  const [euros, decimals] = formatCents(p.value_cents).split(',')
  const list = all ? p.positions : p.positions.slice(0, 3)
  return (
    <div>
      <div className={`${tealCard} px-[18px] pt-[18px] pb-4`} style={tealBg}>
        <span className="pointer-events-none absolute -top-[70px] -right-[60px] size-[210px] rounded-full bg-white/9" />
        <div className="relative flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white/85">Portfolio value</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/18 py-1 pr-2.5 pl-1 text-xs font-bold">
            <GetquinIcon className="size-5 rounded-[6px]" />
            getquin
          </span>
        </div>
        <p className="tabular relative mt-0.5 font-display leading-tight font-extrabold tracking-tight">
          <span className="text-[38px]">{euros}</span>
          <span className="text-xl text-white/55">,{decimals}</span>
        </p>
        <span className={`tabular relative mt-1 inline-flex rounded-full bg-white/95 px-2.5 py-1 text-[12.5px] font-bold ${gain < 0 ? 'text-loss' : 'text-gain'}`}>
          {gain < 0 ? '▼' : '▲'} {formatCents(Math.abs(gain)).replace(/,\d\d$/, '')} · {pct(rate)}
        </span>
        <div className="relative -mx-[18px] mt-1.5 h-10">
          <Spark className="h-10" />
        </div>
        <div className="relative grid grid-cols-2 rounded-2xl bg-white/14">
          <div className="px-3 py-2.5">
            <span className="block text-[11px] font-semibold text-white/78">Invested</span>
            <b className="tabular font-display text-[16.5px]">{formatCents(p.invested_cents).replace(/,\d\d$/, '')}</b>
          </div>
          <div className="border-l border-white/16 px-3 py-2.5">
            <span className="block text-[11px] font-semibold text-white/78">Positions</span>
            <b className="tabular font-display text-[16.5px]">{p.positions.length}</b>
          </div>
        </div>
      </div>

      <div className="mt-4 mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-bold tracking-[.07em] text-muted uppercase">{all ? 'Positions' : 'Top positions'}</span>
        <span className="flex items-center gap-1 rounded-full bg-gain/12 px-2.5 py-1 text-[12.5px] font-bold text-gain">
          <Glyph name="check" className="size-3.5" width={3} />
          Connected
        </span>
      </div>
      <div className="overflow-hidden rounded-[22px] bg-card">
        {list.map((pos) => {
          const share = p.value_cents ? pos.value_cents / p.value_cents : 0
          return (
            <div key={`${pos.ticker}-${pos.name}`} className="border-b border-line px-4 py-2.5 last:border-0">
              <div className="flex items-center gap-3">
                <span className="grid size-[42px] shrink-0 place-items-center overflow-hidden rounded-[13px] bg-white ring-1 ring-line">
                  {pos.logo ? <img src={pos.logo} alt="" className="size-full object-cover" /> : <b className="text-xs text-teal">{(pos.ticker || pos.name).slice(0, 3).toUpperCase()}</b>}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]">{pos.name}</b>
                  <span className="block truncate text-xs text-muted">
                    {[pos.ticker, pos.units != null && `${pos.units.toLocaleString('de-DE', { maximumFractionDigits: pos.units < 1 ? 4 : 2 })} units`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <b className="tabular block font-display text-[15px]">{formatCents(pos.value_cents)}</b>
                  <span className={`tabular block text-[11.5px] font-bold ${pos.gain_cents < 0 ? 'text-loss' : 'text-gain'}`}>
                    {pos.gain_cents < 0 ? '−' : '+'}
                    {formatCents(Math.abs(pos.gain_cents)).replace(/,\d\d$/, '')} · {pos.gain_rate < 0 ? '−' : '+'}
                    {pct(pos.gain_rate)}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-[54px]">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-paper">
                  <span className="block h-full rounded-full bg-gradient-to-r from-[#16b2c6] to-teal" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                </span>
                <span className="tabular w-10 text-right text-[11px] font-semibold text-muted">{pct(share)}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-4 text-[13.5px] font-semibold text-teal">
        {p.positions.length > 3 && (
          <>
            <button onClick={() => setAll((v) => !v)} className="py-2">
              {all ? 'Show fewer' : `See all ${p.positions.length}`}
            </button>
            <span className="text-line">|</span>
          </>
        )}
        <button onClick={clear} className="py-2">
          Change link
        </button>
      </div>
    </div>
  )
}

// ---------- Savings goals ----------
// Goal ideas (tile label, goal name, emoji). A goal's card colour comes from its emoji (no colour is stored).
const GOAL_IDEAS = [
  ['Emergency', 'Emergency fund', '🛟'],
  ['Travel', 'Travel', '✈️'],
  ['House', 'House', '🏠'],
  ['Car', 'Car', '🚗'],
  ['Wedding', 'Wedding', '💍'],
  ['Studies', 'Studies', '🎓'],
  ['Gift', 'Gift', '🎁'],
]
const GOAL_EMOJIS = ['🎯', '🛟', '✈️', '🏠', '🚗', '💍', '🎓', '🎁', '💻', '🐶', '🏖️', '📱']
const GOAL_COLORS = { '🎯': '#1f4fe0', '🛟': '#2b8a3e', '✈️': '#1c7ed6', '🏠': '#e8590c', '🚗': '#7048e8', '💍': '#d6336c', '🎓': '#0c8599', '🎁': '#f08c00', '💻': '#495057', '🐶': '#a0522d', '🏖️': '#e8a400', '📱': '#0b1b45' }
const goalColor = (icon) => GOAL_COLORS[icon] ?? '#1f4fe0'
// "Jun 2027"
const monthYear = (iso) => {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).replace('Sept', 'Sep')
}
const wholeEuros = (cents) => formatCents(cents).replace(/,\d\d$/, '')

// A goal as a coloured card: emoji, name, money in it, progress bar, % of target and deadline
function GoalCard({ goal, className = '', style, onClick }) {
  const color = goalColor(goal.icon)
  const pct = goal.targetCents ? Math.min(100, Math.round((goal.startCents / goal.targetCents) * 100)) : 0
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`relative block w-full overflow-clip rounded-[22px] p-4 text-left text-white ${className}`}
      style={{ background: `linear-gradient(140deg, ${color} 0%, ${shade(color, 0.72)} 100%)`, ...style }}
    >
      <span className="pointer-events-none absolute -top-12 -right-10 size-[150px] rounded-full bg-white/12" />
      <span className="relative flex items-center gap-2.5">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-[12px] bg-white/90 text-xl">{goal.icon}</span>
        <b className={`min-w-0 flex-1 truncate font-display text-[17px] ${goal.name ? '' : 'text-white/60'}`}>{goal.name || 'Goal name'}</b>
        <b className="tabular shrink-0 font-display text-[19px]">{wholeEuros(goal.startCents)}</b>
      </span>
      <span className="relative mt-5 block h-1.5 overflow-hidden rounded-full bg-white/25">
        <span className="block h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${Math.max(pct, 2)}%` }} />
      </span>
      <span className="tabular relative mt-2 flex justify-between text-[12.5px] text-white/90">
        <span>{goal.targetCents ? `${pct}% of ${wholeEuros(goal.targetCents)}` : 'Set a target'}</span>
        <span>{goal.deadline ? `by ${monthYear(goal.deadline)}` : 'No deadline'}</span>
      </span>
    </Tag>
  )
}

function GoalsStep({ today, goals, form, setForm, savingsCents, hasSavings, savingsName, freeFor, onOpen, onRemove }) {
  const [picking, setPicking] = useState(null) // null | 'target' | 'start' | 'date'

  if (form) {
    const targetCents = parseToCents(form.target) ?? 0
    const startCents = hasSavings ? (parseToCents(form.start) ?? 0) : 0
    const free = Math.max(freeFor(form.key), 0)
    const color = goalColor(form.icon)
    const emojis = GOAL_EMOJIS.includes(form.icon) ? GOAL_EMOJIS : [form.icon, ...GOAL_EMOJIS]
    const close = () => setPicking(null)
    return (
      <div className="pt-6">
        <div className="mb-3.5 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-muted">{form.key ? 'Edit goal' : 'New goal'}</p>
          <SectionAction label="Cancel" onClick={() => setForm(null)} />
        </div>

        {/* The goal's own card, as it will look in the list */}
        <GoalCard goal={{ name: form.name.trim(), icon: form.icon, startCents, targetCents, deadline: form.deadline }} style={{ boxShadow: `0 18px 32px -18px ${color}` }} />

        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {emojis.map((e) => (
            <button
              key={e}
              onClick={() => setForm({ ...form, icon: e })}
              aria-pressed={form.icon === e}
              className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-card text-xl transition-shadow"
              style={form.icon === e ? { backgroundColor: `${goalColor(e)}22`, boxShadow: `0 0 0 2px ${goalColor(e)}` } : undefined}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="mt-3.5 overflow-hidden rounded-[20px] bg-card">
          <Row label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, error: null })}
              placeholder="e.g. Japan trip"
              maxLength={40}
              enterKeyHint="done"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={`w-full ${plainInput}`}
            />
          </Row>
          <Row label="Target">
            <button onClick={() => setPicking('target')} className={`tabular text-base font-semibold ${targetCents ? 'text-ink' : 'text-muted/60'}`}>
              {formatCents(targetCents)}
            </button>
          </Row>
          <Row label="Deadline">
            <button onClick={() => setPicking('date')} className={`flex items-center gap-1 text-base font-semibold ${form.deadline ? '' : 'font-normal text-muted/60'}`}>
              {form.deadline ? monthYear(form.deadline) : 'Optional'}
              <Icon name="chevronRight" size={16} className="text-muted/60" />
            </button>
          </Row>
        </div>

        {hasSavings ? (
          <div className="mt-2.5 overflow-hidden rounded-[20px] bg-card">
            <button onClick={() => setPicking('start')} className="flex min-h-[62px] w-full items-center gap-3 px-4 text-left">
              <span className="flex-1">
                <span className="block text-[15px] text-muted">Start with</span>
                <span className="tabular block text-xs text-muted/80">{wholeEuros(free)} free in savings</span>
              </span>
              <span className={`tabular text-base font-semibold ${startCents ? 'text-ink' : 'text-muted/60'}`}>{formatCents(startCents)}</span>
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-gradient-to-br from-tint-from to-tint-to px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-card text-cobalt shadow-[0_4px_10px_-6px_rgba(31,79,224,0.5)]">
              <Glyph name="savings" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px]">Starts at €0</b>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">It fills up once you have a savings account and move money into it.</span>
            </span>
          </div>
        )}

        {form.error && <p className="mt-3 px-1 text-sm text-loss">{form.error}</p>}
        {form.key && (
          <button onClick={() => onRemove(form.key)} className="mx-auto mt-5 block py-2 text-sm font-semibold text-loss">
            Remove goal
          </button>
        )}

        {picking === 'target' && <AmountPad label="Target" amount={form.target} onChange={(target) => setForm({ ...form, target, error: null })} onDone={close} />}
        {picking === 'start' && (
          <AmountPad
            label="Start with"
            amount={form.start}
            max={free}
            maxText={`Only ${wholeEuros(free)} is free in savings`}
            onChange={(start) => setForm({ ...form, start, error: null })}
            onDone={close}
          />
        )}
        {picking === 'date' && (
          <Sheet
            title="Deadline"
            onClose={close}
            action={
              form.deadline && (
                <button
                  onClick={() => {
                    setForm({ ...form, deadline: null })
                    close()
                  }}
                  className="px-2 text-sm font-semibold text-loss"
                >
                  Remove
                </button>
              )
            }
          >
            <DatePicker
              value={form.deadline ?? today}
              dimFuture={false}
              quickPicks={false}
              onChange={(iso) => {
                setForm({ ...form, deadline: iso < today ? today : iso })
                close()
              }}
            />
          </Sheet>
        )}
      </div>
    )
  }

  const free = freeFor(null)
  const ideas = GOAL_IDEAS.filter(([, name]) => !goals.some((g) => g.name.toLowerCase() === name.toLowerCase()))
  const STEP = 124
  return (
    <div>
      {/* What's in savings, and how much of it isn't in a goal yet */}
      <div className="flex items-end justify-between px-1 pb-3.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-muted">{hasSavings ? `In savings · ${savingsName}` : 'In savings'}</p>
          <b className={`tabular block font-display text-[30px] leading-tight tracking-tight ${hasSavings ? '' : 'text-muted'}`}>{wholeEuros(savingsCents)}</b>
        </div>
        <span className={`tabular shrink-0 rounded-full bg-card px-3 py-1.5 text-[13px] font-bold ${!hasSavings ? 'text-muted' : free < 0 ? 'text-loss' : 'text-cobalt'}`}>
          {!hasSavings ? 'No savings account' : free < 0 ? `${wholeEuros(-free)} too much` : `${wholeEuros(free)} free`}
        </span>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-[22px] bg-card px-5 pt-6 pb-5 text-center">
          {/* A small stack of goal cards */}
          <div className="relative mx-auto mb-3 h-24 w-[230px]" aria-hidden="true">
            <span className="absolute inset-x-6 top-0 h-[70px] rounded-2xl opacity-45" style={{ background: 'linear-gradient(140deg,#94d82d,#7aa625)' }} />
            <span className="absolute inset-x-3 top-3.5 h-[70px] rounded-2xl opacity-60" style={{ background: 'linear-gradient(140deg,#1c7ed6,#155ea0)' }} />
            <span className="absolute inset-x-0 top-7 flex h-[68px] items-center gap-2.5 rounded-2xl px-3.5 text-white shadow-[0_10px_22px_-12px_rgba(11,27,69,0.5)]" style={{ background: 'linear-gradient(140deg,#2b8a3e,#22702f)' }}>
              <span className="grid size-8 place-items-center rounded-[10px] bg-white/90 text-[17px]">🛟</span>
              <b className="flex-1 text-left font-display text-sm">Your first goal</b>
              <b className="font-display text-[15px]">€0</b>
            </span>
          </div>
          <b className="font-display text-lg">{hasSavings ? 'Give your savings a purpose' : 'Goals start at €0'}</b>
          <p className="mt-1.5 text-[13.5px] leading-snug text-muted">
            {hasSavings
              ? `Split the ${wholeEuros(savingsCents)} in your savings into goals. What you don't put in a goal stays in General savings.`
              : "You didn't add a savings account. Create goals now; they fill up as you move money to savings."}
          </p>
        </div>
      ) : (
        <>
          {/* The goals stacked like cards in a wallet; tap one to edit it */}
          <div className="relative" style={{ height: STEP * (goals.length - 1) + 150 }}>
            {goals.map((g, i) => (
              <div key={g.key} className="absolute inset-x-0" style={{ top: i * STEP }}>
                <GoalCard goal={g} onClick={() => onOpen(null, g)} className="h-[150px]" style={{ boxShadow: '0 -8px 20px -12px rgba(11,27,69,0.45)' }} />
              </div>
            ))}
          </div>
          {free < 0 && <p className="mt-3 px-1 text-sm text-loss">Your goals start with more than is in savings. Tap a goal and lower its Start with.</p>}
        </>
      )}

      <p className={capClass}>{goals.length ? 'Add another' : 'Add a goal'}</p>
      <div className="grid grid-cols-4 gap-2">
        {ideas.map(([label, name, icon]) => (
          <button key={name} onClick={() => onOpen({ name, icon })} className="flex min-w-0 flex-col items-center gap-1.5 rounded-[18px] bg-card px-1 pt-3 pb-2.5 active:scale-[.97]">
            <span className="grid size-10 place-items-center rounded-[12px] text-[21px]" style={{ backgroundColor: `${goalColor(icon)}22` }}>
              {icon}
            </span>
            <span className="w-full truncate text-center text-[11.5px] font-semibold text-muted">{label}</span>
          </button>
        ))}
        <button onClick={() => onOpen(null)} className="flex flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-cobalt/40 px-1 py-2.5 text-cobalt">
          <span className="grid size-10 place-items-center rounded-[12px] bg-cobalt/10">
            <Glyph name="plus" className="size-5" width={2.4} />
          </span>
          <span className="text-[11.5px] font-semibold">Other</span>
        </button>
      </div>
    </div>
  )
}

// ---------- Step 5: regular payments ----------
// "In 5 days · Thu 16 Oct" / "Today" / "Tomorrow · Fri 17 Oct"
function whenText(iso, today) {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
  const day = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '').replace('Sept', 'Sep')
  if (days <= 0) return 'Today'
  return `${days === 1 ? 'Tomorrow' : `In ${days} days`} · ${day}`
}

// One added payment, like the rows on the Recurring page: logo, name, when, amount per period
function PaymentRow({ payment, today, children }) {
  const income = payment.type === 'income'
  const per = FREQUENCIES.find((f) => f[0] === payment.frequency)[3]
  return (
    <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
      <MerchantIcon name={payment.name} className="size-10 rounded-xl bg-paper text-lg">
        {payment.icon}
      </MerchantIcon>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{payment.name}</b>
        <span className="block truncate text-xs text-muted">{whenText(payment.nextDue, today)}</span>
      </span>
      <span className={`tabular shrink-0 text-right font-display font-bold ${income ? 'text-gain' : ''}`}>
        {income && '+'}
        {formatCents(payment.cents)}
        <span className="block text-[11px] font-semibold text-muted">/{per}</span>
      </span>
      {children}
    </div>
  )
}

function PaymentsStep({ today, accounts, categories, payments, form, setForm, onOpen, onRemove }) {
  const [kind, setKind] = useState('expense')
  const [picking, setPicking] = useState(null) // null | 'amount' | 'date' | 'account' | 'category'

  if (form) {
    const income = form.type === 'income'
    // Money comes in to any account; payments go out of spending accounts
    const choices = accounts.filter((a) => income || a.type !== 'savings')
    // Every category the user kept or created for this kind in the Categories step
    const cats = categories.filter((c) => c.kind === form.type && c.selected)
    const account = accounts.find((a) => a.key === form.accountKey)
    const category = cats.find((c) => c.name === form.categoryName)
    const cents = parseToCents(form.amount) ?? 0
    const per = FREQUENCIES.find((f) => f[0] === form.frequency)[3]
    const [euros, decimals] = formatCents(cents).split(',')
    const close = () => setPicking(null)
    return (
      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-muted">{income ? 'New income' : 'New payment'}</p>
          <SectionAction label="Cancel" onClick={() => setForm(null)} />
        </div>

        {/* How it will look on the Recurring page */}
        <div className="flex items-center gap-3.5 rounded-[22px] bg-card p-4 shadow-[0_14px_28px_-20px_rgba(11,27,69,0.35)]">
          <MerchantIcon name={form.name} className="size-[52px] rounded-2xl bg-paper text-[28px]">
            {form.icon}
          </MerchantIcon>
          <span className="min-w-0 flex-1">
            <b className={`block truncate font-display text-xl leading-tight ${form.name.trim() ? '' : 'text-muted/50'}`}>{form.name.trim() || 'Name'}</b>
            <span className="mt-0.5 block truncate text-[13px] text-muted">{whenText(form.nextDue, today)}</span>
          </span>
          <span className="shrink-0 text-right">
            <b className={`tabular block font-display text-xl leading-tight ${cents ? (income ? 'text-gain' : '') : 'text-muted/50'}`}>
              {income && cents ? '+' : ''}
              {euros}
              {decimals !== '00' && <span className="text-sm opacity-60">,{decimals}</span>}
            </b>
            <span className="block text-xs text-muted">per {per}</span>
          </span>
        </div>

        <p className={capClass}>{income ? 'Income' : 'Payment'}</p>
        <div className="overflow-hidden rounded-[20px] bg-card">
          <Row label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, error: null })}
              placeholder={income ? 'e.g. Salary' : 'e.g. Netflix'}
              maxLength={40}
              enterKeyHint="done"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={`w-full ${plainInput}`}
            />
          </Row>
          <Row label="Amount">
            <button onClick={() => setPicking('amount')} className={`tabular text-base font-semibold ${cents ? 'text-ink' : 'text-muted/60'}`}>
              {formatCents(cents)}
            </button>
          </Row>
          <Row label="Repeats">
            <div className="grid grid-cols-3 rounded-xl bg-paper p-[3px]">
              {FREQUENCIES.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setForm({ ...form, frequency: value })}
                  aria-pressed={form.frequency === value}
                  className={`rounded-[9px] px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    form.frequency === value ? 'bg-card text-ink shadow-[0_2px_6px_rgba(11,27,69,0.12)]' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Row>
          <Row label={income ? 'Next date' : 'Next payment'}>
            <button onClick={() => setPicking('date')} className="flex items-center gap-1 text-base font-semibold">
              {form.nextDue === today ? 'Today' : formatDayMonth(form.nextDue)}
              <Icon name="chevronRight" size={16} className="text-muted/60" />
            </button>
          </Row>
        </div>

        <p className={capClass}>{income ? 'Paid into & category' : 'Paid from & category'}</p>
        <div className="overflow-hidden rounded-[20px] bg-card">
          <Row label={income ? 'Paid into' : 'Paid from'}>
            <button onClick={() => setPicking('account')} className="flex min-w-0 items-center gap-2 text-base font-semibold">
              {account && <MiniCard account={account} className="h-5 w-[30px] rounded-[5px]" iconClass="size-3" />}
              <span className="truncate">{account?.name ?? 'Choose'}</span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-muted/60" />
            </button>
          </Row>
          <Row label="Category">
            <button onClick={() => setPicking('category')} className="flex min-w-0 items-center gap-2 text-base font-semibold">
              {category && <span className="text-lg leading-none">{category.icon}</span>}
              <span className={`truncate ${category ? '' : 'text-muted/60'}`}>{category?.name ?? 'Choose'}</span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-muted/60" />
            </button>
          </Row>
        </div>
        {form.error && <p className="mt-3 px-1 text-sm text-loss">{form.error}</p>}

        {picking === 'amount' && (
          <AmountPad label={income ? 'Amount received' : 'Amount'} amount={form.amount} onChange={(amount) => setForm({ ...form, amount, error: null })} onDone={close} />
        )}
        {picking === 'date' && (
          <Sheet title={income ? 'Next date' : 'Next payment'} onClose={close}>
            <DatePicker
              value={form.nextDue}
              dimFuture={false}
              quickPicks={false}
              onChange={(iso) => {
                setForm({ ...form, nextDue: iso < today ? today : iso })
                close()
              }}
            />
          </Sheet>
        )}
        {picking === 'account' && (
          <Sheet title={income ? 'Paid into' : 'Paid from'} onClose={close}>
            <div className="overflow-hidden rounded-[20px] bg-card">
              {choices.map((a) => (
                <button
                  key={a.key}
                  onClick={() => {
                    setForm({ ...form, accountKey: a.key })
                    close()
                  }}
                  className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 active:bg-paper"
                >
                  <MiniCard account={a} className="h-8 w-12 rounded-lg" iconClass="size-3.5" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{a.name}</b>
                    <span className="block text-xs text-muted">{TYPES[a.type].label}</span>
                  </span>
                  {form.accountKey === a.key && <Glyph name="check" className="size-5 text-cobalt" width={2.6} />}
                </button>
              ))}
            </div>
          </Sheet>
        )}
        {picking === 'category' && (
          <Sheet title="Category" onClose={close}>
            <div className="grid grid-cols-3 gap-2 pb-2">
              {cats.map((c) => {
                const on = form.categoryName === c.name
                return (
                  <button
                    key={c.name}
                    onClick={() => {
                      setForm({ ...form, categoryName: c.name })
                      close()
                    }}
                    aria-pressed={on}
                    className={`flex h-[78px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] px-1 transition ${on ? '' : 'border-transparent bg-card'}`}
                    style={on ? { backgroundColor: `${c.color}2e`, borderColor: c.color } : undefined}
                  >
                    <span className="text-[24px] leading-none">{c.icon}</span>
                    <span className="w-full truncate text-center text-xs font-semibold">{c.name}</span>
                  </button>
                )
              })}
            </div>
          </Sheet>
        )}
      </div>
    )
  }

  const shown = payments.map((p, i) => ({ p, i })).filter(({ p }) => (p.type ?? 'expense') === kind)
  const ideas = PAYMENT_IDEAS.filter((idea) => idea[4] === kind && !payments.some((p) => p.name === idea[0]))
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-card p-1">
        {[
          ['expense', 'Payments'],
          ['income', 'Income'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-xl py-2.5 text-sm font-semibold transition ${kind === k ? 'bg-cobalt text-white shadow-[0_6px_14px_-8px_rgba(31,79,224,0.9)]' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-[20px] bg-card">
          {shown.map(({ p, i }) => (
            <PaymentRow key={`${p.name}-${i}`} payment={p} today={today}>
              <RemoveButton label={`Remove ${p.name}`} onClick={() => onRemove(i)} />
            </PaymentRow>
          ))}
        </div>
      )}
      {shown.length > 0 && <p className="mt-5 mb-2 px-1 text-sm text-muted">Add more</p>}

      <div className={`grid grid-cols-4 gap-2 ${shown.length ? '' : 'mt-3'}`}>
        {ideas.map((idea) => (
          <button key={idea[0]} onClick={() => onOpen(idea, kind)} className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl bg-card px-1 pt-2.5 pb-2 active:scale-[.97]">
            <MerchantIcon name={idea[0]} className="size-9 rounded-[10px] bg-paper text-xl">
              {idea[1]}
            </MerchantIcon>
            <span className="line-clamp-2 w-full text-center text-[11px] leading-tight font-semibold">{idea[0]}</span>
          </button>
        ))}
        <button onClick={() => onOpen(null, kind)} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-cobalt/40 px-1 py-2 text-cobalt">
          <Glyph name="plus" className="size-6" width={2.4} />
          <span className="text-[11px] font-semibold">Other</span>
        </button>
      </div>
    </div>
  )
}

// ---------- Finish ----------
function Finish({ accounts, startDay, categories, goals, payments, saveState, saveError }) {
  const expenses = categories.filter((c) => c.kind === 'expense' && c.selected)
  const income = categories.filter((c) => c.kind === 'income' && c.selected)
  const period = budgetPeriod(todayISO(), startDay)
  const perMonth = payments.filter((p) => p.type !== 'income').reduce((t, p) => t + monthlyCents({ amount_cents: p.cents, frequency: p.frequency }), 0)
  const lines = [
    [
      <span key="cards" className="relative block h-6 w-8">
        {accounts.slice(-3).map((a, i, list) => (
          <span
            key={a.key}
            className="absolute inset-0 rounded-md ring-1 ring-white/50"
            style={{ backgroundColor: a.color, transform: `rotate(${-12 + (i + 3 - list.length) * 6}deg)` }}
          />
        ))}
      </span>,
      `${accounts.length} account${accounts.length === 1 ? '' : 's'}`,
      'Bank, cash and meal cards count toward your budget',
      <b key="v" className="tabular font-display text-cobalt">{formatCents(budgetOf(accounts)).replace(/,\d\d$/, '')}</b>,
    ],
    [<Glyph key="i" name="calendar" />, 'Budget period', `Starts on the ${ordinal(startDay)} of each month`, <b key="v" className="text-sm">{formatDayMonth(period.start)} – {formatDayMonth(period.end)}</b>],
    [<Glyph key="i" name="tag" />, `${expenses.length} expense · ${income.length} income categories`, [...expenses, ...income].slice(0, 8).map((c) => c.icon).join(' ')],
    [
      <Glyph key="i" name="savings" />,
      `${goals.length} savings goal${goals.length === 1 ? '' : 's'}`,
      goals.length ? goals.map((g) => `${g.icon} ${g.name}`).join(', ') : 'You can add them later',
      goals.some((g) => g.startCents) ? <b key="v" className="tabular text-sm">{formatCents(goals.reduce((t, g) => t + g.startCents, 0)).replace(/,\d\d$/, '')}</b> : null,
    ],
    [
      <Glyph key="i" name="repeat" />,
      `${payments.length} regular payment${payments.length === 1 ? '' : 's'}`,
      payments.length ? payments.map((p) => p.name).join(', ') : 'You can add them later',
      payments.length ? <b key="v" className="tabular text-sm">{formatCents(perMonth).replace(/,\d\d$/, '')}/mo</b> : null,
    ],

  ]
  return (
    <div className="pt-8">
      <span className="relative block w-fit">
        <img src="/logo.png" alt="" className="size-[76px]" />
        <span className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full bg-gain text-white ring-4 ring-paper">
          <Glyph name="check" className="size-4" width={3} />
        </span>
      </span>
      <h1 className="mt-5 font-display text-[42px] leading-none font-extrabold tracking-tight">
        You’re all <span className="brand-text">set</span>
      </h1>
      <p className="mt-3 text-muted">
        {saveState === 'failed'
          ? 'Your setup could not be saved yet. Check your connection and try again.'
          : 'Here’s your setup. Change any of it in Settings.'}
      </p>
      {saveError && <p className="mt-2 rounded-xl bg-loss/10 px-3 py-2 text-sm text-loss">{saveError}</p>}
      <div className="mt-5 overflow-hidden rounded-[22px] bg-card">
        {lines.map(([icon, title, sub, right], i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">{icon}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate">{title}</b>
              <span className="block truncate text-xs text-muted">{sub}</span>
            </span>
            {right}
          </div>
        ))}
      </div>
    </div>
  )
}
