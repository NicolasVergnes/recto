<script lang="ts" module>
  /** Small inline SVG set (04-UI §4: ≤ 20 icons, no library). Stroke paths on a 24 grid. */
  const paths = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    cards:
      'M5 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM7 4h12a2 2 0 0 1 2 2v10',
    plus: 'M12 5v14M5 12h14',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    chart: 'M5 20v-8M11 20V5M17 20v-5M3 20h18',
    settings: 'M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2M14 4v4M8 10v4M16 16v4',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    edit: 'M4 20h4L19 9l-4-4L4 16v4z',
    flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
    pause: 'M9 5v14M15 5v14',
    archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
    volume: 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
    image:
      'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM21 15l-5-5-9 9M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    close: 'M6 6l12 12M18 6L6 18',
    swap: 'M7 7h13l-4-4M17 17H4l4 4',
  } as const

  export type IconName = keyof typeof paths
</script>

<script lang="ts">
  interface Props {
    name: IconName
    size?: number
  }
  let { name, size = 20 }: Props = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={name === 'more' ? 3 : 1.8}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={paths[name]} />
</svg>
