// Applies supabase/migrations/*.sql through the Supabase Management API and
// records them in supabase_migrations.schema_migrations (the Supabase CLI table).
//
//   npm run db:migrate                     apply pending migrations
//   npm run db:migrate -- --dry-run        list pending migrations, change nothing
//   npm run db:status                      applied / pending
//   npm run db:migrate -- --baseline 068   mark 001…068 applied without running them
//   npm run db:sql -- "select 1"           run a query, print rows as JSON
//
// Needs SUPABASE_ACCESS_TOKEN (personal access token) in .env.local. The project
// ref is SUPABASE_PROJECT_REF or the subdomain of VITE_SUPABASE_URL.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const ROOT = resolve(import.meta.dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const FILE_RE = /^(\d+)_(.+)\.sql$/

function loadEnv() {
  const env = {}
  for (const name of ['.env', '.env.local']) {
    const path = join(ROOT, name)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { ...env, ...process.env }
}

// process.exit() right after fetch() trips a libuv assertion on Windows, so
// failures unwind to main() and only set the exit code.
function fail(message) {
  throw new Error(message)
}

const env = loadEnv()
const token = env.SUPABASE_ACCESS_TOKEN
const ref =
  env.SUPABASE_PROJECT_REF ||
  (env.VITE_SUPABASE_URL || '').match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    let message = text
    try {
      message = JSON.parse(text).message || text
    } catch {
      // not JSON
    }
    throw new Error(`HTTP ${res.status}: ${message}`)
  }
  return text ? JSON.parse(text) : []
}

function literal(value) {
  let tag
  do tag = `$m${randomBytes(4).toString('hex')}$`
  while (value.includes(tag))
  return `${tag}${value}${tag}`
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .map((file) => ({ file, m: file.match(FILE_RE) }))
    .filter(({ m }) => m)
    .map(({ file, m }) => ({ file, version: m[1], name: m[2] }))
    .sort((a, b) => Number(a.version) - Number(b.version) || a.version.localeCompare(b.version))
}

async function ensureHistory() {
  await query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `)
  const rows = await query('select version from supabase_migrations.schema_migrations')
  return new Set(rows.map((r) => r.version))
}

function recordSql({ version, name }, sql) {
  const statements = sql == null ? 'null' : `array[${literal(sql)}]`
  return `insert into supabase_migrations.schema_migrations (version, name, statements)
    values (${literal(version)}, ${literal(name)}, ${statements})
    on conflict (version) do nothing;`
}

async function main() {
  if (!token) fail('SUPABASE_ACCESS_TOKEN не найден в .env.local')
  if (!ref) fail('Не удалось определить project ref (SUPABASE_PROJECT_REF или VITE_SUPABASE_URL)')

  const args = process.argv.slice(2)
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'migrate'
  const flag = (name) => args.includes(name)

  if (command === 'sql') {
    const sql = args.slice(1).join(' ').trim()
    if (!sql) fail('Передайте SQL: npm run db:sql -- "select 1"')
    console.log(JSON.stringify(await query(sql), null, 2))
    return
  }

  const files = migrationFiles()
  const applied = await ensureHistory()
  const pending = files.filter((f) => !applied.has(f.version))

  const baselineAt = args.indexOf('--baseline')
  if (baselineAt !== -1) {
    const upTo = args[baselineAt + 1]
    if (!upTo || !/^\d+$/.test(upTo)) fail('Укажите версию: --baseline 068')
    const marked = pending.filter((f) => Number(f.version) <= Number(upTo))
    if (marked.length) await query(marked.map((f) => recordSql(f, null)).join('\n'))
    console.log(`Отмечено как применённые без запуска: ${marked.length} (до ${upTo} включительно)`)
    return
  }

  if (command === 'status') {
    console.log(`Проект ${ref}: применено ${files.length - pending.length} из ${files.length}`)
    const unknown = [...applied].filter((v) => !files.some((f) => f.version === v))
    if (unknown.length) console.log(`В базе есть версии без файлов: ${unknown.join(', ')}`)
    for (const f of pending) console.log(`  ожидает  ${f.file}`)
    if (!pending.length) console.log('Всё применено.')
    return
  }

  if (!pending.length) {
    console.log('Новых миграций нет, база в актуальном состоянии.')
    return
  }
  if (flag('--dry-run')) {
    console.log('Будут применены:')
    for (const f of pending) console.log(`  ${f.file}`)
    return
  }

  for (const f of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f.file), 'utf8').replace(/^\uFEFF/, '')
    process.stdout.write(`→ ${f.file} … `)
    try {
      // One multi-statement request runs as a single implicit transaction, so a
      // failing migration leaves neither its changes nor its history row behind.
      await query(`${sql}\n;\n${recordSql(f, sql)}`)
    } catch (error) {
      console.log('ошибка')
      fail(`${f.file} не применена, изменения откачены.\n  ${error.message}`)
    }
    console.log('ok')
  }
  console.log(`Готово: применено ${pending.length}.`)
}

main().catch((error) => {
  console.error(`\x1b[31m✗ ${error.message}\x1b[0m`)
  process.exitCode = 1
})
