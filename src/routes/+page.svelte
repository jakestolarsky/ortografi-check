<script lang="ts">
  import { onMount } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { appTitle } from '$lib/app-info';
  import { CheckSession, type CheckState } from '$lib/checking/session';
  import type { Engine } from '$lib/checking/engine';
  import { connectEngine, statusLabel, type StatusSource } from '$lib/checking/engine-status';
  import type { EngineState } from '$lib/checking/tauri-engine';
  import { createProseEditor, type ProseEditor } from '$lib/editor/prose-editor';
  import { CommandRegistry } from '$lib/commands/registry';
  import { registerFixCommand, type EditorCommandContext } from '$lib/editor/fix-command';

  const registry = new CommandRegistry<EditorCommandContext>();
  registerFixCommand(registry);

  let host: HTMLDivElement;
  let checkState: CheckState | undefined = $state();
  let engineState: EngineState | null = $state(null);
  let ctl: ReturnType<typeof connectEngine> | undefined = $state();

  onMount(() => {
    let editor: ProseEditor | undefined;
    const cleanups: (() => void)[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let engine: Engine | null = null;
      if (isTauri()) {
        const { TauriEngine } = await import('$lib/checking/tauri-engine');
        const t = await TauriEngine.start();
        engine = t;
        cleanups.push(t.onStatus((s) => (engineState = s)));
      } else if (import.meta.env.DEV) {
        // `vite dev` in a plain browser: controlled fake engine (never in production builds).
        engine = new (await import('$lib/checking/fake-engine')).FakeEngine();
      }
      if (!engine) return;
      const session = new CheckSession(engine, '');
      if ('retry' in engine) ctl = connectEngine(session, engine as unknown as StatusSource);
      editor = createProseEditor({ parent: host, session, registry });
      editor.view.focus();
      let lastVersion = session.version;
      cleanups.push(session.subscribe((s) => {
        checkState = s;
        if (session.version !== lastVersion && session.text.length <= 20000) {
          lastVersion = session.version;
          clearTimeout(timer);
          timer = setTimeout(() => session.check(), 700); // PLAN s.4 auto-check delay
        }
      }));
    })();
    return () => { clearTimeout(timer); cleanups.forEach((f) => f()); editor?.destroy(); };
  });

  const canRetry = $derived(ctl && (engineState === 'unavailable' || checkState?.status === 'incomplete'));
</script>

<main>
  <h1>{appTitle}</h1>
  <p>Wklej tekst, aby go sprawdzić.</p>
  <div bind:this={host} class="editor"></div>
  <p role="status" aria-live="polite">
    {#if engineState && engineState !== 'ready' && engineState !== 'busy'}{statusLabel(engineState)}
    {:else if checkState?.status === 'checking'}Sprawdzanie…
    {:else if checkState?.status === 'complete'}{checkState.issues.length === 0 ? 'Nie znaleziono błędów' : `Problemy: ${checkState.issues.length}`}
    {:else if checkState?.status === 'incomplete'}Analiza przerwana
    {/if}
  </p>
  {#if canRetry}
    <button type="button" onclick={() => ctl?.retry()}>Spróbuj ponownie</button>
  {/if}
</main>
