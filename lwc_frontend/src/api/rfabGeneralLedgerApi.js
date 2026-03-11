//
// Reusable Flow Implementation (Maintainable, Debuggable, Non-Patchy)
//
// Flow name: GeneralLedgerQueryFlow
// Single entrypoint: queryGeneralLedger(request)
//
// Contract (Option A):
// - Request: { cursor, pageSize, direction?, filters?, sort?, includeAggregates? }
// - Response: { records, pageInfo, aggregates? }
// - Errors: throws Error with message including operation context.
// - Side effects: network call (real mode) or deterministic mock generation (mock mode).
//

/**
 * @typedef {Object} GeneralLedgerQueryFilters
 * @property {string=} dateFrom ISO date string (YYYY-MM-DD)
 * @property {string=} dateTo ISO date string (YYYY-MM-DD)
 * @property {string=} accountId
 * @property {string=} search Free-text search
 */

/**
 * @typedef {Object} GeneralLedgerSort
 * @property {string} field
 * @property {'asc'|'desc'} order
 */

/**
 * @typedef {Object} GeneralLedgerQueryRequest
 * @property {string|null} cursor Opaque cursor returned by the API. null for first page.
 * @property {number} pageSize Number of records requested.
 * @property {'next'|'prev'=} direction Cursor direction.
 * @property {GeneralLedgerQueryFilters=} filters
 * @property {GeneralLedgerSort=} sort
 * @property {boolean=} includeAggregates
 */

/**
 * @typedef {Object} GeneralLedgerPageInfo
 * @property {number} pageSize
 * @property {boolean} hasNextPage
 * @property {boolean=} hasPrevPage
 * @property {string=} startCursor
 * @property {string=} endCursor
 * @property {number=} totalCount
 */

/**
 * @typedef {Object} GeneralLedgerAggregates
 * @property {number} count
 * @property {number=} sumAmount
 * @property {number=} sumDebit
 * @property {number=} sumCredit
 * @property {number=} net
 */

/**
 * @typedef {Object} GeneralLedgerRecord
 * @property {string} id
 * @property {string=} name
 * @property {string=} date
 * @property {string=} accountId
 * @property {string=} accountName
 * @property {string=} description
 * @property {number=} amount
 * @property {number=} debit
 * @property {number=} credit
 */

/**
 * @typedef {Object} GeneralLedgerQueryResponse
 * @property {GeneralLedgerRecord[]} records
 * @property {GeneralLedgerPageInfo} pageInfo
 * @property {GeneralLedgerAggregates=} aggregates
 */

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 500

function clampPageSize(pageSize) {
  const n = Number(pageSize)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(n)))
}

function safeString(v) {
  return typeof v === 'string' ? v : ''
}

/**
 * Encode/decode opaque cursor for mock provider.
 * We keep it opaque to the UI; only the provider understands its format.
 */
function encodeCursor(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
}
function decodeCursor(cursor) {
  try {
    const json = decodeURIComponent(escape(atob(cursor)))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function resolveApiBase() {
  // IMPORTANT: do not hardcode environment; Vite exposes env via import.meta.env.*
  const base = safeString(import.meta?.env?.VITE_API_BASE) || safeString(import.meta?.env?.VITE_BACKEND_URL)
  return base.replace(/\/+$/, '')
}

function shouldUseMock() {
  // If no base URL is set, or explicit mock flag is enabled, use mock.
  const explicit = safeString(import.meta?.env?.VITE_FEATURE_FLAGS)
  if (explicit.toLowerCase().includes('mock_api')) return true
  return !resolveApiBase()
}

/**
 * Minimal shape validation to prevent silent UI failures.
 * @param {any} data
 * @returns {GeneralLedgerQueryResponse}
 */
function assertValidResponse(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid response: expected object')
  if (!Array.isArray(data.records)) throw new Error('Invalid response: expected records[]')
  if (!data.pageInfo || typeof data.pageInfo !== 'object') throw new Error('Invalid response: expected pageInfo')
  if (typeof data.pageInfo.pageSize !== 'number') throw new Error('Invalid response: pageInfo.pageSize must be number')
  if (typeof data.pageInfo.hasNextPage !== 'boolean') throw new Error('Invalid response: pageInfo.hasNextPage must be boolean')
  return data
}

async function httpPostJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch (e) {
    throw new Error(`HTTP ${res.status} - Non-JSON response from ${url}`)
  }

  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`
    throw new Error(`${msg} (${url})`)
  }
  return json
}

/**
 * Deterministic pseudo-random generator (mulberry32) for mock data.
 * Ensures stable results between reloads for easier debugging.
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function formatIsoDateFromIndex(i) {
  // Produce a stable date range.
  const base = new Date(Date.UTC(2023, 0, 1))
  base.setUTCDate(base.getUTCDate() + (i % 365))
  const yyyy = base.getUTCFullYear()
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(base.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function computeMockRecord(i, rand) {
  const debit = Math.round(rand() * 2000 * 100) / 100
  const credit = Math.round(rand() * 1800 * 100) / 100
  const amount = Math.round((debit - credit) * 100) / 100
  const accountIndex = i % 20
  return {
    id: `mock-${i}`,
    name: `GL-${String(i).padStart(6, '0')}`,
    date: formatIsoDateFromIndex(i),
    accountId: `ACC-${String(accountIndex).padStart(3, '0')}`,
    accountName: `Account ${accountIndex + 1}`,
    description: `Mock ledger entry ${i}`,
    debit,
    credit,
    amount,
  }
}

function passesFilters(rec, filters) {
  if (!filters) return true
  const dateFrom = safeString(filters.dateFrom)
  const dateTo = safeString(filters.dateTo)
  const accountId = safeString(filters.accountId)
  const search = safeString(filters.search).toLowerCase()

  if (accountId && rec.accountId !== accountId) return false
  if (dateFrom && rec.date && rec.date < dateFrom) return false
  if (dateTo && rec.date && rec.date > dateTo) return false

  if (search) {
    const hay = `${rec.name || ''} ${rec.description || ''} ${rec.accountName || ''}`.toLowerCase()
    if (!hay.includes(search)) return false
  }
  return true
}

function sortRecords(records, sort) {
  if (!sort || !sort.field) return records
  const field = sort.field
  const order = sort.order === 'desc' ? -1 : 1
  const copy = records.slice(0)
  copy.sort((a, b) => {
    const va = a[field]
    const vb = b[field]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * order
    return String(va).localeCompare(String(vb)) * order
  })
  return copy
}

function computeAggregates(records) {
  let sumAmount = 0
  let sumDebit = 0
  let sumCredit = 0
  for (const r of records) {
    sumAmount += Number(r.amount || 0)
    sumDebit += Number(r.debit || 0)
    sumCredit += Number(r.credit || 0)
  }
  sumAmount = Math.round(sumAmount * 100) / 100
  sumDebit = Math.round(sumDebit * 100) / 100
  sumCredit = Math.round(sumCredit * 100) / 100
  const net = Math.round((sumDebit - sumCredit) * 100) / 100
  return { count: records.length, sumAmount, sumDebit, sumCredit, net }
}

/**
 * Mock provider supports large dataset (50k+) via cursor offset.
 * Cursor invariant: it encodes the starting offset (0-based) for the page.
 * @param {GeneralLedgerQueryRequest} request
 * @returns {Promise<GeneralLedgerQueryResponse>}
 */
async function mockQuery(request) {
  const pageSize = clampPageSize(request.pageSize)
  const direction = request.direction || 'next'
  const includeAggregates = request.includeAggregates !== false

  const TOTAL = 50000
  const seed = 1337
  const rand = mulberry32(seed)

  // Generate full dataset once per call would be heavy.
  // Instead, we generate only what we need for the requested page,
  // but we still need aggregates; so aggregates are approximate to filtered set.
  // For mock: if filters exist, we compute aggregates over a sampled range for performance,
  // and keep the contract shape stable. This is explicitly a mock limitation.
  const decoded = request.cursor ? decodeCursor(request.cursor) : null
  const baseOffset = decoded && typeof decoded.offset === 'number' ? decoded.offset : 0

  let offset = baseOffset
  if (request.cursor && direction === 'next') offset = baseOffset
  if (request.cursor && direction === 'prev') offset = Math.max(0, baseOffset - pageSize)

  // Build page by scanning forward until we have enough records that pass filters.
  const filters = request.filters || null
  const sort = request.sort || null

  // Sorting: for mock we support sorting by generating a larger window then sorting.
  // This keeps UI functional without generating 50k items.
  const WINDOW = Math.min(TOTAL, pageSize * 6)
  const windowRecs = []
  const startScan = offset
  const endScan = Math.min(TOTAL, offset + WINDOW)

  // Advance rand deterministically to startScan
  // We must consume random calls per record to keep deterministic results.
  // Each record consumes 2 rand() calls.
  for (let i = 0; i < startScan; i++) {
    rand()
    rand()
  }

  for (let i = startScan; i < endScan; i++) {
    const rec = computeMockRecord(i, rand)
    if (passesFilters(rec, filters)) windowRecs.push(rec)
  }

  const sortedWindow = sortRecords(windowRecs, sort)
  const pageRecords = sortedWindow.slice(0, pageSize)

  const startCursor = encodeCursor({ offset: startScan })
  const endCursor = encodeCursor({ offset: Math.min(TOTAL, startScan + pageSize) })

  const hasPrevPage = startScan > 0
  const hasNextPage = startScan + pageSize < TOTAL

  const aggregates = includeAggregates
    ? // NOTE: mock aggregates computed on returned page for speed (not entire dataset).
      // This keeps UI contract stable while avoiding heavy computation.
      computeAggregates(pageRecords)
    : undefined

  return {
    records: pageRecords,
    pageInfo: {
      pageSize,
      hasNextPage,
      hasPrevPage,
      startCursor,
      endCursor,
      totalCount: TOTAL,
    },
    aggregates,
  }
}

/**
 * PUBLIC_INTERFACE
 * Canonical entrypoint to query RFAB General Ledger records using the agreed contract.
 *
 * @param {GeneralLedgerQueryRequest} request
 * @returns {Promise<GeneralLedgerQueryResponse>}
 * @throws {Error} when validation fails or network errors occur.
 */
export async function queryGeneralLedger(request) {
  const op = 'GeneralLedgerQueryFlow.queryGeneralLedger'
  try {
    const normalized = {
      cursor: request?.cursor ?? null,
      pageSize: clampPageSize(request?.pageSize),
      direction: request?.direction,
      filters: request?.filters,
      sort: request?.sort,
      includeAggregates: request?.includeAggregates !== false,
    }

    if (shouldUseMock()) {
      const data = await mockQuery(normalized)
      return assertValidResponse(data)
    }

    const base = resolveApiBase()
    const url = `${base}/api/rfab/general-ledger/query`
    const data = await httpPostJson(url, normalized)
    return assertValidResponse(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Add context without swallowing root cause.
    throw new Error(`${op} failed: ${msg}`)
  }
}
