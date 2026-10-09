<script lang="ts">
  import { onMount } from 'svelte';
  import { appTitle } from '$lib/app-info';
  import { CheckSession, type CheckState } from '$lib/checking/session';
  import type { Engine } from '$lib/checking/engine';
  import { createProseEditor, type ProseEditor } from '$lib/editor/prose-editor';

  let host: HTMLDivElement;
  let state: CheckState | undefined = $state();

  onMount(() => {
    let editor: ProseEditor | undefined;
    let unsub = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      // Real engine IPC arrives with the Rust engine module; until then only `vite dev` checks text.
      const engine: Engine | null = import.meta.env.DEV
        ? new (await import('$lib/checking/fake-engine')).FakeEngine()
        : null;
      if (!engine) return;
      const session = new CheckSession(engine, '');
      editor = createProseEditor({ parent: host, session });
      editor.view.focus();
      let lastVersion = session.version;
      unsub = session.subscribe((s) => {
        state = s;
        if (session.version !== lastVersion && session.text.length <= 20000) {
          lastVersion = session.version;
          clearTimeout(timer);
          timer = setTimeout(() => session.check(), 700); // PLAN s.4 auto-check delay
        }
      });
    })();
    return () => { clearTimeout(timer); unsub(); editor?.destroy(); };
  });
</script>

<main>
  <h1>{appTitle}</h1>
  <p>Wklej tekst, aby go sprawdzić.</p>
  <div bind:this={host} class="editor"></div>
  <p role="status" aria-live="polite">
    {#if state?.status === 'checking'}Sprawdzanie…
    {:else if state?.status === 'complete'}{state.issues.length === 0 ? 'Nie znaleziono błędów' : `Problemy: ${state.issues.length}`}
    {:else if state?.status === 'incomplete'}Analiza przerwana
    {/if}
  </p>
</main>
