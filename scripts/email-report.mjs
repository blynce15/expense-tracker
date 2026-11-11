// Monthly email report (design "App look v2", chosen by the owner 2026-11-11): the same month summary as the
// Obsidian note (summarizeMonth in scripts/monthly-report.mjs), laid out as an HTML email and sent from the
// owner's Gmail to themself. Built with tables and inline styles so Gmail and iPhone Mail show it the same way;
// the logo travels inside the email (cid images), nothing is loaded from the internet.
//
// By hand: `npm run email-report` sends last month's report from the newest backup (`-- 2026-10` for another
// month, `-- 2026-10 --preview` only writes .harness/email-preview.html to look at).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatCents } from '../src/lib/money.js'
import { change, dayLabel, MONTHS, pct, points, shiftMonth, summarizeMonth } from './monthly-report.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONT = `-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const INK = '#0b1b45'
const MUTED = '#5a6b8c'
const LINE = '#eef2fa'
const ORANGE = '#f76707'

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "€1.258" + faded ",08"
const big = (cents, fade = 'opacity:.55') => {
  const [whole, dec] = formatCents(cents).split(',')
  return `${whole}<span style="font-size:13px;${fade}">,${dec}</span>`
}

function tint(hex, alpha = 0.14) {
  const h = String(hex || '#868e96').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0)
  return `rgba(${r},${g},${b},${alpha})`
}

// ▲ / ▼ chip vs the month before (only from the second month on)
function chip(text, good) {
  if (!text || text === '—' || text === 'new') return ''
  const color = text === '≈ same' ? MUTED : good ? '#1b6b3a' : '#c2410c'
  return `<span style="display:inline-block;font-size:11px;font-weight:700;color:${color};background:#ffffff;border-radius:999px;padding:2px 7px;margin-top:6px">${esc(text)}</span>`
}

// One white card with a heading (emoji tile + title, optional right side)
function card(icon, iconBg, title, right, body) {
  return `
<tr><td style="padding:0 12px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px">
<tr><td style="padding:18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:30px"><div style="width:28px;height:28px;line-height:28px;border-radius:9px;background:${iconBg};text-align:center;font-size:14px">${icon}</div></td>
    <td style="padding-left:9px;font-size:16px;font-weight:800;color:${INK}">${esc(title)}</td>
    <td align="right" style="font-size:13px;font-weight:600;color:${MUTED}">${right ?? ''}</td>
  </tr></table>
  <div style="height:14px;line-height:14px">&nbsp;</div>
  ${body}
</td></tr></table>
</td></tr>`
}

const subHead = (text, first) => `<div style="font-size:11.5px;font-weight:800;color:${MUTED};text-transform:uppercase;letter-spacing:.8px;margin:${first ? 0 : 16}px 0 2px">${esc(text)}</div>`

// A list row: left tile, title + detail, amount on the right
function row(tile, title, detail, amount, { last = false, amountColor = INK } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${last ? '' : `border-bottom:1px solid ${LINE};`}"><tr>
  <td style="width:38px;padding:9px 0">${tile}</td>
  <td style="padding:9px 0 9px 11px"><div style="font-size:14.5px;font-weight:700;color:${INK}">${esc(title)}</div>${detail ? `<div style="font-size:12px;color:${MUTED};margin-top:2px">${esc(detail)}</div>` : ''}</td>
  <td align="right" style="padding:9px 0 9px 8px;font-size:14.5px;font-weight:800;color:${amountColor};white-space:nowrap">${amount}</td>
</tr></table>`
}

const emojiTile = (emoji, bg, size = 34) =>
  `<div style="width:${size}px;height:${size}px;line-height:${size}px;border-radius:11px;background:${bg};text-align:center;font-size:${Math.round(size / 2.1)}px">${esc(emoji)}</div>`
const rankTile = (n, bg, fg) => `<div style="width:26px;height:26px;line-height:26px;border-radius:9px;background:${bg};color:${fg};text-align:center;font-size:12px;font-weight:800">${n}</div>`
const letterTile = (name, color) =>
  `<div style="width:34px;height:34px;line-height:34px;border-radius:11px;background:${color};color:#ffffff;text-align:center;font-size:14px;font-weight:800">${esc((name.trim()[0] ?? '·').toUpperCase())}</div>`

// A bar split into coloured parts: [{ share, color }]
function splitBar(parts, height = 12, gap = 2) {
  const shown = parts.filter((p) => p.share > 0)
  if (!shown.length) return ''
  const cells = shown.map((p) => `<td style="width:${Math.max(p.share * 100, 1.5).toFixed(1)}%;height:${height}px;background:${p.color};border-radius:5px;font-size:0;line-height:0">&nbsp;</td>`).join(`<td style="width:${gap}px;font-size:0">&nbsp;</td>`)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`
}

// A thin progress bar
function progress(share, color, track = LINE, height = 6) {
  const w = Math.max(0, Math.min(1, share)) * 100
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${track};border-radius:9px"><tr>${w > 0 ? `<td style="width:${w.toFixed(1)}%;height:${height}px;background:${color};border-radius:9px;font-size:0;line-height:0">&nbsp;</td>` : ''}<td style="font-size:0;line-height:0;height:${height}px">&nbsp;</td></tr></table>`
}

// Calendar of the month, days shaded by spending, the priciest day ringed
function calendarTable(s) {
  const [y, m] = s.key.split('-').map(Number)
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Monday = 0
  const values = [...s.byDay.values()]
  const max = Math.max(...values, 1)
  const shade = (c) => {
    if (!c) return ['#f4f7fd', '#9aa7c2']
    const r = c / max
    if (r < 0.12) return ['#fff0db', '#a55400']
    if (r < 0.3) return ['#ffd8a8', '#8a4500']
    if (r < 0.6) return ['#ffa94d', '#5c2e00']
    return [ORANGE, '#ffffff']
  }
  const cells = Array(first).fill(null).concat(Array.from({ length: s.days }, (_, i) => i + 1))
  while (cells.length % 7) cells.push(null)
  let html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<td align="center" style="font-size:10.5px;color:#9aa7c2;font-weight:700;padding-bottom:4px">${d}</td>`).join('')}</tr>`
  for (let i = 0; i < cells.length; i += 7) {
    html += '<tr>'
    for (const d of cells.slice(i, i + 7)) {
      if (!d) {
        html += '<td style="padding:2px">&nbsp;</td>'
        continue
      }
      const iso = `${s.key}-${String(d).padStart(2, '0')}`
      const c = s.byDay.get(iso) ?? 0
      const [bg, fg] = shade(c)
      const ring = s.priciestDay && s.priciestDay[0] === iso ? `border:2px solid ${INK};` : 'border:2px solid transparent;'
      html += `<td style="padding:2px"><div style="background:${bg};color:${fg};${ring}border-radius:10px;text-align:center;padding:6px 0 5px">
        <div style="font-size:12px;font-weight:700;line-height:15px">${d}</div>
        <div style="font-size:10px;font-weight:700;line-height:13px">${c ? `€${Math.round(c / 100)}` : '&nbsp;'}</div></div></td>`
    }
    html += '</tr>'
  }
  html += '</table>'
  const scale = ['#f4f7fd', '#fff0db', '#ffd8a8', '#ffa94d', ORANGE].map((c) => `<td style="width:14px;padding-left:4px"><div style="width:14px;height:10px;border-radius:3px;background:${c};font-size:0">&nbsp;</div></td>`).join('')
  html += `<table role="presentation" align="right" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr><td style="font-size:11px;color:#9aa7c2">Less</td>${scale}<td style="font-size:11px;color:#9aa7c2;padding-left:4px">More</td></tr></table>`
  return html
}

// Two or three numbers side by side with thin lines between
function facts(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};margin-top:14px"><tr>${items
    .map(
      ([v, k], i) =>
        `<td align="center" style="padding-top:12px;${i ? `border-left:1px solid ${LINE};` : ''}width:${(100 / items.length).toFixed(1)}%"><div style="font-size:15px;font-weight:800;color:${INK}">${v}</div><div style="font-size:11px;color:${MUTED};margin-top:2px">${esc(k)}</div></td>`,
    )
    .join('')}</tr></table>`
}

const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`
const freq = { weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' }

export function emailSubject(s) {
  if (s.cur.income > 0) return `${s.title} · You kept ${formatCents(s.cur.kept).replace(/,00$/, '')} (${pct(Math.max(s.cur.rate, 0))})`
  return `${s.title} · You spent ${formatCents(s.cur.spent).replace(/,00$/, '')}`
}

export function buildEmailHtml(tables, key) {
  const s = summarizeMonth(tables, key)
  const { cur, prev, hasPrev } = s
  const lower = (a, b) => a < b

  // 1. Navy top: logo, month, verdict, where the income went
  const income = cur.income
  const rest = income - cur.spent - Math.max(cur.saved, 0) - Math.max(cur.invested, 0)
  const flowTotal = Math.max(income, cur.spent + Math.max(cur.saved, 0) + Math.max(cur.invested, 0))
  const flowParts = [
    { label: 'Spent', share: cur.spent / flowTotal, color: '#ff922b' },
    { label: 'Saved', share: Math.max(cur.saved, 0) / flowTotal, color: '#6f97ff' },
    { label: 'Invested', share: Math.max(cur.invested, 0) / flowTotal, color: '#3bc0d4' },
    { label: 'Still in accounts', share: Math.max(rest, 0) / flowTotal, color: '#5b6b93' },
  ]
  const flow =
    income > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a2a5c;border-radius:18px;margin-top:20px"><tr><td style="padding:14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;color:#b9c7ea;font-weight:600">Where your income went</td><td align="right" style="font-size:14px;color:#ffffff;font-weight:800">${formatCents(income)} in</td></tr></table>
    <div style="height:10px;line-height:10px">&nbsp;</div>${splitBar(flowParts, 14, 3)}<div style="height:10px;line-height:10px">&nbsp;</div>
    <div style="font-size:12px;color:#dfe7ff;line-height:20px">${flowParts
      .filter((p) => p.share > 0.004)
      .map((p) => `<span style="white-space:nowrap;margin-right:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:3px;background:${p.color}"></span>&nbsp;${p.label} ${pct(p.share)}</span>`)
      .join(' ')}</div>
  </td></tr></table>`
      : ''
  const hero = `
<tr><td style="background-color:${INK};background-image:linear-gradient(160deg,#2a4fb0 0%,#0b1b45 55%,#070d24 100%);padding:20px 20px 92px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><img src="cid:logo-white" width="30" height="30" alt="" style="vertical-align:middle;border:0">&nbsp;<span style="vertical-align:middle;font-size:16px;font-weight:800;color:#ffffff">Lynx<span style="color:#8fb0ff">OS</span></span></td>
    <td align="right"><span style="font-size:11px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;background:#26376b;padding:6px 10px;border-radius:999px;color:#d6e0ff">Monthly report</span></td>
  </tr></table>
  <div style="margin-top:26px;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-.4px">${esc(s.title)}</div>
  <div style="font-size:15px;color:#c9d5f5;margin-top:4px;line-height:1.45">${esc(s.verdict)}</div>
  ${flow}
</td></tr>`

  // 2. Income / Spent / Kept tiles + per day, no-spend days, average expense
  const tile = (label, bg, fg, cents, detail, chipHtml) =>
    `<td style="width:33.3%;padding:0 4px;vertical-align:top"><div style="background:${bg};border-radius:18px;padding:12px 11px;color:${fg}">
      <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px">${label}</div>
      <div style="font-size:19px;font-weight:800;margin-top:5px;letter-spacing:-.3px;white-space:nowrap">${big(cents)}</div>
      <div style="font-size:11px;margin-top:3px;opacity:.85;line-height:1.3">${esc(detail)}</div>${chipHtml}</div></td>`
  const main = `
<tr><td style="padding:0 12px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;margin-top:-70px"><tr><td style="padding:18px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${tile('Income', '#e8f7ee', '#1b6b3a', cur.income, `${s.incomeCount} ${s.incomeCount === 1 ? 'payment' : 'payments'}`, hasPrev ? chip(change(cur.income, prev.income), !lower(cur.income, prev.income)) : '')}
    ${tile('Spent', '#fff1e3', '#a55400', cur.spent, `${s.expenseCount} ${s.expenseCount === 1 ? 'expense' : 'expenses'}`, hasPrev ? chip(change(cur.spent, prev.spent), lower(cur.spent, prev.spent)) : '')}
    ${tile('Kept', '#eef3ff', '#1638a8', cur.kept, cur.rate !== null ? `${pct(Math.max(cur.rate, 0))} of income` : 'no income', hasPrev ? chip(points(cur.rate, prev.rate), (cur.rate ?? 0) >= (prev.rate ?? 0)) : '')}
  </tr></table>
  <div style="padding:0 4px">${facts([
    [formatCents(s.perDay), 'per day'],
    [String(s.noSpendDays), 'no-spend days'],
    [formatCents(s.avgExpense), 'avg expense'],
  ])}</div>
</td></tr></table>
</td></tr>`

  const sections = [hero, main]

  // 3. Every day of the month
  if (s.expenseCount) {
    const extra = [s.priciestDay && [dayLabel(s.priciestDay[0]).replace(/ \w+$/, ''), `priciest · ${formatCents(s.priciestDay[1])}`], s.topWeekday && [s.topWeekday, 'most spent on']].filter(Boolean)
    sections.push(card('📅', '#fff1e3', `Every day of ${s.month}`, '', calendarTable(s) + '<div style="clear:both"></div>' + (extra.length ? facts(extra) : '')))
  }

  // 4. Where it went
  if (s.categories.length) {
    const all = [...s.categories, ...(s.otherCents ? [{ icon: '···', name: 'Everything else', color: '#b8c3da', cents: s.otherCents, share: s.otherCents / cur.spent, other: true }] : [])]
    const topCents = all[0].cents
    const rows = all
      .map(
        (c, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${i ? 12 : 0}px"><tr>
      <td style="width:38px;vertical-align:middle">${emojiTile(c.icon || '•', tint(c.color), 38)}</td>
      <td style="padding-left:11px;vertical-align:middle">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14.5px;font-weight:700;color:${INK}">${esc(c.name)}${hasPrev && !c.other ? ` <span style="font-size:11px;font-weight:700;color:${c.cents > c.prevCents ? '#c2410c' : '#1b6b3a'}">${esc(change(c.cents, c.prevCents))}</span>` : ''}</td><td align="right" style="font-size:14.5px;font-weight:700;color:${INK}">${formatCents(c.cents)}</td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr><td>${progress(c.cents / topCents, c.color)}</td><td align="right" style="width:36px;font-size:11.5px;color:${MUTED};font-weight:700">${pct(c.share)}</td></tr></table>
      </td></tr></table>`,
      )
      .join('')
    sections.push(card('🛍️', '#fbe3ec', 'Where it went', formatCents(cur.spent), `${splitBar(all.map((c) => ({ share: c.share, color: c.color })))}<div style="height:16px;line-height:16px">&nbsp;</div>${rows}`))
  }

  // 5. Where you went
  if (s.places.length || s.biggest.length) {
    let body = ''
    if (s.places.length) body += subHead('Most visited', true) + s.places.map((p, i) => row(rankTile(i + 1, '#eef3ff', '#1638a8'), p.name, `${p.times} times`, formatCents(p.cents), { last: i === s.places.length - 1 })).join('')
    if (s.biggest.length) body += subHead('Biggest purchases', !s.places.length) + s.biggest.map((b, i) => row(rankTile(i + 1, '#fff1e3', '#a55400'), b.name, `${b.icon ? `${b.icon} ` : ''}${dayLabel(b.date)}`, formatCents(b.cents), { last: i === s.biggest.length - 1 })).join('')
    sections.push(card('📍', '#eef3ff', 'Where you went', '', body))
  }

  // 6. Money in
  if (s.incomeSources.length) {
    const body = s.incomeSources.map((src, i) => row(emojiTile(src.icon || '💶', '#e8f7ee'), src.name, src.accounts.join(' · '), `+${formatCents(src.cents)}`, { last: i === s.incomeSources.length - 1, amountColor: '#1b6b3a' })).join('')
    sections.push(card('💶', '#e8f7ee', 'Money in', `<span style="color:#1b6b3a">+${formatCents(cur.income)}</span>`, body))
  }

  // 7. Saving & investing
  if (cur.saved || cur.invested || s.goals.length) {
    const investDetail = s.investRows.length === 1 ? `1 ${s.investRows[0].type === 'invest' ? 'Invest' : 'Take out'} · ${shortDate(s.investRows[0].date)}` : s.investRows.length ? `${s.investRows.length} moves` : 'nothing this month'
    const box = (label, bg, fg, cents, detail) =>
      `<td style="width:50%;padding:0 4px;vertical-align:top"><div style="background:${bg};color:${fg};border-radius:16px;padding:12px"><div style="font-size:11px;font-weight:700;opacity:.85">${label}</div><div style="font-size:18px;font-weight:800;margin-top:3px">${formatCents(cents)}</div><div style="font-size:11px;opacity:.8;margin-top:2px">${esc(detail)}</div></div></td>`
    let body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px"><tr>
      ${box('Saved', '#eef3ff', '#1638a8', cur.saved, cur.saved > 0 && s.savedInto.length ? `into ${s.savedInto.join(', ')}` : cur.saved < 0 ? 'taken out of savings' : 'nothing this month')}
      ${box('Invested', '#e6f6f8', '#0b6b7a', cur.invested, investDetail)}
    </tr></table>`
    for (const g of s.goals) {
      const share = g.target ? g.cents / g.target : 0
      body += `<div style="height:12px;line-height:12px">&nbsp;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff;border-radius:18px"><tr><td style="padding:14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:15px;font-weight:800;color:${INK}">${esc(`${g.icon ? `${g.icon} ` : ''}${g.name}`)}</td><td align="right" style="font-size:22px;font-weight:800;color:#1f4fe0">${g.target ? pct(Math.min(share, 1)) : ''}</td></tr></table>
        <div style="height:10px;line-height:10px">&nbsp;</div>${progress(share, '#1f4fe0', '#ffffff', 10)}
        <div style="font-size:12px;color:${MUTED};margin-top:7px">${formatCents(g.cents)}${g.target ? ` of ${formatCents(g.target)}${g.cents < g.target ? ` · ${formatCents(g.target - g.cents)} to go` : ' · reached'}` : ''}</div>
      </td></tr></table>`
    }
    if (s.generalSavings !== null) body += `<div style="font-size:12px;color:${MUTED};margin-top:10px">General savings ${formatCents(s.generalSavings)}</div>`
    if (s.pension) body += `<div style="font-size:12px;color:${MUTED};margin-top:6px">🏛️ Pension ${formatCents(s.pension.cents)} · updated ${esc(dayLabel(s.pension.date))}${s.pension.putIn ? ` · ${formatCents(s.pension.putIn)} put in` : ''}</div>`
    sections.push(card('🛟', '#eef3ff', 'Saving & investing', `${formatCents(cur.kept)} kept`, body))
  }

  // 8. Recurring: paid this month, coming up next month
  const r = s.recurring
  if (r.paid.length || r.comingUp.length) {
    let body = ''
    if (r.paid.length) body += subHead(`Paid in ${s.month}`, true) + r.paid.map((p, i) => row(emojiTile(p.icon || '🔁', '#efe8ff'), p.name, `${dayLabel(p.date)} · ${freq[p.frequency] ?? ''}`, formatCents(p.cents), { last: i === r.paid.length - 1 })).join('')
    if (r.comingUp.length) {
      const dateTile = (iso, color) =>
        `<div style="width:40px;border-radius:11px;border:1px solid #e3e9f6;text-align:center;overflow:hidden"><div style="background:${color};color:#ffffff;font-size:9.5px;font-weight:800;padding:2px 0;letter-spacing:.6px">${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3).toUpperCase()}</div><div style="font-size:15px;font-weight:800;color:${INK};padding:3px 0 4px">${Number(iso.slice(8, 10))}</div></div>`
      body +=
        subHead(`Coming up in ${r.nextName}`, !r.paid.length) +
        r.comingUp
          .map((c, i) =>
            row(dateTile(c.date, c.type === 'income' ? '#2b8a3e' : '#7c4dff'), `${c.icon ? `${c.icon} ` : ''}${c.name}`, freq[c.frequency] ?? '', `${c.type === 'income' ? '+' : ''}${formatCents(c.cents)}`, {
              last: i === r.comingUp.length - 1,
              amountColor: c.type === 'income' ? '#1b6b3a' : INK,
            }),
          )
          .join('')
    }
    if (r.activeCount) body += `<div style="font-size:12px;color:${MUTED};margin-top:10px">${r.activeCount} active · ${formatCents(r.monthlyCents)} a month in total</div>`
    sections.push(card('🔁', '#efe8ff', 'Recurring', r.paidCents ? `${formatCents(r.paidCents)} paid` : '', body))
  }

  // 9. Accounts at the month's end
  if (s.accounts.length) {
    const sorted = [...s.accounts].sort((a, b) => b.cents - a.cents)
    const shown = sorted.slice(0, 5)
    const restAccounts = sorted.slice(5)
    const positive = s.accounts.reduce((t, a) => t + Math.max(a.cents, 0), 0) || 1
    let body = splitBar(sorted.filter((a) => a.cents > 0).map((a) => ({ share: a.cents / positive, color: a.color }))) + '<div style="height:6px;line-height:6px">&nbsp;</div>'
    body += shown.map((a, i) => row(letterTile(a.name, a.color), a.name, a.type, formatCents(a.cents), { last: i === shown.length - 1 })).join('')
    if (restAccounts.length) body += `<div style="font-size:12px;color:${MUTED};margin-top:10px">+ ${restAccounts.map((a) => `${esc(a.name)} ${formatCents(a.cents)}`).join(' · ')}</div>`
    sections.push(card('💳', '#eef3ff', `On ${Number(s.end.slice(8))} ${s.month}`, formatCents(s.accountsTotal), body))
  }

  // 10. Footer
  sections.push(`
<tr><td align="center" style="padding:10px 24px 28px;color:#7d8aa8;font-size:12px;line-height:1.6">
  <img src="cid:logo" width="34" height="34" alt="LynxOS" style="display:block;margin:4px auto 8px;border:0">
  <b style="color:${INK}">LynxOS</b> · your monthly report<br>Full note in Obsidian · 10 FINANCES › Expense reports › ${esc(s.key)}<br>Sent by your PC’s monthly backup
</td></tr>`)

  return {
    subject: emailSubject(s),
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(emailSubject(s))}</title></head>
<body style="margin:0;padding:0;background:#e9edf5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(s.verdict)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9edf5"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#f4f7fd;border-radius:28px;overflow:hidden;font-family:${FONT};color:${INK}">
${sections.join('\n')}
</table>
</td></tr></table>
</body></html>`,
  }
}

// The logo, attached inside the email (shown by cid)
export const LOGO_ATTACHMENTS = [
  { filename: 'logo-white.png', path: join(root, 'public', 'logo-white.png'), cid: 'logo-white' },
  { filename: 'logo.png', path: join(root, 'public', 'logo.png'), cid: 'logo' },
]

// Sends one month's report from GMAIL_USER (Gmail app password in GMAIL_APP_PASSWORD) to REPORT_EMAIL_TO or GMAIL_USER
export async function sendEmailReport(tables, key, { text } = {}) {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('Email is not set up yet: run `npm run email-setup` once.')
  const { default: nodemailer } = await import('nodemailer')
  const { subject, html } = buildEmailHtml(tables, key)
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: pass.replace(/\s/g, '') } })
  await transport.sendMail({ from: `LynxOS <${user}>`, to: process.env.REPORT_EMAIL_TO || user, subject, html, text, attachments: LOGO_ATTACHMENTS })
  return subject
}

// Months whose email went out, one per line in "emails sent.txt" in the backups folder (so each goes once)
const sentFile = (backupsDir) => join(backupsDir, 'emails sent.txt')
export function wasSent(backupsDir, key) {
  return existsSync(sentFile(backupsDir)) && readFileSync(sentFile(backupsDir), 'utf8').split(/\r?\n/).includes(key)
}
export function markSent(backupsDir, key) {
  if (!wasSent(backupsDir, key)) appendFileSync(sentFile(backupsDir), `${key}\r\n`)
}

// The newest backup.json in BACKUP_DIR (for sending or previewing by hand)
export function newestBackup(backupsDir) {
  const folders = readdirSync(backupsDir).filter((n) => /^LynxOS backup \d{4}-\d{2}-\d{2}$/.test(n)).sort()
  if (!folders.length) throw new Error(`No backup found in ${backupsDir}: run \`npm run backup\` first.`)
  return JSON.parse(readFileSync(join(backupsDir, folders.at(-1), 'backup.json'), 'utf8')).tables
}

// By hand: node scripts/email-report.mjs [YYYY-MM] [--preview]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.loadEnvFile(join(root, '.env.backup'))
  } catch {
    // Reported below if something is missing
  }
  const backupsDir = process.env.BACKUP_DIR || join(process.env.OneDrive || join(process.env.USERPROFILE, 'OneDrive'), 'LynxOS backups')
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const key = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? shiftMonth(today.slice(0, 7), -1)
  try {
    const tables = newestBackup(backupsDir)
    if (process.argv.includes('--preview')) {
      const { html } = buildEmailHtml(tables, key)
      // The preview carries the logo inside the page instead of as the email's attachment
      mkdirSync(join(root, '.harness'), { recursive: true })
      const file = join(root, '.harness', 'email-preview.html')
      const inline = (a) => `data:image/png;base64,${readFileSync(a.path).toString('base64')}`
      writeFileSync(file, html.replace(/cid:logo-white/g, inline(LOGO_ATTACHMENTS[0])).replace(/cid:logo"/g, `${inline(LOGO_ATTACHMENTS[1])}"`))
      console.log(`Preview written to ${file}`)
    } else {
      const { buildMonthlyReport } = await import('./monthly-report.mjs')
      console.log(`Sent: ${await sendEmailReport(tables, key, { text: buildMonthlyReport(tables, key) })}`)
      markSent(backupsDir, key)
    }
  } catch (error) {
    console.error('Email report failed:', error.message)
    process.exit(1)
  }
}
