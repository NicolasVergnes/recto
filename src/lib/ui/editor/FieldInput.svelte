<script lang="ts">
  import type { AtomicityWarning } from '$lib/domain/text'
  import { t } from '$lib/i18n'

  interface Props {
    id: string
    label: string
    value: string
    warnings?: readonly AtomicityWarning[]
    rows?: number
    required?: boolean
    textarea?: HTMLTextAreaElement | undefined
    onfocus?: () => void
    onfiles?: (files: File[]) => void
  }
  let {
    id,
    label,
    value = $bindable(),
    warnings = [],
    rows = 3,
    required = false,
    textarea = $bindable(),
    onfocus,
    onfiles,
  }: Props = $props()

  function filesOf(list: FileList | null | undefined): File[] {
    return list ? Array.from(list) : []
  }

  function paste(e: ClipboardEvent) {
    const files = filesOf(e.clipboardData?.files)
    if (files.length > 0 && onfiles) {
      e.preventDefault()
      onfiles(files)
    }
  }

  function drop(e: DragEvent) {
    const files = filesOf(e.dataTransfer?.files)
    if (files.length > 0 && onfiles) {
      e.preventDefault()
      textarea?.focus()
      onfiles(files)
    }
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <textarea
    {id}
    {rows}
    {required}
    bind:value
    bind:this={textarea}
    aria-describedby={warnings.length > 0 ? `${id}-warn` : undefined}
    {onfocus}
    onpaste={paste}
    ondrop={drop}
    ondragover={(e) => e.preventDefault()}></textarea>
  {#if warnings.length > 0}
    <div id={`${id}-warn`} aria-live="polite">
      {#each warnings as w (w)}
        <p class="warning-text">{t(w === 'tooLong' ? 'editor.tooLong' : 'editor.looksLikeList')}</p>
      {/each}
    </div>
  {/if}
</div>
