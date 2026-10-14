import { useEffect, useRef, useState } from 'react'
import DatePicker from '../components/DatePicker'
import Avatar from '../components/Avatar'
import AmountPad from '../components/AmountPad'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import LynxWatermark from '../components/LynxWatermark'
import { BankLogo } from '../components/BankCard'
import { BANKS, bankFor, MEAL_CARDS } from '../lib/banks'
import { budgetPeriod } from '../lib/budget'
import { formatDayMonth, shiftDays, todayISO } from '../lib/dates'
import { DEFAULT_CATEGORIES } from '../lib/defaults'
import { EMOJIS } from '../lib/emojis'
import { formatCents, parseToCents } from '../lib/money'
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
  { key: 'done' },
]
const NUMBERED = STEPS.length - 2

const TYPES = {
  debit: { label: 'Bank', placeholder: 'e.g. Revolut', color: '#1f4fe0' },
  meal: { label: 'Meal card', placeholder: 'e.g. Coverflex', color: '#f2705a' },
  cash: { label: 'Cash', placeholder: 'e.g. Wallet', color: '#2b8a3e' },
  savings: { label: 'Savings', placeholder: 'e.g. Savings', color: '#7048e8' },
  credit: { label: 'Credit card', placeholder: 'e.g. Visa', color: '#e8590c' },
  investment: { label: 'Investment', placeholder: 'e.g. Trade Republic', color: '#0c8599' },
}
const ACCOUNT_COLORS = [
  '#1f4fe0', '#0b1b45', '#4dabf7', '#0c8599', '#12b886', '#2b8a3e', '#94d82d', '#fab005',
  '#f08c00', '#e8590c', '#e03131', '#d6336c', '#ae3ec9', '#7048e8', '#495057', '#111111',
]
const CATEGORY_COLORS = ['#1f9d55', '#e8590c', '#1f4fe0', '#6741d9', '#d6336c', '#0c8599', '#f08c00', '#495057']
const CATEGORY_IDEAS = [
  ['Travel', '✈️', '#1c7ed6', 'expense'], ['Subscriptions', '📺', '#7048e8', 'expense'], ['Car', '🚗', '#1971c2', 'expense'],
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
  credit: 'M5 5h14a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 5 5zM2.5 10h19M6.5 15h4',
  meal: 'M6 3v6a3 3 0 0 0 6 0V3M9 3v18M17 21V3c-2 1.5-3 4-3 7s1 3.5 3 3.5',
  investment: 'M3 17l6-6 4 4 8-8M15 7h6v6',
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
const amountWidth = (text) => ({ width: `${Math.max(4, text.length) + 0.5}ch` })
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
  }, [step, accountForm === null, categoryForm === null, paymentForm === null])

  async function save() {
    setSaveState('saving')
    setSaveError(null)
    try {
      await saveOnboarding({ profile, accounts, categories, payments, startDay }, saved.current)
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
    const type = ['savings', 'credit', 'cash', 'debit'].find((t) => !accounts.some((a) => a.type === t)) ?? 'debit'
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

  function openPaymentForm(idea, type = 'expense') {
    const income = type === 'income'
    // Money comes in to a spending account; payments go out of spending accounts and credit cards
    const spendable = accounts.filter((a) => a.type !== 'savings' && a.type !== 'investment')
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
  } else if (key === 'payments')
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
          <Finish accounts={accounts} startDay={startDay} categories={categories} payments={payments} saveState={saveState} saveError={saveError} />
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
            <h1 className={`mt-6 font-display text-[34px] leading-[1.02] font-extrabold tracking-tight ${STEPS[step].center ? 'text-center' : ''}`}>{STEPS[step].title}</h1>
            {STEPS[step].sub ? <p className="mt-2 mb-5 text-muted">{STEPS[step].sub}</p> : <div className="mb-5" />}

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

  if (form) {
    const t = TYPES[form.type]
    const owed = form.type === 'credit'
    const cents = parseToCents(form.amount) ?? 0
    const [whole, decimals] = formatCents(owed && cents ? -cents : cents).split(',')
    const bank = bankFor(form.name)
    // A picked bank's colour (or one not in the list) goes first, so the selected colour is in view
    const colors = bank || !ACCOUNT_COLORS.includes(form.color) ? [form.color, ...ACCOUNT_COLORS.filter((c) => c !== form.color)] : ACCOUNT_COLORS
    const pickBank = (b) => setForm({ ...form, name: b.name, color: b.color })
    return (
      <div>
        {accounts.length > 0 && (
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-muted">Account {accounts.length + 1}</p>
            <SectionAction label="Cancel" onClick={() => setForm(null)} />
          </div>
        )}
        {/* The account drawn as a bank card, updated while typing */}
        <div
          className="relative h-[178px] overflow-hidden rounded-[24px] p-5 text-white transition-colors"
          style={{ background: `linear-gradient(140deg, ${form.color} 0%, ${shade(form.color, 0.62)} 100%)`, boxShadow: `0 18px 34px -18px ${form.color}` }}
        >
          <span className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -right-16 -bottom-24 size-56 rounded-full bg-white/[.06]" />
          {/* Logo (or type icon) with the name beside it and the type under the name */}
          <div className="relative flex items-center gap-3">
            {bank ? (
              <BankLogo bank={bank} className="size-11" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-[24%] bg-white/15">
                <Glyph name={form.type} className="size-[22px]" />
              </span>
            )}
            <span className="min-w-0">
              <span className={`block truncate text-base leading-tight font-semibold ${form.name.trim() ? '' : 'text-white/55'}`}>
                {form.name.trim() || t.placeholder}
              </span>
              <span className="block text-xs text-white/70">{t.label}</span>
            </span>
          </div>
          <p className="relative mt-6 text-xs text-white/70">{owed ? 'Owed today' : form.type === 'investment' ? 'Invested so far' : 'Balance today'}</p>
          <button onClick={() => setPadOpen(true)} className={`tabular relative font-display leading-tight font-bold ${owed && cents ? 'text-[#ffb4a8]' : ''}`}>
            <span className="text-[30px]">{whole}</span>
            <span className="text-lg opacity-60">,{decimals}</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-card p-1">
          {Object.entries(TYPES).map(([type, info]) => (
            <button
              key={type}
              onClick={() => setForm({ ...form, type, color: bank ? form.color : info.color, error: null })}
              aria-pressed={form.type === type}
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition ${
                form.type === type ? 'bg-cobalt text-white shadow-[0_6px_14px_-8px_rgba(31,79,224,0.9)]' : 'text-muted'
              }`}
            >
              <Glyph name={type} />
              {info.label}
            </button>
          ))}
        </div>

        {form.type !== 'cash' && (
          <>
            <p className="mt-4 mb-1.5 px-1 text-sm text-muted">{form.type === 'meal' ? 'Your meal card' : form.type === 'investment' ? 'Your broker' : 'Your bank'}</p>
            <div className="grid grid-cols-4 gap-2">
              {(form.type === 'meal' ? MEAL_CARDS : BANKS).map((b) => (
                <button
                  key={b.name}
                  onClick={() => pickBank(b)}
                  aria-pressed={bank === b}
                  className={`flex min-w-0 flex-col items-center justify-start gap-1.5 rounded-2xl border-[1.5px] px-1 pt-2.5 pb-2 ${
                    bank === b ? 'border-cobalt bg-cobalt/15' : 'border-transparent bg-card'
                  }`}
                >
                  <BankLogo bank={b} className="size-9" />
                  <span className="line-clamp-2 w-full text-center text-[11px] leading-tight font-semibold">{b.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl bg-card">
          <Row label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t.placeholder}
              maxLength={40}
              className={`w-full ${plainInput}`}
            />
          </Row>
          <Row label={owed ? 'Owed' : form.type === 'investment' ? 'Invested' : 'Balance'}>
            <button onClick={() => setPadOpen(true)} className={`tabular text-base font-semibold ${!cents ? 'text-muted/60' : owed ? 'text-loss' : 'text-ink'}`}>
              {formatCents(cents)}
            </button>
          </Row>
        </div>

        <p className="mt-4 mb-1.5 px-1 text-sm text-muted">Color</p>
        <div className="-mx-5 overflow-x-auto px-4">
          <Swatches big colors={colors} value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        {form.error && <p className="mt-2 px-1 text-sm text-loss">{form.error}</p>}

        {padOpen && (
          <AmountPad
            label={owed ? 'Owed today' : form.type === 'investment' ? 'Invested so far' : 'Balance today'}
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
            <b className={`tabular font-display text-lg ${a.type === 'credit' && a.cents ? 'text-loss' : ''}`}>
              {formatCents(a.type === 'credit' ? -a.cents : a.cents)}
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
  const [picking, setPicking] = useState(null) // null | 'amount' | 'date'

  if (form) {
    const income = form.type === 'income'
    // Money comes in to any account; payments go out of spending accounts and credit cards
    const choices = accounts.filter((a) => a.type !== 'investment' && (income || a.type !== 'savings'))
    const cats = categories.filter((c) => c.kind === form.type && c.selected)
    const cents = parseToCents(form.amount) ?? 0
    const per = FREQUENCIES.find((f) => f[0] === form.frequency)[3]
    const chip = (on) => `flex items-center gap-2 rounded-full border-[1.5px] text-sm font-semibold ${on ? 'border-cobalt bg-cobalt/15' : 'border-transparent bg-card'}`
    return (
      <div>
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-muted">{income ? 'New income' : 'New payment'}</p>
          <SectionAction label="Cancel" onClick={() => setForm(null)} />
        </div>

        {/* How it will look: logo or emoji, name, amount per period */}
        <div className="flex flex-col items-center pt-3">
          <MerchantIcon name={form.name} className="size-[68px] rounded-[22px] bg-card text-[36px]">
            {form.icon}
          </MerchantIcon>
          <b className={`mt-3 max-w-full truncate font-display text-2xl ${form.name.trim() ? '' : 'text-muted/50'}`}>{form.name.trim() || 'Name'}</b>
          <span className={`tabular text-sm ${cents ? (income ? 'font-semibold text-gain' : 'text-muted') : 'text-muted/60'}`}>
            {cents ? `${income ? '+' : ''}${formatCents(cents)} a ${per}` : 'Amount not set'}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-card">
          <Row label="Name">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, error: null })} placeholder={income ? 'e.g. Salary' : 'e.g. Netflix'} maxLength={40} className={`w-full ${plainInput}`} />
          </Row>
          <Row label="Amount">
            <button onClick={() => setPicking('amount')} className={`tabular text-base font-semibold ${cents ? 'text-ink' : 'text-muted/60'}`}>
              {formatCents(cents)}
            </button>
          </Row>
          <Row label="Repeats">
            <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-paper p-0.5">
              {FREQUENCIES.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setForm({ ...form, frequency: value })}
                  className={`rounded-[10px] px-2.5 py-1.5 text-xs font-semibold ${form.frequency === value ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Row>
          <Row label={income ? 'Next date' : 'Next payment'}>
            <button onClick={() => setPicking('date')} className="flex items-center gap-1 text-base font-semibold">
              {form.nextDue === today ? 'Today' : formatDayMonth(form.nextDue)}
              <Icon name="chevronRight" size={16} className="text-muted" />
            </button>
          </Row>
        </div>

        <p className="mt-4 mb-1.5 px-1 text-sm text-muted">{income ? 'Paid into' : 'Paid from'}</p>
        <div className="flex flex-wrap gap-2">
          {choices.map((a) => (
            <button key={a.key} onClick={() => setForm({ ...form, accountKey: a.key })} className={`${chip(form.accountKey === a.key)} py-1.5 pr-3.5 pl-1.5`}>
              <MiniCard account={a} className="h-6 w-8 rounded-md" iconClass="size-3" />
              {a.name}
            </button>
          ))}
        </div>
        <p className="mt-4 mb-1.5 px-1 text-sm text-muted">Category</p>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c.name} onClick={() => setForm({ ...form, categoryName: c.name })} className={`${chip(form.categoryName === c.name)} px-3.5 py-2`}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        {form.error && <p className="mt-3 px-1 text-sm text-loss">{form.error}</p>}

        {picking === 'amount' && (
          <AmountPad label={income ? 'Amount received' : 'Amount'} amount={form.amount} onChange={(amount) => setForm({ ...form, amount, error: null })} onDone={() => setPicking(null)} />
        )}
        {picking === 'date' && (
          <>
            <div className="fixed inset-0 z-30 bg-navy/50" onClick={() => setPicking(null)} />
            <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-[28px] bg-card px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] motion-safe:animate-[sheet-up_200ms_ease-out]">
              <p className="mb-2 font-display text-lg font-bold">{income ? 'Next date' : 'Next payment'}</p>
              <DatePicker
                value={form.nextDue}
                dimFuture={false}
                quickPicks={false}
                onChange={(iso) => {
                  setForm({ ...form, nextDue: iso < today ? today : iso })
                  setPicking(null)
                }}
              />
            </div>
          </>
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
function Finish({ accounts, startDay, categories, payments, saveState, saveError }) {
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
