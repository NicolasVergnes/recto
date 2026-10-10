<script lang="ts">
  import type { CsvColumn } from '$lib/import/csv'
  import { t } from '$lib/i18n'

  interface Props {
    id: string
    /** The rows to import (header excluded); the first 20 are previewed. */
    rows: readonly (readonly string[])[]
    delimiter: string
    hasHeader: boolean
    ontoggle: (hasHeader: boolean) => void
    mapping: CsvColumn[]
    columns: readonly { value: CsvColumn; label: string }[]
    /** Shown when no column holds the front (or the first field of a custom type). */
    missing: string | null
  }
  let {
    id,
    rows,
    delimiter,
    hasHeader,
    ontoggle,
    mapping = $bindable(),
    columns,
    missing,
  }: Props = $props()

  const width = $derived(mapping.length)
  const preview = $derived(rows.slice(0, 20))
</script>

<p class="small muted">
  {t('csv.detected', {
    n: rows.length,
    sep: delimiter === '\t' ? t('csv.tab') : `« ${delimiter} »`,
  })}
</p>
<label class="check">
  <input type="checkbox" checked={hasHeader} onchange={(e) => ontoggle(e.currentTarget.checked)} />
  {t('csv.header')}
</label>

<div class="table-wrap">
  <table>
    <caption class="visually-hidden">{t('csv.preview')}</caption>
    <thead>
      <tr>
        {#each Array.from({ length: width }, (_, i) => i) as i (i)}
          <th scope="col">
            <label class="visually-hidden" for={`${id}-col-${i}`}
              >{t('csv.column', { n: i + 1 })}</label
            >
            <select id={`${id}-col-${i}`} bind:value={mapping[i]}>
              {#each columns as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
            </select>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each preview as row, r (r)}
        <tr>
          {#each Array.from({ length: width }, (_, i) => i) as i (i)}<td>{row[i] ?? ''}</td>{/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
{#if missing}<p class="error-text" role="alert">{missing}</p>{/if}

<style>
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-height: 22rem;
  }

  th,
  td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
  }

  th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    min-width: 8rem;
  }
</style>
