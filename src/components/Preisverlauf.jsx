import { useMemo, useState } from 'react'
import { History, TrendingDown, TrendingUp } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../lib/cn.js'
import { formatPreisEUR } from '../backend/magazin/format.js'

/**
 * @typedef {object} PreisEintrag
 * @property {string} date
 * @property {number} price
 * @property {string} [label]
 * @property {number} [timestamp]
 */

const RANGE_OPTS = [
  { id: '30d', label: '30 T' },
  { id: '90d', label: '90 T' },
  { id: '1y', label: '1 J' },
  { id: 'all', label: 'Alle' },
]

function dayPart(dateDisplay) {
  const i = dateDisplay.indexOf(',')
  return (i >= 0 ? dateDisplay.slice(0, i) : dateDisplay).trim()
}

function eurStr(n) {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2).replace('.', ',')} €`
}

/** Tooltip-Inhalt beim Hover */
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm text-left">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {d.label || 'Preis'}
      </p>
      <p className="text-[14px] font-semibold tabular-nums text-foreground">
        {formatPreisEUR(d.price)}
      </p>
      <p className="text-[11px] text-muted-foreground">{d.date}</p>
    </div>
  )
}

/**
 * @param {{ chartData: PreisEintrag[], listData?: PreisEintrag[] }} props
 */
export function Preisverlauf({ chartData, listData: listDataProp }) {
  const listSource = listDataProp ?? chartData
  const [range, setRange] = useState(/** @type {'30d'|'90d'|'1y'|'all'} */ ('all'))

  const filtered = useMemo(() => {
    const now = Date.now()
    const data = chartData
    const cut = (ms) => data.filter((d) => (d.timestamp != null ? d.timestamp >= now - ms : true))
    if (range === 'all') return [...data]
    if (range === '30d') return cut(30 * 86400000)
    if (range === '90d') return cut(90 * 86400000)
    return cut(365 * 86400000)
  }, [chartData, range])

  const listFiltered = useMemo(() => {
    const now = Date.now()
    const data = listSource
    const cut = (ms) => data.filter((d) => (d.timestamp != null ? d.timestamp >= now - ms : true))
    if (range === 'all') return [...data]
    if (range === '30d') return cut(30 * 86400000)
    if (range === '90d') return cut(90 * 86400000)
    return cut(365 * 86400000)
  }, [listSource, range])

  const series = useMemo(() => {
    return filtered
      .filter((d) => Number.isFinite(d.price))
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  }, [filtered])

  const listChrono = useMemo(() => {
    return [...listFiltered]
      .filter((d) => Number.isFinite(d.price))
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  }, [listFiltered])

  const listEntries = useMemo(() => {
    const asc = [...listFiltered]
      .filter((d) => Number.isFinite(d.price))
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    const rev = [...asc].reverse()
    return rev.slice(0, 5).map((entry, i) => {
      const older = rev[i + 1]
      const diff = older ? entry.price - older.price : null
      return { entry, diff }
    })
  }, [listFiltered])

  const lastPrice = series.length ? series[series.length - 1].price : null
  const firstPrice = series.length ? series[0].price : null
  const trendDelta =
    lastPrice != null && firstPrice != null && series.length >= 2
      ? lastPrice - firstPrice
      : null
  const trendPct =
    trendDelta != null && firstPrice != null && Math.abs(firstPrice) >= 1e-9
      ? (trendDelta / firstPrice) * 100
      : null
  const trendDir =
    trendDelta == null || Math.abs(trendDelta) < 0.005
      ? 'flat'
      : trendDelta > 0
        ? 'up'
        : 'down'

  const yDomain = useMemo(() => {
    if (!series.length) return ['auto', 'auto']
    const prices = series.map((d) => d.price)
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const pad = Math.max((hi - lo) * 0.25, 0.05)
    return [lo - pad, hi + pad]
  }, [series])

  const showFullChart = series.length >= 2
  const showSinglePoint = series.length < 2 && listChrono.length === 1
  const showEmpty = listChrono.length === 0

  const listBlock = (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Letzte Änderungen
      </p>
      <ul className="mt-1 divide-y divide-border">
        {listEntries.map(({ entry, diff }, idx) => (
          <li
            key={`${entry.timestamp ?? entry.date}-${idx}`}
            className="flex gap-2 py-1.5 pr-0.5"
          >
            <span
              className={cn(
                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                diff == null && 'bg-muted-foreground',
                diff != null && diff > 0.005 && 'bg-destructive',
                diff != null && diff < -0.005 && 'bg-[hsl(142_70%_35%)]',
                diff != null && Math.abs(diff) <= 0.005 && 'bg-muted-foreground'
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium tabular-nums text-foreground">
                {formatPreisEUR(entry.price)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {entry.label || (diff == null ? 'Erster Preis' : 'Preisänderung')}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11.5px] tabular-nums text-muted-foreground">
                {dayPart(entry.date)}
              </div>
              {diff != null && Math.abs(diff) >= 0.01 ? (
                <div
                  className="text-[11px] tabular-nums"
                  style={{ color: diff > 0 ? 'hsl(0 70% 45%)' : 'hsl(142 70% 35%)' }}
                >
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(2).replace('.', ',')} €
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preisverlauf
        </p>
        {showFullChart && (
          <div
            className="flex h-[22px] overflow-hidden rounded-md border border-border"
            role="tablist"
            aria-label="Zeitraum"
          >
            {RANGE_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={range === opt.id}
                onClick={() => setRange(/** @type {any} */ (opt.id))}
                className={cn(
                  'border-r border-border px-2 text-[10px] font-medium last:border-r-0',
                  range === opt.id
                    ? 'bg-muted font-semibold text-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/50'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!showEmpty && showFullChart ? (
        <>
          {/* Aktueller Preis + Trend */}
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold tabular-nums tracking-tight text-foreground">
              {lastPrice != null ? formatPreisEUR(lastPrice) : '—'}
            </span>
            {trendDelta != null && trendPct != null && trendDir !== 'flat' && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular-nums',
                  trendDir === 'up' ? 'text-destructive' : 'text-[hsl(142_70%_35%)]'
                )}
              >
                {trendDir === 'up' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trendDelta > 0 ? '+' : ''}
                {trendDelta.toFixed(2).replace('.', ',')} € ({trendPct > 0 ? '+' : ''}
                {trendPct.toFixed(1)} %)
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {listChrono.length >= 2
              ? `${listChrono.length - 1} Änderung${listChrono.length - 1 === 1 ? '' : 'en'} · seit ${dayPart(listChrono[0].date)}`
              : 'Erster Preis erfasst'}
          </p>

          {/* Area Chart */}
          <div className="mt-2 w-full overflow-hidden rounded-md border border-border bg-background">
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pv-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--foreground))"
                      stopOpacity={0.15}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--foreground))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.6}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickMargin={6}
                  tickFormatter={(v) => dayPart(String(v))}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => `${Number(v).toFixed(2).replace('.', ',')}€`}
                  width={46}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={<ChartTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={1.5}
                  fill="url(#pv-gradient)"
                  dot={{ r: 3, fill: 'hsl(var(--background))', stroke: 'hsl(var(--foreground))', strokeWidth: 1.5 }}
                  activeDot={{ r: 4.5, fill: 'hsl(var(--background))', stroke: 'hsl(var(--foreground))', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {listBlock}
        </>
      ) : !showEmpty && showSinglePoint ? (
        <>
          <div className="mt-1.5">
            <span className="text-[20px] font-semibold tabular-nums tracking-tight text-foreground">
              {lastPrice != null ? formatPreisEUR(lastPrice) : '—'}
            </span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Erster Preis · {dayPart(listChrono[0]?.date ?? '')} — Grafik erscheint nach der nächsten
              Preisänderung.
            </p>
          </div>
          <div className="mt-2 flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border bg-muted/10">
            <p className="text-[11.5px] text-muted-foreground">Noch nur ein Eintrag</p>
          </div>
          {listBlock}
        </>
      ) : (
        <div className="mt-2 flex min-h-[100px] flex-col items-center justify-center rounded-md border border-border bg-muted/20 px-3 py-5 text-center">
          <History className="h-5 w-5 text-muted-foreground opacity-50" aria-hidden />
          <p className="mt-2 text-[12px] text-muted-foreground">Noch keine Einträge in der Historie</p>
        </div>
      )}
    </div>
  )
}
