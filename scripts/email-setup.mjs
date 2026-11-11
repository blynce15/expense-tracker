// One-time setup for the monthly email report (`npm run email-setup`, run by the owner in a terminal):
// asks for the Gmail address and a Gmail app password (typed hidden, never shown), saves them in .env.backup
// (on this PC only, never committed) and sends last month's report as a test.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { buildMonthlyReport, shiftMonth } from './monthly-report.mjs'
import { markSent, newestBackup, sendEmailReport } from './email-report.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env.backup')

// Reads a line without showing what is typed
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question)
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          return resolve(value)
        }
        if (ch === '\u0003') process.exit(1) // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

// Sets KEY='value' in .env.backup, replacing an older line
function saveSetting(key, value) {
  let text = readFileSync(envFile, 'utf8')
  const line = `${key}='${value.replace(/'/g, '')}'`
  const re = new RegExp(`^${key}=.*$`, 'm')
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`
  writeFileSync(envFile, text)
}

console.log('\nLynxOS monthly email: setup\n')
console.log('You need a Gmail app password (not your normal password):')
console.log('  1. Open https://myaccount.google.com/apppasswords (2-Step Verification must be on)')
console.log('  2. Name it "LynxOS" and press Create')
console.log('  3. Copy the 16-letter password it shows\n')

const rl = createInterface({ input: stdin, output: stdout })
const user = (await rl.question('Your Gmail address: ')).trim()
rl.close()
if (!/^[^\s@]+@[^\s@]+$/.test(user)) {
  console.error('That does not look like an email address. Nothing was saved.')
  process.exit(1)
}
const pass = (await askHidden('Gmail app password (hidden while you type): ')).replace(/\s/g, '')
if (pass.length < 16) {
  console.error('An app password has 16 letters. Nothing was saved.')
  process.exit(1)
}

saveSetting('GMAIL_USER', user)
saveSetting('GMAIL_APP_PASSWORD', pass)
console.log('\nSaved in .env.backup (on this PC only).')

process.loadEnvFile(envFile)
const backupsDir = process.env.BACKUP_DIR || join(process.env.OneDrive || join(process.env.USERPROFILE, 'OneDrive'), 'LynxOS backups')
const key = shiftMonth(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }).slice(0, 7), -1)
try {
  console.log(`Sending ${key} as a test…`)
  const tables = newestBackup(backupsDir)
  console.log(`Sent: ${await sendEmailReport(tables, key, { text: buildMonthlyReport(tables, key) })}`)
  markSent(backupsDir, key)
  console.log(`Check ${user}. From now on it arrives after each monthly backup.`)
} catch (error) {
  console.error(`The test email did not go out: ${error.message}`)
  console.error('If Gmail said the login was refused, create a new app password and run this again.')
  process.exit(1)
}
