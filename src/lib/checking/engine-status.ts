import type { CheckSession } from './session';
import type { EngineState } from './tauri-engine';

const LABELS: Record<EngineState, string> = {
  starting: 'Uruchamianie silnika…',
  ready: 'Silnik gotowy',
  busy: 'Sprawdzanie…',
  restarting: 'Ponowne uruchamianie silnika…',
  unavailable: 'Silnik niedostępny',
};
export const statusLabel = (s: EngineState) => LABELS[s];

export interface StatusSource {
  status: EngineState;
  retry(): Promise<void>;
}

/**
 * Retry policy: no automatic resend when the engine returns to ready (Rust replays its newest
 * waiting check; the in-flight check gets exactly one error). The user retries, or edits.
 */
export function connectEngine(session: CheckSession, engine: StatusSource) {
  const canRetry = () => engine.status === 'unavailable' || session.state.status === 'incomplete';
  return {
    canRetry,
    async retry() {
      if (!canRetry()) return;
      if (engine.status === 'unavailable') await engine.retry();
      void session.check();
    },
  };
}
