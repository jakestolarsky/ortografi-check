import type { CheckRequest, CheckResult, ErrorMessage } from '$lib/protocol';

// Protocol types are generated from contracts/v1/protocol.schema.json (see $lib/protocol).
export const PROTOCOL = 1 as const;
export type CheckResponse = CheckResult | ErrorMessage;
export type ErrorCode = ErrorMessage['code'];

/** What the UI needs from the engine boundary (Tauri IPC in the app, a fake in tests/dev). */
export interface Engine {
  check(req: CheckRequest): Promise<CheckResponse>;
}
