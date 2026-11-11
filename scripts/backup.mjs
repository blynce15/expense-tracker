// Monthly data backup (runs on the owner's PC, see CLAUDE.md → Data backup).
// Copies every table in the database's public schema into a dated folder (BACKUP_DIR):
// backup.json (everything, for restoring) + one CSV per table (to open in Excel).
// Then writes the monthly Obsidian notes (scripts/monthly-report.mjs) into REPORT_DIR, if set,
// and emails last month's report (scripts/email-report.mjs) once Gmail is set up.
// The database address (DATABASE_URL) and the folder (BACKUP_DIR) live in .env.backup, on this PC only (never committed).
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { buildMonthlyReport, isoDate, monthsToReport, reportFileName, shiftMonth } from './monthly-report.mjs'
import { markSent, sendEmailReport, wasSent } from './email-report.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(join(root, '.env.backup'))
} catch {
  // Reported below: DATABASE_URL will be missing
}
// Without BACKUP_DIR: a "LynxOS backups" folder in OneDrive
const backupsDir = process.env.BACKUP_DIR || join(process.env.OneDrive || join(process.env.USERPROFILE, 'OneDrive'), 'LynxOS backups')
const failedNote = join(backupsDir, 'BACKUP FAILED.txt')
const reportFailedNote = join(backupsDir, 'REPORT FAILED.txt')
const emailFailedNote = join(backupsDir, 'EMAIL FAILED.txt')
const lisbonToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }) // 2026-10-17

// Monthly notes for Obsidian (REPORT_DIR in .env.backup): one per finished month that has no note yet,
// so a missed month catches up and a note is never overwritten. A failure here never stops the backup.
function writeReports(data) {
  const dir = process.env.REPORT_DIR
  if (!dir) return []
  try {
    mkdirSync(dir, { recursive: true })
    const today = lisbonToday()
    const written = []
    for (const key of monthsToReport(data, readdirSync(dir), today)) {
      writeFileSync(join(dir, reportFileName(key)), buildMonthlyReport(data, key, { createdOn: today }))
      written.push(reportFileName(key))
    }
    if (existsSync(reportFailedNote)) rmSync(reportFailedNote)
    return written
  } catch (error) {
    writeFileSync(reportFailedNote, `The LynxOS monthly report on ${new Date().toString()} did not work (the backup itself is fine).\r\n\r\n${error.message}\r\n`)
    console.error('Report failed:', error.message)
    return []
  }
}

// Monthly email (scripts/email-report.mjs): last month's report, once, after the note. Only once the owner has run
// `npm run email-setup`. A month that couldn't be sent (no internet, Gmail down) is tried again on the next run.
async function sendMonthlyEmail(data) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return
  const key = shiftMonth(lisbonToday().slice(0, 7), -1)
  if (wasSent(backupsDir, key) || !data.transactions?.some((t) => isoDate(t.date).startsWith(key))) return
  try {
    console.log(`Email sent: ${await sendEmailReport(data, key, { text: buildMonthlyReport(data, key) })}`)
    markSent(backupsDir, key)
    if (existsSync(emailFailedNote)) rmSync(emailFailedNote)
  } catch (error) {
    writeFileSync(emailFailedNote, `The LynxOS monthly email on ${new Date().toString()} did not go out (the backup and the note are fine). It will be tried again on the next backup.\r\n\r\n${error.message}\r\n`)
    console.error('Email failed:', error.message)
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(columns, rows) {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n' // BOM so Excel reads € and emoji correctly
}

async function run() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')) {
    throw new Error('DATABASE_URL in .env.backup is missing or still has [YOUR-PASSWORD] in it.')
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    // Read everything at one moment in time, and never change anything.
    await client.query('begin transaction isolation level repeatable read read only')
    const { rows: tables } = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    )

    const stamp = lisbonToday()
    const folder = join(backupsDir, `LynxOS backup ${stamp}`)
    rmSync(folder, { recursive: true, force: true }) // a second run the same day starts fresh
    mkdirSync(folder, { recursive: true })

    const data = {}
    const counts = []
    for (const { table_name: name } of tables) {
      const result = await client.query(`select * from public."${name.replace(/"/g, '""')}"`)
      data[name] = result.rows
      writeFileSync(join(folder, `${name}.csv`), toCsv(result.fields.map((f) => f.name), result.rows))
      counts.push(`${name}: ${result.rows.length}`)
    }
    await client.query('commit')

    writeFileSync(
      join(folder, 'backup.json'),
      JSON.stringify({ app: 'LynxOS', createdAt: new Date().toISOString(), tables: data }, null, 1),
    )
    writeFileSync(join(folder, 'what is in here.txt'), `LynxOS backup, ${new Date().toString()}\r\n\r\nRows per table:\r\n${counts.join('\r\n')}\r\n`)
    if (existsSync(failedNote)) rmSync(failedNote)
    console.log(`Backup saved to ${folder}\n${counts.join('\n')}`)
    const reports = writeReports(data)
    if (reports.length) console.log(`Monthly report: ${reports.join(', ')}`)
    await sendMonthlyEmail(data)
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  mkdirSync(backupsDir, { recursive: true })
  writeFileSync(failedNote, `The LynxOS backup on ${new Date().toString()} did not work.\r\n\r\n${error.message}\r\n`)
  console.error('Backup failed:', error.message)
  process.exit(1)
})
