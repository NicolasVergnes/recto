<script lang="ts">
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import Icon from '../Icon.svelte'

  interface Props {
    onrecorded: (file: File) => void
  }
  let { onrecorded }: Props = $props()

  let recorder: MediaRecorder | null = $state(null)
  let seconds = $state(0)
  let timer: ReturnType<typeof setInterval> | undefined

  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = () => {
        for (const track of stream.getTracks()) track.stop()
        clearInterval(timer)
        const type = (rec.mimeType || 'audio/webm').split(';')[0] ?? 'audio/webm'
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
        onrecorded(new File([new Blob(chunks, { type })], `enregistrement.${ext}`, { type }))
        recorder = null
      }
      seconds = 0
      timer = setInterval(() => seconds++, 1000)
      rec.start()
      recorder = rec
    } catch {
      toast(t('editor.micDenied'), 'error')
    }
  }

  function stop() {
    recorder?.stop()
  }

  $effect(() => () => {
    clearInterval(timer)
    if (recorder?.state === 'recording') recorder.stop()
  })
</script>

{#if supported}
  {#if recorder}
    <button class="btn btn-sm btn-danger" type="button" onclick={stop}>
      <Icon name="mic" />
      {t('editor.stopRecording', { s: seconds })}
    </button>
  {:else}
    <button class="btn btn-sm" type="button" onclick={start}>
      <Icon name="mic" />
      {t('editor.record')}
    </button>
  {/if}
{/if}
