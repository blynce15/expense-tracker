import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import LynxWatermark from '../components/LynxWatermark'
import { BankLogo } from '../components/BankCard'
import { BANKS, bankFor, bankLogo } from '../lib/banks'
import { budgetPeriod } from '../lib/budget'
import { formatDayMonth, shiftDays, todayISO } from '../lib/dates'
import { DEFAULT_CATEGORIES } from '../lib/defaults'
import { EMOJIS } from '../lib/emojis'
import { formatCents, formatTyping, PAD_KEYS, parseToCents, pressKey } from '../lib/money'
import { fetchExistingCategories, saveOnboarding } from '../lib/onboarding'
import { monthlyCents } from '../lib/recurring'
import { supabase } from '../lib/supabase'

// First-run setup for new users: accounts, budget day, categories,
// regular payments and a few questions. Nothing is saved until the end.

const STEPS = [
  { key: 'welcome' },
  { key: 'accounts', title: 'Accounts' },
  { key: 'day', title: 'When does your month start?', sub: 'Pick your payday. Your budget starts over on this day.' },
  { key: 'cats', title: 'Your categories', sub: 'What your money goes on, and where it comes from. Add your own too.' },
  { key: 'payments', title: 'Regular payments', sub: 'Rent, subscriptions, bills. The app reminds you when they are due.' },
  { key: 'about', title: 'A bit about you', sub: 'So tips fit you later. Skip any you like.' },
  { key: 'done' },
]
const NUMBERED = STEPS.length - 2

const TYPES = {
  debit: { label: 'Bank', placeholder: 'e.g. Revolut', color: '#1f4fe0' },
  savings: { label: 'Savings', placeholder: 'e.g. Savings', color: '#7048e8' },
  credit: { label: 'Credit card', placeholder: 'e.g. Visa', color: '#e8590c' },
  cash: { label: 'Cash', placeholder: 'e.g. Wallet', color: '#2b8a3e' },
}
const ACCOUNT_COLORS = [
  '#1f4fe0', '#0b1b45', '#4dabf7', '#0c8599', '#12b886', '#2b8a3e', '#94d82d', '#fab005',
  '#f08c00', '#e8590c', '#e03131', '#d6336c', '#ae3ec9', '#7048e8', '#495057', '#111111',
]
const CATEGORY_COLORS = ['#1f9d55', '#e8590c', '#1f4fe0', '#6741d9', '#d6336c', '#0c8599', '#f08c00', '#495057']
const CATEGORY_IDEAS = [
  ['Pets', '🐶', '#a0522d', 'expense'], ['Kids', '🧸', '#f06595', 'expense'], ['Gym', '🏋️', '#2b8a3e', 'expense'],
  ['Gifts', '🎁', '#e64980', 'expense'], ['Coffee', '☕', '#8d6e63', 'expense'], ['Car', '🚗', '#1971c2', 'expense'],
  ['Freelance', '💻', '#0c8599', 'income'], ['Refunds', '↩️', '#495057', 'income'], ['Investments', '📈', '#1c7ed6', 'income'],
  ['Gifts received', '🎁', '#e64980', 'income'], ['Rent received', '🏠', '#6741d9', 'income'],
]
// name, icon, typical cents, category, days until due, frequency
const PAYMENT_IDEAS = [
  ['Rent', '🏠', 85000, 'Housing', 25, 'monthly'], ['Netflix', '🎬', 1399, 'Entertainment', 5, 'monthly'],
  ['Spotify', '🎧', 1199, 'Entertainment', 9, 'monthly'], ['Gym', '🏋️', 3900, 'Health', 12, 'monthly'],
  ['Phone', '📱', 2500, 'Bills', 14, 'monthly'], ['Internet', '🌐', 3500, 'Bills', 3, 'monthly'],
  ['Electricity', '💡', 6000, 'Bills', 18, 'monthly'], ['Car insurance', '🛡️', 42000, 'Bills', 70, 'yearly'],
]
const FREQUENCIES = [['weekly', 'Weekly', 'Every week'], ['monthly', 'Monthly', 'Every month'], ['yearly', 'Yearly', 'Every year']]
const QUESTIONS = [
  { id: 'goal', q: "What's your main goal right now?", opts: [['💰', 'Save more'], ['✂️', 'Spend less'], ['💳', 'Pay off debt'], ['👀', 'See where my money goes']] },
  { id: 'pay', q: 'How do you get paid?', opts: [['📅', 'Monthly salary'], ['🔁', 'Every two weeks'], ['🎲', 'Irregular / freelance'], ['🤷', 'Other']] },
  { id: 'saving', q: 'What are you saving for?', multi: true, opts: [['🛟', 'Emergency fund'], ['✈️', 'Travel'], ['🏡', 'A home'], ['🚗', 'A car'], ['🤷', 'Nothing specific']] },
  { id: 'tough', q: 'Where is it hardest to hold back?', multi: true, opts: [['🍽️', 'Eating out'], ['🛍️', 'Shopping'], ['🎬', 'Entertainment'], ['🛒', 'Groceries'], ['✈️', 'Travel']] },
  { id: 'tone', q: 'If the app gives you tips, how should they sound?', opts: [['🤗', 'Gentle and encouraging'], ['🎯', 'Straight to the point'], ['🙅', 'No tips, thanks']] },
]

const GLYPHS = {
  debit: 'M3 10h18M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18M12 3.5 21 8H3z',
  savings: 'M5 6.5a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5',
  credit: 'M5 5h14a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 5 5zM2.5 10h19M6.5 15h4',
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
const budgetOf = (accounts) => accounts.filter((a) => a.type === 'debit' || a.type === 'cash').reduce((s, a) => s + a.cents, 0)
const firstEmoji = (text) => {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.trim())].map((x) => x.segment)
  return parts.find((x) => /\p{Extended_Pictographic}/u.test(x)) ?? null
}
const amountWidth = (text) => ({ width: `${Math.max(4, text.length) + 0.5}ch` })
const primaryClass =
  'w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_rgba(31,79,224,0.8)] active:bg-cobalt-deep disabled:opacity-40'

const newAccountForm = (type) => ({ type, name: '', amount: '', color: TYPES[type].color, error: null })
const defaultCategories = () =>
  DEFAULT_CATEGORIES.map((c) => ({ name: c.name, icon: c.icon, color: c.color, kind: c.kind, selected: c.name !== 'Travel' }))

export default function Onboarding({ onDone }) {
  const today = todayISO()
  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState([])
  const [accountForm, setAccountForm] = useState(newAccountForm('debit'))
  const [startDay, setStartDay] = useState(1)
  const [categories, setCategories] = useState(defaultCategories)
  const [categoryKind, setCategoryKind] = useState('expense')
  const [categoryForm, setCategoryForm] = useState(null)
  const [payments, setPayments] = useState([])
  const [paymentForm, setPaymentForm] = useState(null)
  const [question, setQuestion] = useState(0)
  const [answers, setAnswers] = useState({})
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
      await saveOnboarding({ accounts, categories, payments, startDay, answers }, saved.current)
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
    if (key === 'about' && question > 0) return setQuestion((q) => q - 1)
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

  function openPaymentForm(idea) {
    const spendable = accounts.filter((a) => a.type !== 'savings')
    const expenseNames = categories.filter((c) => c.kind === 'expense' && c.selected).map((c) => c.name)
    const category = idea && expenseNames.includes(idea[3]) ? idea[3] : expenseNames[0]
    setPaymentForm({
      name: idea?.[0] ?? '',
      icon: idea?.[1] ?? '🔁',
      amount: idea ? (idea[2] / 100).toFixed(2).replace('.', ',') : '',
      frequency: idea?.[5] ?? 'monthly',
      nextDue: shiftDays(today, idea?.[4] ?? 7),
      accountKey: spendable[0]?.key ?? accounts[0]?.key,
      categoryName: category,
      error: null,
    })
  }
  function addPayment() {
    const f = paymentForm
    const cents = parseToCents(f.amount)
    if (!f.name.trim()) return setPaymentForm({ ...f, error: 'Give it a name, like Rent or Netflix.' })
    if (!cents) return setPaymentForm({ ...f, error: 'Enter the amount, like 13,99.' })
    setPayments((list) => [...list, { ...f, name: f.name.trim(), cents }].sort((a, b) => a.nextDue.localeCompare(b.nextDue)))
    setPaymentForm(null)
  }

  // ---------- Bottom button ----------
  let footer = null
  if (key === 'welcome')
    footer = (
      <>
        <button onClick={() => go(1)} className={primaryClass}>Set up</button>
        <button onClick={() => supabase.auth.signOut()} className="mt-1 w-full py-2.5 text-sm font-medium text-muted">
          Sign out
        </button>
      </>
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
      <button onClick={addPayment} className={primaryClass}>Add payment</button>
    ) : payments.length ? (
      <button onClick={() => go(1)} className={primaryClass}>Continue</button>
    ) : (
      <button onClick={() => go(1)} className="w-full rounded-2xl bg-card py-4 text-lg font-semibold text-ink ring-1 ring-line">Skip for now</button>
    )
  else if (key === 'about') {
    const Q = QUESTIONS[question]
    const answered = Q.multi ? answers[Q.id]?.length : answers[Q.id]
    const next = () => (question < QUESTIONS.length - 1 ? setQuestion((q) => q + 1) : go(1))
    footer = (
      <div className="flex gap-2">
        <button
          onClick={() => {
            setAnswers(({ [Q.id]: _, ...rest }) => rest)
            next()
          }}
          className="rounded-2xl bg-card px-5 font-semibold text-muted ring-1 ring-line"
        >
          Skip
        </button>
        <button onClick={next} disabled={!answered} className={`${primaryClass} flex-1`}>
          {question === QUESTIONS.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    )
  } else if (key === 'done')
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
          <Finish accounts={accounts} startDay={startDay} categories={categories} payments={payments} answers={answers} saveState={saveState} saveError={saveError} />
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
            <h1 className="mt-6 font-display text-[34px] leading-[1.02] font-extrabold tracking-tight">{STEPS[step].title}</h1>
            {STEPS[step].sub ? <p className="mt-2 mb-5 text-muted">{STEPS[step].sub}</p> : <div className="mb-5" />}

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
            {key === 'about' && <AboutStep question={question} answers={answers} setAnswers={setAnswers} />}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper to-paper/0 pt-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mx-auto max-w-lg px-5">{footer}</div>
      </div>
    </div>
  )
}

// First page: the app's logo and name, then the setup steps as a coloured timeline.
// Tighter on short screens (iPhone SE) so the list stays clear of the Set up button.
function Welcome() {
  const steps = [
    ['credit', 'Accounts and balances', '#2f6bff'],
    ['calendar', 'Budget start day', '#f08c00'],
    ['tag', 'Categories', '#7048e8'],
    ['repeat', 'Regular payments', '#0f9d6b'],
    ['chat', 'A few questions', '#8892a6'],
  ]
  return (
    <div className="flex flex-col items-center pt-10 [@media(max-height:700px)]:pt-3">
      <img src="/logo.png" alt="" className="size-[120px] [@media(max-height:700px)]:size-[84px]" />
      <h1 className="mt-4 font-display text-[44px] leading-none font-extrabold tracking-tight">
        Lynx<span className="brand-text">OS</span>
      </h1>
      <p className="mt-2 text-muted">Expense tracker</p>
      <ol className="relative mt-10 w-full px-2 [@media(max-height:700px)]:mt-6">
        {/* The line joining the steps, behind the circles */}
        <span className="absolute top-7 bottom-7 left-[29px] w-0.5 bg-line [@media(max-height:700px)]:left-[27px]" aria-hidden="true" />
        {steps.map(([icon, title, color], n) => (
          <li key={title} className="relative flex h-[58px] items-center gap-4 [@media(max-height:700px)]:h-[50px]">
            <span className="grid size-11 shrink-0 place-items-center rounded-full text-white [@media(max-height:700px)]:size-10" style={{ backgroundColor: color }}>
              <Glyph name={icon} />
            </span>
            <span className="text-base font-semibold">
              {title}
              {n === steps.length - 1 && <span className="font-normal text-muted"> (optional)</span>}
            </span>
          </li>
        ))}
      </ol>
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

function SummaryBox({ title, sub, value }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl bg-cobalt/10 px-4 py-3.5">
      <span className="text-sm text-ink/80">
        {title}
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <b className="tabular font-display text-xl text-cobalt">{value}</b>
    </div>
  )
}

// ---------- Step 1: accounts ----------
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
          <div className="relative flex h-9 items-center gap-2 text-sm font-semibold text-white/85">
            {bank ? (
              <span className="grid size-9 place-items-center rounded-[10px] bg-white">
                <img src={bankLogo(bank)} alt="" className="size-6 rounded-md" />
              </span>
            ) : (
              <Glyph name={form.type} className="size-[18px]" />
            )}
            {t.label}
          </div>
          <p className={`relative mt-4 truncate text-base font-semibold ${form.name.trim() ? '' : 'text-white/55'}`}>{form.name.trim() || t.placeholder}</p>
          <p className="relative text-xs text-white/70">{owed ? 'Owed today' : 'Balance today'}</p>
          <button onClick={() => setPadOpen(true)} className={`tabular relative font-display leading-tight font-bold ${owed && cents ? 'text-[#ffb4a8]' : ''}`}>
            <span className="text-[30px]">{whole}</span>
            <span className="text-lg opacity-60">,{decimals}</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-card p-1">
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
            <p className="mt-4 mb-1.5 px-1 text-sm text-muted">Your bank</p>
            <div className="grid grid-cols-4 gap-2">
              {BANKS.map((b) => (
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
          <Row label={owed ? 'Owed' : 'Balance'}>
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
            label={owed ? 'Owed today' : 'Balance today'}
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

// The same number pad as Add transaction, in a sheet over the bottom of the screen
function AmountPad({ label, amount, onChange, onDone }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-navy/50" onClick={onDone} />
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-[28px] bg-card px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] motion-safe:animate-[sheet-up_200ms_ease-out]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{label}</span>
          <span className="tabular truncate font-display text-[32px] font-extrabold">€{formatTyping(amount)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {PAD_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => onChange(pressKey(amount, k))}
              className={`grid h-13 place-items-center rounded-2xl font-display text-[24px] font-semibold active:bg-line ${k === '.' || k === 'back' ? '' : 'bg-paper'}`}
              aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            >
              {k === 'back' ? <Icon name="backspace" size={24} /> : k === '.' ? ',' : k}
            </button>
          ))}
        </div>
        <button onClick={onDone} className={`${primaryClass} mt-3`}>
          Done
        </button>
      </div>
    </>
  )
}

// ---------- Step 2: budget day ----------
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

// ---------- Step 3: categories ----------
function CategoriesStep({ categories, setCategories, kind, setKind, form, setForm }) {
  if (form) return <CategoryCreator form={form} setForm={setForm} />

  const list = categories.filter((c) => c.kind === kind)
  const selected = list.filter((c) => c.selected).length
  const count = (k) => categories.filter((c) => c.kind === k && c.selected).length
  const ideas = CATEGORY_IDEAS.filter(([name, , , k]) => k === kind && !categories.some((c) => c.kind === k && c.name === name))
  const toggle = (c) => setCategories((all) => all.map((x) => (x === c ? { ...x, selected: !x.selected } : x)))
  const setAll = (value) => setCategories((all) => all.map((x) => (x.kind === kind ? { ...x, selected: value } : x)))

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
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              kind === k ? 'bg-cobalt text-white shadow-[0_6px_14px_-8px_rgba(31,79,224,0.9)]' : 'text-muted'
            }`}
          >
            {label}
            <span className={`tabular grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] ${kind === k ? 'bg-white/25' : 'bg-paper'}`}>
              {count(k)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 mb-2 flex items-center justify-between px-1">
        <span className="text-sm text-muted">
          {kind === 'income' ? 'Money coming in' : 'Money going out'} · <b className="text-ink">{selected}</b> of {list.length}
        </span>
        <SectionAction label={selected === list.length ? 'Clear all' : 'Select all'} onClick={() => setAll(selected !== list.length)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {list.map((c) => (
          <button
            key={`${c.kind}-${c.name}`}
            onClick={() => toggle(c)}
            aria-pressed={c.selected}
            className={`flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition ${
              c.selected ? 'bg-card shadow-[0_6px_16px_-12px_rgba(11,27,69,0.5)]' : 'ring-1 ring-line'
            }`}
          >
            <span
              className="relative grid size-10 shrink-0 place-items-center rounded-xl text-lg"
              style={{ backgroundColor: c.selected ? `${c.color ?? '#868e96'}1f` : 'var(--color-paper)' }}
            >
              <span className={c.selected ? '' : 'opacity-40 grayscale'}>{c.icon}</span>
              {c.selected && (
                <span className="absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full bg-cobalt text-white ring-2 ring-white">
                  <Glyph name="check" className="size-2.5" width={3.4} />
                </span>
              )}
            </span>
            <span className={`min-w-0 flex-1 text-sm leading-tight font-semibold ${c.selected ? 'text-ink' : 'text-muted'}`}>{c.name}</span>
          </button>
        ))}
        <button
          onClick={() => setForm({ name: '', icon: kind === 'income' ? '💰' : '🛒', color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length], kind, error: null })}
          className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-cobalt/35 p-2.5 text-left"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
            <Glyph name="plus" width={2.4} />
          </span>
          <span className="text-sm leading-tight font-semibold text-cobalt">New category</span>
        </button>
      </div>

      {ideas.length > 0 && (
        <>
          <p className="mt-5 mb-2 px-1 text-sm font-semibold text-muted">Ideas</p>
          <div className="flex flex-wrap gap-2">
            {ideas.map(([name, icon, color]) => (
              <button
                key={name}
                onClick={() => setCategories((all) => [...all, { name, icon, color, kind, selected: true }])}
                className="flex items-center gap-1.5 rounded-full bg-card py-1.5 pr-3 pl-1.5 text-sm font-semibold text-ink shadow-[0_4px_12px_-10px_rgba(11,27,69,0.6)]"
              >
                <span className="grid size-6 place-items-center rounded-full bg-paper text-sm">{icon}</span>
                {name}
                <Glyph name="plus" className="size-3.5 text-cobalt" width={2.6} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CategoryCreator({ form, setForm }) {
  const [typed, setTyped] = useState('')
  const income = form.kind === 'income'
  const emojis = EMOJIS.includes(form.icon) ? EMOJIS : [form.icon, ...EMOJIS]
  const label = form.name.trim() || 'Category name'
  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-muted">New {form.kind} category</p>
        <SectionAction label="Cancel" onClick={() => setForm(null)} />
      </div>

      <p className="mb-1.5 px-1 text-xs font-semibold tracking-wider text-muted uppercase">How it will look</p>
      <div className="rounded-[20px] bg-card p-4 shadow-[0_10px_26px_-16px_rgba(11,27,69,0.45)] ring-1 ring-cobalt/15">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl transition-colors" style={{ backgroundColor: `${form.color}22` }}>
            {form.icon}
          </span>
          <span className="min-w-0 flex-1">
            <b className={`block truncate font-display text-xl ${form.name.trim() ? '' : 'text-muted/50'}`}>{label}</b>
            <span className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${form.color}1a`, color: form.color }}>
              {income ? 'Income' : 'Expense'}
            </span>
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl text-lg" style={{ backgroundColor: `${form.color}22` }}>
            {form.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{income ? 'Payment received' : 'Your next purchase'}</span>
            <span className="block truncate text-xs text-muted">{form.name.trim() || 'Category'} · Today</span>
          </span>
          <b className={`tabular font-display ${income ? 'text-gain' : ''}`}>{income ? '+€250,00' : '−€12,50'}</b>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-card">
        <Row label="Name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, error: null })}
            placeholder={income ? 'e.g. Freelance' : 'e.g. Pets'}
            maxLength={24}
            className={`w-full ${plainInput}`}
          />
        </Row>
        <Row label="Color">
          <Swatches colors={CATEGORY_COLORS} value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </Row>
      </div>

      <div className="mt-3 rounded-2xl bg-card p-3">
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <span className="text-sm text-muted">Emoji</span>
          <label className="flex items-center gap-2 rounded-full bg-paper py-1 pr-1 pl-3 text-xs text-muted">
            Or type your own
            <input
              value={typed}
              onChange={(e) => {
                const emoji = firstEmoji(e.target.value)
                if (emoji) {
                  setForm({ ...form, icon: emoji })
                  setTyped('')
                } else setTyped(e.target.value)
              }}
              aria-label="Type an emoji"
              placeholder="🙂"
              className="size-8 rounded-full bg-card text-center text-lg outline-none"
            />
          </label>
        </div>
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

// ---------- Step 4: regular payments ----------
function DateBlock({ iso, dark }) {
  const [, m, d] = iso.split('-').map(Number)
  const month = new Date(2000, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')
  return (
    <span className={`flex size-10 shrink-0 flex-col items-center justify-center rounded-xl ${dark ? 'bg-ink text-paper' : 'bg-paper'}`}>
      <span className="text-[9px] font-bold tracking-wider uppercase opacity-70">{month}</span>
      <span className="font-display text-base leading-none font-bold">{d}</span>
    </span>
  )
}

// One payment as it appears under "Coming up" on Home
function PaymentRow({ payment, today, accountName, children }) {
  const cents = payment.cents ?? parseToCents(payment.amount) ?? 0
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
      <DateBlock iso={payment.nextDue} dark={payment.nextDue === today} />
      <span className="min-w-0 flex-1">
        <b className="block truncate">
          {payment.icon} {payment.name || 'New payment'}
        </b>
        <span className="block truncate text-xs text-muted">
          {FREQUENCIES.find((f) => f[0] === payment.frequency)[2]}
          {accountName ? ` · ${accountName}` : ''}
        </span>
      </span>
      <b className="tabular font-display">{formatCents(cents)}</b>
      {children}
    </div>
  )
}

function PaymentsStep({ today, accounts, categories, payments, form, setForm, onOpen, onRemove }) {
  const accountName = (k) => accounts.find((a) => a.key === k)?.name

  if (form) {
    const spendable = accounts.filter((a) => a.type !== 'savings')
    const expenseCats = categories
      .filter((c) => c.kind === 'expense' && c.selected)
      .sort((a, b) => (b.name === form.categoryName) - (a.name === form.categoryName))
    const pill = (on) => `flex shrink-0 items-center gap-2 rounded-full text-sm font-semibold transition ${on ? 'bg-cobalt text-white' : 'bg-card text-ink'}`
    return (
      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-muted">{form.name ? `Add ${form.name}` : 'New payment'}</p>
          <SectionAction label="Cancel" onClick={() => setForm(null)} />
        </div>
        <p className="mb-1.5 px-1 text-xs font-semibold tracking-wider text-muted uppercase">On your Home</p>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-[0_10px_26px_-16px_rgba(11,27,69,0.45)] ring-1 ring-cobalt/15">
          <PaymentRow payment={form} today={today} accountName={accountName(form.accountKey)} />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-card">
          <Row label="Name">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, error: null })} placeholder="e.g. Netflix" maxLength={40} className={`w-full ${plainInput}`} />
          </Row>
          <Row label="Amount">
            <span className="flex items-center gap-1">
              <span className="font-semibold">€</span>
              <input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value, error: null })}
                inputMode="decimal"
                placeholder="0,00"
                style={amountWidth(form.amount)}
                className={`tabular max-w-[9rem] ${plainInput}`}
              />
            </span>
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
          <Row label="Next payment">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setForm({ ...form, nextDue: form.nextDue > today ? shiftDays(form.nextDue, -1) : today })}
                aria-label="One day earlier"
                className="grid size-8 place-items-center rounded-full bg-paper text-ink"
              >
                −
              </button>
              <b className="w-16 text-center text-sm">{form.nextDue === today ? 'Today' : formatDayMonth(form.nextDue)}</b>
              <button onClick={() => setForm({ ...form, nextDue: shiftDays(form.nextDue, 1) })} aria-label="One day later" className="grid size-8 place-items-center rounded-full bg-paper text-ink">
                +
              </button>
            </div>
          </Row>
        </div>

        <p className="mt-4 mb-1.5 px-1 text-sm text-muted">Paid from</p>
        <div className="-mr-5 flex gap-1.5 overflow-x-auto pr-5 [scrollbar-width:none]">
          {spendable.map((a) => (
            <button key={a.key} onClick={() => setForm({ ...form, accountKey: a.key })} className={`${pill(form.accountKey === a.key)} py-1.5 pr-3.5 pl-1.5`}>
              <MiniCard account={a} className="h-6 w-8 rounded-md" iconClass="size-3" />
              {a.name}
            </button>
          ))}
        </div>
        <p className="mt-3 mb-1.5 px-1 text-sm text-muted">Category</p>
        <div className="-mr-5 flex gap-1.5 overflow-x-auto pr-5 [scrollbar-width:none]">
          {expenseCats.map((c) => (
            <button key={c.name} onClick={() => setForm({ ...form, categoryName: c.name })} className={`${pill(form.categoryName === c.name)} px-3.5 py-2`}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        {form.error && <p className="mt-3 px-1 text-sm text-loss">{form.error}</p>}
      </div>
    )
  }

  const ideas = PAYMENT_IDEAS.filter(([name]) => !payments.some((p) => p.name === name))
  return (
    <div>
      {payments.length > 0 && (
        <>
          <div className="overflow-hidden rounded-[20px] bg-card">
            {payments.map((p, i) => (
              <PaymentRow key={`${p.name}-${i}`} payment={p} today={today} accountName={accountName(p.accountKey)}>
                <RemoveButton label={`Remove ${p.name}`} onClick={() => onRemove(i)} />
              </PaymentRow>
            ))}
          </div>
          <SummaryBox
            title={`${payments.length} regular payment${payments.length === 1 ? '' : 's'}`}
            sub="Roughly, per month"
            value={formatCents(payments.reduce((t, p) => t + monthlyCents({ amount_cents: p.cents, frequency: p.frequency }), 0)).replace(/,\d\d$/, '')}
          />
        </>
      )}
      <p className={`${payments.length ? 'mt-5' : ''} mb-2 px-1 text-sm font-semibold text-muted`}>{payments.length ? 'Add more' : 'Popular. Tap to add.'}</p>
      <div className="grid grid-cols-2 gap-2">
        {ideas.map((idea) => (
          <button key={idea[0]} onClick={() => onOpen(idea)} className="flex items-center gap-2.5 rounded-2xl bg-card p-2.5 text-left active:scale-[.98]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-lg">{idea[1]}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{idea[0]}</span>
              <span className="tabular block text-xs text-muted">
                {formatCents(idea[2])}
                {idea[5] === 'yearly' ? '/yr' : '/mo'}
              </span>
            </span>
          </button>
        ))}
        <button onClick={() => onOpen(null)} className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-cobalt/35 p-2.5 text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
            <Glyph name="plus" width={2.4} />
          </span>
          <span className="text-sm font-semibold text-cobalt">Something else</span>
        </button>
      </div>
    </div>
  )
}

// ---------- Step 5: questions ----------
function AboutStep({ question, answers, setAnswers }) {
  const Q = QUESTIONS[question]
  const current = answers[Q.id] ?? (Q.multi ? [] : null)
  function pick(text) {
    setAnswers((a) => {
      if (!Q.multi) return { ...a, [Q.id]: text }
      const list = a[Q.id] ?? []
      return { ...a, [Q.id]: list.includes(text) ? list.filter((x) => x !== text) : [...list, text] }
    })
  }
  return (
    <div>
      <div className="rounded-[22px] bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider text-muted uppercase">
            Question {question + 1} of {QUESTIONS.length}
          </span>
          <span className="flex gap-1">
            {QUESTIONS.map((q, i) => (
              <span key={q.id} className={`h-1.5 rounded-full transition-all ${i === question ? 'w-5 bg-cobalt' : i < question ? 'w-1.5 bg-cobalt/40' : 'w-1.5 bg-line'}`} />
            ))}
          </span>
        </div>
        <h2 className="mt-3 font-display text-[22px] leading-tight font-bold">{Q.q}</h2>
        <p className="mt-1 text-sm text-muted">{Q.multi ? 'Pick as many as you like.' : 'Pick one.'}</p>
      </div>
      <div className="mt-3 space-y-2">
        {Q.opts.map(([emoji, text]) => {
          const on = Q.multi ? current.includes(text) : current === text
          return (
            <button
              key={text}
              onClick={() => pick(text)}
              aria-pressed={on}
              className={`flex w-full items-center gap-3 rounded-2xl bg-card p-2.5 pr-3.5 text-left transition ${
                on ? 'shadow-[0_6px_16px_-12px_rgba(11,27,69,0.5)] ring-2 ring-cobalt' : ''
              }`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg ${on ? 'bg-cobalt/10' : 'bg-paper'}`}>{emoji}</span>
              <span className="flex-1 font-semibold">{text}</span>
              <span className={`grid size-6 shrink-0 place-items-center ${Q.multi ? 'rounded-lg' : 'rounded-full'} ${on ? 'bg-cobalt text-white' : 'ring-[1.5px] ring-line'}`}>
                {on && <Glyph name="check" className="size-3.5" width={3} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Finish ----------
function Finish({ accounts, startDay, categories, payments, answers, saveState, saveError }) {
  const expenses = categories.filter((c) => c.kind === 'expense' && c.selected)
  const income = categories.filter((c) => c.kind === 'income' && c.selected)
  const answered = Object.values(answers).filter((v) => v && v.length).length
  const period = budgetPeriod(todayISO(), startDay)
  const perMonth = payments.reduce((t, p) => t + monthlyCents({ amount_cents: p.cents, frequency: p.frequency }), 0)
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
      'Bank and cash count toward your budget',
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
    [<Glyph key="i" name="chat" />, 'About you', answered ? `${answered} of ${QUESTIONS.length} answered${answers.goal ? ` · ${answers.goal}` : ''}` : 'Skipped. You can answer later.'],
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
