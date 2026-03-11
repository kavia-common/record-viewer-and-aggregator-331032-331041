import Blits from '@lightningjs/blits'

/**
 * PUBLIC_INTERFACE
 * RecordsTable renders a simple table for General Ledger records.
 *
 * Contract:
 * - Input props: records (array), columns (array), rowHeight (number), tableWidth/Height
 * - No side effects; pure render.
 * - Designed for performance: uses :range to limit row instantiation.
 */
export default Blits.Component('RecordsTable', {
  props: ['records', 'columns', 'rowHeight', 'w', 'h'],
  template: `
    <Element :w="$w" :h="$h">
      <!-- Header -->
      <Element w="1920" h="52" color="#0b1220" :w="$w" :effects="[$shader('radius', {radius: 10})]">
        <Element :for="col in $columns" :key="$col.key" :x="$col.x" y="14" :w="$col.w" h="24">
          <Text :content="$col.label" size="20" color="#cbd5e1" />
        </Element>
      </Element>

      <!-- Rows viewport -->
      <Element y="64" :w="$w" :h="$h - 64" color="#0b1220" alpha="0.35" :effects="[$shader('radius', {radius: 10})]" />

      <Element y="64" :w="$w" :h="$h - 64" clipbox="true">
        <Element
          :for="(rec, index) in $records"
          :key="$rec.id"
          :range="{from: 0, to: 60}"
          :y="$index * $rowHeight"
          :w="$w"
          :h="$rowHeight"
          :color="$index % 2 === 0 ? 0x111827AA : 0x0F172AAA"
        >
          <Element :for="col in $columns" :key="$col.key" :x="$col.x" y="10" :w="$col.w" :h="$rowHeight - 10">
            <Text :content="$formatCell($rec, $col)" size="20" :color="$col.muted ? '#93a4b8' : '#e5e7eb'" maxwidth="$col.w" />
          </Element>
        </Element>
      </Element>
    </Element>
  `,
  state() {
    return {
      // Defaults; can be overridden by props.
      columns: [],
      records: [],
      rowHeight: 44,
      w: 1760,
      h: 720,
    }
  },
  methods: {
    formatMoney(n) {
      const x = Number(n)
      if (!Number.isFinite(x)) return ''
      const abs = Math.abs(x)
      const sign = x < 0 ? '-' : ''
      const s = abs.toFixed(2)
      return `${sign}${s}`
    },
    formatCell(rec, col) {
      const key = col.key
      const v = rec ? rec[key] : ''
      if (key === 'debit' || key === 'credit' || key === 'amount') return this.formatMoney(v)
      return v == null ? '' : String(v)
    },
  },
})
