// Mirrors contracts/v1/protocol.schema.json (draft). Replace with generated types once the
// schema is agreed and a generator is wired into CI (PLAN.md s.9).
export const PROTOCOL = 1 as const;

export type Category = 'spelling' | 'punctuation' | 'grammar' | 'style' | 'other';

export interface CheckRequest {
  protocol: 1;
  type: 'check';
  id: string;
  docVersion: number;
  settingsVersion: number;
  text: string;
}

export interface Issue {
  /** UTF-16 code units, end exclusive. Zero-length = insertion point (e.g. missing comma). */
  start: number;
  end: number;
  ruleId: string;
  category: Category;
  engineCategory: string;
  issueType: string;
  message: string;
  replacements: string[];
}

export interface CheckResult {
  protocol: 1;
  type: 'result';
  id: string;
  docVersion: number;
  settingsVersion: number;
  engineVersion: string;
  status: 'complete';
  analysisMs?: number;
  issues: Issue[];
}

export type ErrorCode =
  | 'MALFORMED_REQUEST'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNKNOWN_TYPE'
  | 'TEXT_TOO_LONG'
  | 'ENGINE_ERROR'
  | 'TIMEOUT'
  | 'ENGINE_UNAVAILABLE';

export interface ErrorMessage {
  protocol: 1;
  type: 'error';
  id: string | null;
  /** Present (with settingsVersion) when the error answers a `check`: echoes that check's versions. */
  docVersion?: number;
  settingsVersion?: number;
  code: ErrorCode;
  detail: string;
  limit?: number;
  length?: number;
}

export type CheckResponse = CheckResult | ErrorMessage;

/** What the UI needs from the engine boundary (Tauri IPC in the app, a fake in tests). */
export interface Engine {
  check(req: CheckRequest): Promise<CheckResponse>;
}
