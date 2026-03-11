import Blits from '@lightningjs/blits'

import Loader from '../components/Loader.js'
import RecordsTable from '../components/RecordsTable.js'
import { queryGeneralLedger } from '../api/rfabGeneralLedgerApi.js'

const THEME = {
  bg: '#0b1220',
  surface: '#0f172a',
  surface2: '#111827',
  border: '#1f2937',
  text: '#e5e7eb',
  muted: '#94a3b8',
  primary: '#2563EB',
  secondary: '#F59E0B',
  error: '#EF4444',
}

/**
 * PUBLIC_INTERFACE
 * Home route: General Ledger record viewer.
 *
 * Responsibilities (UI boundary):
 * - Manages query state (cursor, pageSize, filters/sort placeholders)
 * - Invokes GeneralLedgerQueryFlow (queryGeneralLedger)
 * - Renders aggregates header + records table + cursor pagination controls
 * - Handles loading/error states deterministically
 */
export default Blits.Component('Home', {
  components: {
    Loader,
    RecordsTable,
  },
  template: `
    <Element w="1920" h="1080" :color="$themeBg">
      <!-- Top bar -->
      <Element x="80" y="48" w="1760" h="96" :color="$surface" :effects="[$shader('radius', {radius: 14})]">
        <Text x="28" y="18" size="34" :content="$title" :color="$text" />
        <Text x="28" y="58" size="20" :content="$subtitle" :color="$muted" />
        <Element x="1500" y="22" w="232" h="52" :color="$primary" :effects="[$shader('radius', {radius: 12})]" alpha="0.22" />
        <Text x="1524" y="38" size="20" :content="$envHint" :color="$muted" />
      </Element>

      <!-- Aggregates card -->
      <Element x="80" y="168" w="1760" h="132" :color="$surface" :effects="[$shader('radius', {radius: 14})]">
        <Text x="28" y="20" size="22" content="Aggregates" :color="$muted" />
        <Text x="28" y="58" size="26" :content="$aggLine1" :color="$text" />
        <Text x="28" y="92" size="22" :content="$aggLine2" :color="$muted" />

        <!-- Status pill -->
        <Element x="1468" y="20" w="264" h="40" :color="$statusColor" alpha="0.18" :effects="[$shader('radius', {radius: 20})]" />
        <Text x="1490" y="30" size="20" :content="$statusText" :color="$statusColor" />
      </Element>

      <!-- Table -->
      <Element x="80" y="320" w="1760" h="640">
        <RecordsTable :w="1760" :h="640" :records="$records" :columns="$columns" :rowHeight="$rowHeight" />
        <Element :alpha="$loading ? 1 : 0" x="760" y="292" w="240" h="56" :color="$surface2" :effects="[$shader('radius', {radius: 12})]">
          <Loader x="50" y="18" />
          <Text x="120" y="16" size="20" content="Loading..." :color="$muted" />
        </Element>

        <Element :alpha="$error ? 1 : 0" x="220" y="280" w="1320" h="80" :color="$error" alpha="0.12" :effects="[$shader('radius', {radius: 12})]">
          <Text x="24" y="22" size="22" :content="$error" :color="$error" maxwidth="1270" />
        </Element>

        <Element :alpha="$emptyHintAlpha" x="520" y="270" w="720" h="96" :color="$surface2" alpha="0.2" :effects="[$shader('radius', {radius: 12})]">
          <Text x="24" y="20" size="22" :content="$emptyHint" :color="$muted" maxwidth="672" />
          <Text x="24" y="52" size="18" content="Tip: use Next/Prev to paginate, Enter to refresh." :color="$muted" alpha="0.8" />
        </Element>
      </Element>

      <!-- Pagination controls -->
      <Element x="80" y="980" w="1760" h="72" :color="$surface" :effects="[$shader('radius', {radius: 14})]">
        <Element x="22" y="14" w="180" h="44" :color="$buttonColor('prev')" :effects="[$shader('radius', {radius: 12})]" alpha="0.95">
          <Text x="18" y="12" size="20" :content="$prevLabel" :color="$buttonTextColor('prev')" />
        </Element>

        <Element x="220" y="14" w="180" h="44" :color="$buttonColor('next')" :effects="[$shader('radius', {radius: 12})]" alpha="0.95">
          <Text x="18" y="12" size="20" :content="$nextLabel" :color="$buttonTextColor('next')" />
        </Element>

        <Element x="440" y="14" w="260" h="44" :color="$surface2" alpha="0.7" :effects="[$shader('radius', {radius: 12})]">
          <Text x="18" y="12" size="20" :content="$pageSizeLabel" :color="$muted" />
        </Element>

        <Text x="740" y="24" size="20" :content="$pageInfoLabel" :color="$muted" />
        <Text x="1520" y="24" size="20" :content="$hintLabel" :color="$muted" />
      </Element>
    </Element>
  `,
  state() {
    const base = (import.meta?.env?.VITE_API_BASE || import.meta?.env?.VITE_BACKEND_URL || '').toString()
    return {
      title: 'RFAB General Ledger',
      subtitle: 'Cursor pagination + aggregates (contract Option A)',
      envHint: base ? `API: ${base}` : 'API: mock (no base URL)',

      themeBg: THEME.bg,
      surface: THEME.surface,
      surface2: THEME.surface2,
      text: THEME.text,
      muted: THEME.muted,
      primary: THEME.primary,
      secondary: THEME.secondary,
      errorColor: THEME.error,

      // Data
      records: [],
      aggregates: null,
      pageInfo: { pageSize: 50, hasNextPage: false, hasPrevPage: false, startCursor: null, endCursor: null, totalCount: null },

      // Query state
      cursor: null,
      direction: 'next',
      pageSize: 50,
      includeAggregates: true,

      // UI state
      loading: false,
      error: '',
      rowHeight: 44,

      // Controls
      focusIndex: 0, // 0 prev, 1 next

      columns: [
        { key: 'date', label: 'Date', x: 20, w: 150, muted: true },
        { key: 'name', label: 'Name', x: 190, w: 180 },
        { key: 'accountName', label: 'Account', x: 390, w: 220, muted: true },
        { key: 'description', label: 'Description', x: 630, w: 520, muted: true },
        { key: 'debit', label: 'Debit', x: 1180, w: 160 },
        { key: 'credit', label: 'Credit', x: 1360, w: 160 },
        { key: 'amount', label: 'Amount', x: 1540, w: 180 },
      ],
    }
  },
  computed: {
    statusText() {
      if (this.loading) return 'Loading'
      if (this.error) return 'Error'
      return 'Ready'
    },
    statusColor() {
      if (this.loading) return THEME.secondary
      if (this.error) return THEME.error
      return '#22c55e'
    },
    prevLabel() {
      return this.focusIndex === 0 ? '◄ Prev' : 'Prev'
    },
    nextLabel() {
      return this.focusIndex === 1 ? 'Next ►' : 'Next'
    },
    pageSizeLabel() {
      return `Page size: ${this.pageSize}`
    },
    pageInfoLabel() {
      const pi = this.pageInfo || {}
      const total = typeof pi.totalCount === 'number' ? ` • Total: ${pi.totalCount}` : ''
      const c = this.aggregates && typeof this.aggregates.count === 'number' ? ` • On page: ${this.aggregates.count}` : ''
      const hasPrev = pi.hasPrevPage ? 'Prev' : '—'
      const hasNext = pi.hasNextPage ? 'Next' : '—'
      return `Available: ${hasPrev}/${hasNext}${c}${total}`
    },
    hintLabel() {
      return 'Left/Right select • Enter paginate • Up/Down page size • R refresh'
    },
    aggLine1() {
      const a = this.aggregates
      if (!a) return 'Count: —  •  Net: —'
      const net = typeof a.net === 'number' ? a.net.toFixed(2) : '—'
      return `Count: ${a.count}  •  Net: ${net}`
    },
    aggLine2() {
      const a = this.aggregates
      if (!a) return 'Debit: —  •  Credit: —  •  Amount: —'
      const d = typeof a.sumDebit === 'number' ? a.sumDebit.toFixed(2) : '—'
      const c = typeof a.sumCredit === 'number' ? a.sumCredit.toFixed(2) : '—'
      const amt = typeof a.sumAmount === 'number' ? a.sumAmount.toFixed(2) : '—'
      return `Debit: ${d}  •  Credit: ${c}  •  Amount: ${amt}`
    },
    emptyHint() {
      if (this.loading) return ''
      if (this.error) return ''
      if (!this.records || this.records.length === 0) return 'No records returned for this page.'
      return ''
    },
    emptyHintAlpha() {
      return !this.loading && !this.error && (!this.records || this.records.length === 0) ? 1 : 0
    },
  },
  hooks: {
    ready() {
      // Initial load.
      this.loadPage({ cursor: null, direction: 'next' })
    },
  },
  methods: {
    buttonColor(which) {
      const pi = this.pageInfo || {}
      const disabled = (which === 'prev' && !pi.hasPrevPage) || (which === 'next' && !pi.hasNextPage) || this.loading
      if (disabled) return 0x1f2937ff
      const focused = (which === 'prev' && this.focusIndex === 0) || (which === 'next' && this.focusIndex === 1)
      return focused ? 0x2563ebff : 0x111827ff
    },
    buttonTextColor(which) {
      const pi = this.pageInfo || {}
      const disabled = (which === 'prev' && !pi.hasPrevPage) || (which === 'next' && !pi.hasNextPage) || this.loading
      if (disabled) return '#94a3b8'
      return '#e5e7eb'
    },

    async loadPage({ cursor, direction }) {
      const op = 'Home.loadPage'
      try {
        this.loading = true
        this.error = ''

        const res = await queryGeneralLedger({
          cursor,
          pageSize: this.pageSize,
          direction,
          // Filters & sort are placeholders for future UI controls.
          filters: {},
          sort: { field: 'date', order: 'desc' },
          includeAggregates: this.includeAggregates,
        })

        this.records = res.records || []
        this.pageInfo = res.pageInfo || this.pageInfo
        this.aggregates = res.aggregates || null

        // Invariant: we track cursor as the returned endCursor (forward paging model).
        this.cursor = this.pageInfo.endCursor || null
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.error = `${op}: ${msg}`
      } finally {
        this.loading = false
      }
    },

    async goNext() {
      const pi = this.pageInfo || {}
      if (this.loading || !pi.hasNextPage) return
      // Cursor contract: for next, use current endCursor.
      const cursor = pi.endCursor || this.cursor
      await this.loadPage({ cursor, direction: 'next' })
    },

    async goPrev() {
      const pi = this.pageInfo || {}
      if (this.loading || !pi.hasPrevPage) return
      // For prev, use startCursor (provider determines how to interpret it).
      const cursor = pi.startCursor || null
      await this.loadPage({ cursor, direction: 'prev' })
    },

    async refresh() {
      // Refresh current page (re-issue with current cursor semantics).
      const pi = this.pageInfo || {}
      const cursor = pi.startCursor || null
      await this.loadPage({ cursor, direction: 'next' })
    },

    adjustPageSize(delta) {
      const next = Math.max(10, Math.min(200, this.pageSize + delta))
      if (next === this.pageSize) return
      this.pageSize = next
      // Reset pagination when page size changes.
      this.cursor = null
      this.loadPage({ cursor: null, direction: 'next' })
    },
  },
  input: {
    left() {
      this.focusIndex = Math.max(0, this.focusIndex - 1)
    },
    right() {
      this.focusIndex = Math.min(1, this.focusIndex + 1)
    },
    up() {
      this.adjustPageSize(10)
    },
    down() {
      this.adjustPageSize(-10)
    },
    enter() {
      if (this.focusIndex === 0) this.goPrev()
      else this.goNext()
    },
    r() {
      this.refresh()
    },
  },
})
