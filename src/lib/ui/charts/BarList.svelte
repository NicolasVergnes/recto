<script lang="ts">
  /**
   * Horizontal bars as a real table (label · bar · value): one series in the accent colour,
   * values always written, so nothing depends on colour or hover.
   */
  interface Props {
    rows: readonly { label: string; value: number }[]
    caption: string
    header: [string, string]
  }
  let { rows, caption, header }: Props = $props()
  const max = $derived(Math.max(1, ...rows.map((r) => r.value)))
  const fmt = new Intl.NumberFormat('fr-FR')
</script>

<table class="bars">
  <caption class="visually-hidden">{caption}</caption>
  <thead class="visually-hidden">
    <tr><th scope="col">{header[0]}</th><th scope="col">{header[1]}</th></tr>
  </thead>
  <tbody>
    {#each rows as row (row.label)}
      <tr>
        <th scope="row">{row.label}</th>
        <td>
          <span class="track" aria-hidden="true">
            {#if row.value > 0}<span class="bar" style:width={`${(row.value / max) * 100}%`}
              ></span>{/if}
          </span>
          <span class="value tabular">{fmt.format(row.value)}</span>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .bars th {
    width: 9rem;
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    font-weight: 400;
    text-align: left;
    color: var(--text-2);
    white-space: nowrap;
  }

  .bars td {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }

  .track {
    flex: 1;
    height: 12px;
  }

  .bar {
    display: block;
    height: 100%;
    min-width: 4px;
    background: var(--accent);
    border-radius: 0 4px 4px 0;
  }

  .value {
    min-width: 4ch;
    text-align: right;
  }
</style>
