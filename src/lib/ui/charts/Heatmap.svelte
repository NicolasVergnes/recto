<script lang="ts">
  /**
   * 365-day review heatmap (SVG): one column per week (Monday first), a validated one-hue
   * sequential ramp (--heat-0…4), tooltip on hover, ←/→ keyboard exploration, monthly table.
   */
  import { heatLevel, type HeatDay } from '$lib/stats'

  interface Props {
    days: readonly HeatDay[]
    title: string
    less: string
    more: string
    weekdays: readonly string[]
    describe: (day: HeatDay) => string
    tableSummary: string
    tableHeader: [string, string]
  }
  let { days, title, less, more, weekdays, describe, tableSummary, tableHeader }: Props = $props()

  const CELL = 12
  const GAP = 2
  const STEP = CELL + GAP
  const TOP = 16
  const LEFT = 28

  const offset = $derived(days[0]?.weekday ?? 0)
  const weeks = $derived(Math.ceil((days.length + offset) / 7))
  const width = $derived(LEFT + weeks * STEP)
  const height = TOP + 7 * STEP
  const max = $derived(Math.max(0, ...days.map((d) => d.count)))
  const pos = (i: number) => ({ col: Math.floor((i + offset) / 7), row: (i + offset) % 7 })

  const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
  const monthYearFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
  const dateOf = (key: string) => {
    const [y = 0, m = 1, d = 1] = key.split('-').map(Number)
    return new Date(y, m - 1, d, 12)
  }
  const months = $derived(
    days.flatMap((d, i) =>
      d.key.endsWith('-01') ? [{ col: pos(i).col, label: monthFmt.format(dateOf(d.key)) }] : [],
    ),
  )
  // Days are in order: consecutive days of a month are summed into one row.
  const monthly = $derived(
    days.reduce<{ key: string; label: string; count: number }[]>((out, d) => {
      const key = d.key.slice(0, 7)
      const last = out[out.length - 1]
      if (last && last.key === key) last.count += d.count
      else out.push({ key, label: monthYearFmt.format(dateOf(`${key}-01`)), count: d.count })
      return out
    }, []),
  )

  let active = $state<number | null>(null)
  let scroller: HTMLDivElement | undefined = $state()

  // Most recent weeks first in view on narrow screens.
  $effect(() => {
    void width
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })

  function onKey(e: KeyboardEvent) {
    const last = days.length - 1
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowUp: -1,
    }
    if (e.key in moves) {
      e.preventDefault()
      const step = (moves[e.key] ?? 0) * (e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? 7 : 1)
      active = Math.min(last, Math.max(0, (active ?? last) + step))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      active = e.key === 'Home' ? 0 : last
    } else if (e.key === 'Escape') active = null
  }

  /** Pointer position → day (each cell and its gap is the hover target). */
  function onPointer(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    const box = e.currentTarget.getBoundingClientRect()
    const col = Math.floor((e.clientX - box.left - LEFT) / STEP)
    const row = Math.floor((e.clientY - box.top - TOP) / STEP)
    const i = col * 7 + row - offset
    active = col >= 0 && row >= 0 && row < 7 && i >= 0 && i < days.length ? i : null
  }

  const current = $derived(active ?? days.length - 1)
  const currentDay = $derived(days[current])
  const fmt = new Intl.NumberFormat('fr-FR')
</script>

<figure class="heatmap">
  <figcaption class="visually-hidden">{title}</figcaption>
  <div class="scroller" bind:this={scroller}>
    <div
      class="plot"
      style:width={`${width}px`}
      role="slider"
      aria-label={title}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, days.length - 1)}
      aria-valuenow={current}
      aria-valuetext={currentDay ? describe(currentDay) : ''}
      tabindex="0"
      onkeydown={onKey}
      onblur={() => (active = null)}
      onpointermove={onPointer}
      onpointerleave={() => (active = null)}
    >
      <svg {width} {height} aria-hidden="true">
        {#each months as m (m.col + m.label)}
          <text class="axis" x={LEFT + m.col * STEP} y={10}>{m.label}</text>
        {/each}
        {#each [0, 2, 4] as row (row)}
          <text class="axis" x={0} y={TOP + row * STEP + CELL - 2}>{weekdays[row]}</text>
        {/each}
        {#each days as day, i (day.key)}
          {@const p = pos(i)}
          <rect
            class="cell level-{heatLevel(day.count, max)}"
            class:active={active === i}
            x={LEFT + p.col * STEP}
            y={TOP + p.row * STEP}
            width={CELL}
            height={CELL}
            rx="2"
          />
        {/each}
      </svg>
      {#if active !== null}
        {@const p = pos(active)}
        {@const day = days[active]}
        {#if day}
          <div
            class="tooltip"
            style:left={`${LEFT + p.col * STEP + CELL / 2}px`}
            style:top={`${TOP + p.row * STEP}px`}
          >
            {describe(day)}
          </div>
        {/if}
      {/if}
    </div>
  </div>
  <div class="legend small" aria-hidden="true">
    <span>{less}</span>
    {#each [0, 1, 2, 3, 4] as level (level)}<span class="swatch level-{level}"></span>{/each}
    <span>{more}</span>
  </div>
  <details class="table-view small">
    <summary>{tableSummary}</summary>
    <table>
      <thead>
        <tr><th scope="col">{tableHeader[0]}</th><th scope="col">{tableHeader[1]}</th></tr>
      </thead>
      <tbody>
        {#each monthly as m (m.key)}
          <tr><td>{m.label}</td><td class="tabular">{fmt.format(m.count)}</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .heatmap {
    margin: 0;
  }

  .scroller {
    overflow-x: auto;
    padding-top: 2.5rem;
    margin-top: -2.5rem;
  }

  .plot {
    position: relative;
    border-radius: var(--radius);
  }

  svg {
    display: block;
  }

  .axis {
    fill: var(--text-2);
    font-size: 10px;
  }

  .cell.active {
    stroke: var(--text);
    stroke-width: 2;
  }

  .level-0 {
    fill: var(--heat-0);
    background: var(--heat-0);
  }

  .level-1 {
    fill: var(--heat-1);
    background: var(--heat-1);
  }

  .level-2 {
    fill: var(--heat-2);
    background: var(--heat-2);
  }

  .level-3 {
    fill: var(--heat-3);
    background: var(--heat-3);
  }

  .level-4 {
    fill: var(--heat-4);
    background: var(--heat-4);
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    color: var(--text-2);
    margin-top: var(--space-1);
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .tooltip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 6px));
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
