<script lang="ts">
  import {
    addMask,
    moveMask,
    nextMaskGroup,
    rectFromPoints,
    updateMask,
    type Occlusion,
    type Point,
  } from '$lib/domain/occlusion'

  interface Props {
    url: string
    alt: string
    occlusion: Occlusion
    firstGroup: number
    selected: number
    onchange: (next: Occlusion) => void
    onfile: (file: File | undefined) => void
  }
  let {
    url,
    alt,
    occlusion,
    firstGroup,
    selected = $bindable(),
    onchange,
    onfile,
  }: Props = $props()

  let frame: HTMLDivElement | undefined = $state()
  /** Pointer gesture in progress: a new rectangle, or a mask being moved. */
  let gesture = $state<
    | { kind: 'draw'; start: Point; current: Point }
    | { kind: 'move'; index: number; start: Point; current: Point }
    | null
  >(null)

  function point(e: PointerEvent): Point {
    const r = frame?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 }
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    const p = point(e)
    const hit = e.target instanceof Element ? e.target.closest('[data-index]') : null
    const index = hit ? Number(hit.getAttribute('data-index')) : -1
    if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId)
    if (index >= 0) {
      selected = index
      gesture = { kind: 'move', index, start: p, current: p }
    } else gesture = { kind: 'draw', start: p, current: p }
  }

  function onPointerMove(e: PointerEvent) {
    if (gesture) gesture = { ...gesture, current: point(e) }
  }

  function onPointerUp() {
    const g = gesture
    gesture = null
    if (!g) return
    if (g.kind === 'draw') {
      const group = Math.max(nextMaskGroup(occlusion), firstGroup)
      const next = addMask(occlusion, rectFromPoints(g.start, g.current), group)
      if (next === occlusion) return
      onchange(next)
      selected = next.masks.length - 1
    } else {
      const mask = occlusion.masks[g.index]
      if (!mask) return
      const moved = moveMask(mask, g.current.x - g.start.x, g.current.y - g.start.y)
      onchange(updateMask(occlusion, g.index, moved))
    }
  }

  /** Masks as drawn right now, including a move in progress. */
  const drawn = $derived.by(() => {
    const g = gesture
    if (g?.kind !== 'move') return occlusion.masks
    return occlusion.masks.map((m, i) =>
      i === g.index ? moveMask(m, g.current.x - g.start.x, g.current.y - g.start.y) : m,
    )
  })
  const draft = $derived(
    gesture?.kind === 'draw' ? rectFromPoints(gesture.start, gesture.current) : null,
  )
</script>

<div
  class="frame"
  bind:this={frame}
  role="presentation"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={() => (gesture = null)}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault()
    onfile(e.dataTransfer?.files[0])
  }}
>
  <img src={url} {alt} draggable="false" />
  <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {#each drawn as m, i (i)}
      <rect
        x={m.x}
        y={m.y}
        width={m.w}
        height={m.h}
        data-index={i}
        class:selected={i === selected}
      />
    {/each}
    {#if draft}
      <rect class="draft" x={draft.x} y={draft.y} width={draft.w} height={draft.h} />
    {/if}
  </svg>
  {#each drawn as m, i (i)}
    <span class="num" aria-hidden="true" style:left={`${m.x * 100}%`} style:top={`${m.y * 100}%`}
      >{m.n}</span
    >
  {/each}
</div>

<style>
  .frame {
    position: relative;
    display: inline-block;
    align-self: flex-start;
    max-width: 100%;
    line-height: 0;
    touch-action: none;
    cursor: crosshair;
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 60dvh;
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  rect {
    fill: rgb(255 142 142 / 70%);
    stroke: #212121;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    cursor: move;
  }

  rect.selected {
    stroke: var(--focus);
    stroke-width: 3px;
  }

  rect.draft {
    fill: rgb(255 235 162 / 60%);
    stroke-dasharray: 4 3;
  }

  .num {
    position: absolute;
    padding: 0 0.3em;
    font-size: 0.75rem;
    line-height: 1.4;
    color: #fff;
    background: #212121;
    pointer-events: none;
  }
</style>
