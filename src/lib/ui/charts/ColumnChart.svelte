<script lang="ts">
  /**
   * Single-series column chart (SVG, no library — ADR-006): bars ≤ 24 px with a 4 px rounded top,
   * hairline grid, tooltip on hover; keyboard users move through the columns with ←/→ (slider
   * semantics) and every value is also in the table view.
   */
  interface Props {
    values: readonly number[]
    /** Full label of each column (tooltip, table). */
    labels: readonly string[]
    /** Axis label under some columns (empty string for the others). */
    ticks: readonly string[]
    title: string
    /** Screen-reader text for one column. */
    describe: (value: number, label: string) => string
    tableSummary: string
    tableHeader: [string, string]
  }
  let { values, labels, ticks, title, describe, tableSummary, tableHeader }: Props = $props()

  const H = 200
  const PAD = { top: 16, right: 8, bottom: 24, left: 36 }
  let width = $state(640)
  const plotW = $derived(Math.max(1, width - PAD.left - PAD.right))
  const plotH = H - PAD.top - PAD.bottom

  /** Axis maximum on a 1-2-5 scale with an integer midpoint (0 · half · max ticks). */
  const niceMax = (max: number) => {
    if (max <= 4) return 4
    const power = 10 ** Math.floor(Math.log10(max))
    const step = [1, 2, 5, 10].map((m) => m * power).find((c) => c >= max) ?? 10 * power
    return step % 2 === 0 ? step : step * 2
  }
  const max = $derived(niceMax(Math.max(0, ...values)))
  const band = $derived(plotW / Math.max(1, values.length))
  const barW = $derived(Math.min(24, Math.max(2, band - 2)))
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const yTicks = $derived([0, max / 2, max])

  let active = $state<number | null>(null)

  function bar(i: number, v: number): string {
    if (v <= 0) return ''
    const x = PAD.left + i * band + (band - barW) / 2
    const top = y(v)
    const bottom = PAD.top + plotH
    const r = Math.min(4, barW / 2, bottom - top)
    return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bottom}Z`
  }

  function onKey(e: KeyboardEvent) {
    const last = values.length - 1
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
    if (e.key in moves) {
      e.preventDefault()
      active = Math.min(last, Math.max(0, (active ?? -1) + (moves[e.key] ?? 0)))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      active = e.key === 'Home' ? 0 : last
    } else if (e.key === 'Escape') active = null
  }

  /** The whole column band is the hover target (crosshair-like), not only the painted bar. */
  function onPointer(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left
    const i = Math.floor(x / band)
    active = i >= 0 && i < values.length ? i : null
  }

  const fmt = new Intl.NumberFormat('fr-FR')
  const current = $derived(active ?? 0)
</script>

<figure class="chart">
  <figcaption class="visually-hidden">{title}</figcaption>
  <div
    class="plot"
    bind:clientWidth={width}
    role="slider"
    aria-label={title}
    aria-valuemin={0}
    aria-valuemax={Math.max(0, values.length - 1)}
    aria-valuenow={current}
    aria-valuetext={describe(values[current] ?? 0, labels[current] ?? '')}
    tabindex="0"
    onkeydown={onKey}
    onfocus={() => (active ??= 0)}
    onblur={() => (active = null)}
    onpointermove={onPointer}
    onpointerleave={() => (active = null)}
  >
    <svg {width} height={H} aria-hidden="true">
      {#each yTicks as tick (tick)}
        <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
        <text class="axis" x={PAD.left - 6} y={y(tick) + 4} text-anchor="end"
          >{fmt.format(tick)}</text
        >
      {/each}
      {#each values as v, i (i)}
        <path class="bar" class:active={active === i} d={bar(i, v)} />
        {#if ticks[i]}
          <text class="axis" x={PAD.left + i * band + band / 2} y={H - 6} text-anchor="middle"
            >{ticks[i]}</text
          >
        {/if}
      {/each}
    </svg>
    {#if active !== null}
      <div
        class="tooltip"
        style:left={`${PAD.left + active * band + band / 2}px`}
        style:top={`${y(values[active] ?? 0)}px`}
      >
        <strong class="value">{fmt.format(values[active] ?? 0)}</strong>
        <span class="muted">{labels[active]}</span>
      </div>
    {/if}
  </div>
  <details class="table-view small">
    <summary>{tableSummary}</summary>
    <table>
      <thead>
        <tr><th scope="col">{tableHeader[0]}</th><th scope="col">{tableHeader[1]}</th></tr>
      </thead>
      <tbody>
        {#each values as v, i (i)}
          <tr><td>{labels[i]}</td><td class="tabular">{fmt.format(v)}</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .chart {
    margin: 0;
  }

  .plot {
    position: relative;
    width: 100%;
    border-radius: var(--radius);
    touch-action: pan-y;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }

  .axis {
    fill: var(--text-2);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    fill: var(--accent);
    transition: fill var(--duration) ease;
  }

  .bar.active {
    fill: var(--text);
  }

  .tooltip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 8px));
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-1) var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 0.8rem;
    white-space: nowrap;
    pointer-events: none;
    z-index: 2;
  }

  .value {
    font-size: 1rem;
  }

  .table-view summary {
    cursor: pointer;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    color: var(--text-2);
  }

  .table-view table {
    max-width: 24rem;
  }

  .table-view td,
  .table-view th {
    padding: 2px var(--space-2);
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
</style>
