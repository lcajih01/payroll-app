// Minimal in-memory PostgREST emulator for local demo / development.
// Lets you run the app without a Supabase project:
//   1. node scripts/mock-supabase.mjs        (listens on http://localhost:54321)
//   2. .env -> VITE_SUPABASE_URL=http://localhost:54321
//              VITE_SUPABASE_ANON_KEY=local-demo
//   3. npm run dev
// Data lives in memory only and resets on restart. NOT for production.
// Also used by src/tests/demoReset.test.js as an in-process test double.
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// ---- demo data (mirrors supabase/seed.sql) ---------------------------------
const id = () => randomUUID()
const now = () => new Date().toISOString()
const row = (r) => ({ id: id(), created_at: now(), ...r })

function buildDemoDb() {
  const hsh = row({ name: 'Home Stay Hotel' })
  const trz = row({ name: 'The Resthouse Zamboanga' })

  const emps = [
    [hsh, 'Lei Renales', 'Front Office', 'Receptionist', 'fixed', 13000, 'Regular', 'active'],
    [hsh, 'Angel Gabule', 'Housekeeping', 'Room Attendant', 'daily', 450, 'Regular', 'active'],
    [hsh, 'Aldrick Dela Cruz', 'Maintenance', 'Handy Man', 'fixed', 12000, 'Regular', 'active'],
    [hsh, 'Ino Neri', 'Front Office', 'Receptionist', 'fixed', 12500, 'Regular', 'active'],
    [hsh, 'Romeo Suabig', 'Maintenance', 'Maintenance Staff', 'daily', 500, 'Regular', 'active'],
    [hsh, 'Mary Grace Lim', 'Housekeeping', 'Room Attendant', 'daily', 450, 'Probationary', 'active'],
    [hsh, 'Jonas Bernardo', 'Security', 'Security Guard', 'fixed', 11000, 'Regular', 'active'],
    [hsh, 'Carla Mendoza', 'Front Office', 'Night Receptionist', 'fixed', 12000, 'Regular', 'archived'],
    [trz, 'Arnel Ramos', 'Security', 'Security', 'per_unit', 300, 'Regular', 'active'],
    [trz, 'Grace Chiong', 'Housekeeping', 'Room Attendant', 'per_unit', 250, 'Regular', 'active'],
    [trz, 'Dario Atilano', 'Grounds', 'Caretaker', 'fixed', 10000, 'Regular', 'active'],
    [trz, 'Jessa Marie Torres', 'Housekeeping', 'Room Attendant', 'per_unit', 250, 'Regular', 'active'],
    [trz, 'Ramil Bucoy', 'Maintenance', 'Handy Man', 'daily', 480, 'Regular', 'active'],
    [trz, 'Nina Alvarez', 'Front Office', 'Booking Coordinator', 'fixed', 11500, 'Regular', 'active'],
    [trz, 'Peter Sebastian', 'Grounds', 'Gardener', 'daily', 420, 'Contractual', 'archived'],
  ].map(([b, full_name, department, position, pay_type, rate, employment_status, status]) => {
    const enabled = employment_status === 'Regular'
    return row({
      business_id: b.id, full_name, department, position, pay_type, rate, employment_status,
      sss_enabled: enabled, philhealth_enabled: enabled, pagibig_enabled: enabled,
      notes: null, status,
    })
  })

  const empId = (name) => emps.find(e => e.full_name === name).id
  const cas = [
    ['Lei Renales', '2026-06-03', 5000, 'Personal', 1],
    ['Aldrick Dela Cruz', '2026-06-05', 3000, 'Personal', 1],
    ['Ino Neri', '2026-06-06', 1200, 'Medical', 1],
    ['Romeo Suabig', '2026-06-08', 1000, 'Personal', 1],
    ['Angel Gabule', '2026-06-09', 1500, 'Emergency', 1],
    ['Grace Chiong', '2026-06-10', 800, 'Personal', 2],
  ].map(([name, date, amount, reason, cutoff]) =>
    row({ employee_id: empId(name), date, amount, reason, year: 2026, month: 6, cutoff, notes: null }))

  return {
    businesses: [hsh, trz],
    employees: emps,
    cash_advances: cas,
    payroll_periods: [],
    payroll_entries: [],
    payroll_payments: [],
    settings: [],
  }
}

const UNIQUE = {
  businesses: [['name']],
  employees: [['business_id', 'full_name']],
  payroll_periods: [['year', 'month', 'cutoff']],
  payroll_entries: [['period_id', 'employee_id']],
  settings: [['key']],
}

// ---- request handling --------------------------------------------------------
const matches = (r, filters) => filters.every(([col, op, val]) => {
  const v = r[col]
  if (op === 'eq') return String(v) === val
  if (op === 'neq') return String(v) !== val
  if (op === 'gte') return String(v) >= val
  if (op === 'lte') return String(v) <= val
  if (op === 'gt') return String(v) > val
  if (op === 'lt') return String(v) < val
  return true
})

function parseFilters(params) {
  const filters = []
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const m = v.match(/^(eq|neq|gte|lte|gt|lt)\.(.*)$/s)
    if (m) filters.push([k, m[1], m[2]])
  }
  return filters
}

function applyOrder(rows, orderParam) {
  if (!orderParam) return rows
  const keys = orderParam.split(',').map(part => {
    const [col, dir] = part.split('.')
    return [col, dir === 'desc' ? -1 : 1]
  })
  return [...rows].sort((a, b) => {
    for (const [col, dir] of keys) {
      const av = a[col], bv = b[col]
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
    }
    return 0
  })
}

export function createMockServer() {
  const db = buildDemoDb()

  const dupKey = (table, r, cols) => cols.map(c => String(r[c])).join(' ')

  function findConflict(table, r, exceptId = null) {
    for (const cols of UNIQUE[table] || []) {
      const key = dupKey(table, r, cols)
      const hit = db[table].find(x => x.id !== exceptId && dupKey(table, x, cols) === key)
      if (hit) return { hit, cols }
    }
    return null
  }

  const server = createServer(async (req, res) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Content-Type': 'application/json',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end() }

    const url = new URL(req.url, 'http://localhost')
    const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)
    if (!m || !db[m[1]]) {
      res.writeHead(404, headers)
      return res.end(JSON.stringify({ message: `Unknown route ${url.pathname}` }))
    }
    const table = m[1]
    const filters = parseFilters(url.searchParams)
    const prefer = req.headers.prefer || ''
    const wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object')
    const body = ['POST', 'PATCH'].includes(req.method)
      ? JSON.parse(await new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s || 'null')) }))
      : null

    const send = (code, rows) => {
      res.writeHead(code, headers)
      if (wantsObject) {
        if (rows.length !== 1) {
          res.writeHead(406, headers)
          return res.end(JSON.stringify({ code: 'PGRST116', message: `Expected 1 row, got ${rows.length}` }))
        }
        return res.end(JSON.stringify(rows[0]))
      }
      res.end(JSON.stringify(rows))
    }
    const sendErr = (code, pgCode, message) => {
      res.writeHead(code, headers)
      res.end(JSON.stringify({ code: pgCode, message, details: null, hint: null }))
    }

    try {
      if (req.method === 'GET') {
        let rows = db[table].filter(r => matches(r, filters))
        rows = applyOrder(rows, url.searchParams.get('order'))
        const limit = url.searchParams.get('limit')
        if (limit) rows = rows.slice(0, Number(limit))
        return send(200, rows)
      }

      if (req.method === 'POST') {
        const incoming = (Array.isArray(body) ? body : [body]).map(r => row(r))
        const upsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates')
        const ignoreDup = prefer.includes('resolution=ignore-duplicates')
        const out = []
        for (const r of incoming) {
          const conflict = findConflict(table, r)
          if (conflict && upsert) {
            if (ignoreDup) continue
            Object.assign(conflict.hit, { ...r, id: conflict.hit.id, created_at: conflict.hit.created_at })
            out.push(conflict.hit)
          } else if (conflict) {
            return sendErr(409, '23505', `duplicate key value violates unique constraint on (${conflict.cols.join(', ')})`)
          } else {
            db[table].push(r)
            out.push(r)
          }
        }
        return send(201, out)
      }

      if (req.method === 'PATCH') {
        const rows = db[table].filter(r => matches(r, filters))
        for (const r of rows) {
          Object.assign(r, body)
          const conflict = findConflict(table, r, r.id)
          if (conflict) return sendErr(409, '23505', `duplicate key value violates unique constraint on (${conflict.cols.join(', ')})`)
        }
        return send(200, rows)
      }

      if (req.method === 'DELETE') {
        const removed = db[table].filter(r => matches(r, filters))
        db[table] = db[table].filter(r => !matches(r, filters))
        return send(200, removed)
      }

      sendErr(405, '0', 'Method not allowed')
    } catch (e) {
      sendErr(500, '0', e.message)
    }
  })

  server.db = db
  return server
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const PORT = process.env.PORT || 54321
  createMockServer().listen(PORT, () => {
    console.log(`Mock Supabase (PostgREST) listening on http://localhost:${PORT}`)
    console.log('In-memory demo data loaded. Data resets on restart.')
  })
}
