// Shared helpers for the Polish quality corpus (format v1). No dependencies.
// All offsets are UTF-16 code units; JS strings use the same layout.
import { readFileSync } from 'node:fs';

export const SUPPORTED_MAJOR = 1;
export const CATEGORIES = ['spelling', 'punctuation', 'grammar'];
export const SPLITS = ['dev', 'heldout'];
export const REVIEW_STATUSES = ['unreviewed', 'verified', 'disputed'];
export const RESULT_STATUSES = ['complete', 'incomplete', 'error'];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_RE = /^(\d+)\.(\d+)$/;
const COMBINING_RE = /^\p{M}$/u;

/** Parse a JSONL file into [{line, value}] or throw with the line number. */
export function readJsonl(path) {
  return parseJsonl(readFileSync(path, 'utf8'), path);
}

export function parseJsonl(content, label = '<input>') {
  const out = [];
  const lines = content.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') return;
    try {
      out.push({ line: i + 1, value: JSON.parse(line) });
    } catch (e) {
      throw new Error(`${label}:${i + 1}: invalid JSON (${e.message})`);
    }
  });
  return out;
}

/** Replace [start, end) of text with replacement. */
export function applyEdit(text, start, end, replacement) {
  return text.slice(0, start) + replacement + text.slice(end);
}

/** Apply the first fix of every required issue that has fixes (right to left). */
export function computeCorrectedText(example) {
  const edits = example.issues
    .filter((i) => i.required !== false && i.fixes.length > 0)
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let t = example.text;
  for (const i of edits) t = applyEdit(t, i.start, i.end, i.fixes[0]);
  return t;
}

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;

/** True when offset lies between a high and a low surrogate. */
export function splitsSurrogatePair(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  return isHigh(text.charCodeAt(offset - 1)) && isLow(text.charCodeAt(offset));
}

/** True when the code point at offset is a combining mark (offset splits base+mark). */
export function splitsCombiningMark(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const cp = text.codePointAt(offset);
  return COMBINING_RE.test(String.fromCodePoint(cp));
}

export function checkVersion(v) {
  if (typeof v !== 'string') return 'schema_version must be a string like "1.0"';
  const m = VERSION_RE.exec(v);
  if (!m) return `schema_version "${v}" is not MAJOR.MINOR`;
  if (Number(m[1]) !== SUPPORTED_MAJOR) return `unsupported schema_version major ${m[1]} (supported: ${SUPPORTED_MAJOR})`;
  return null;
}

const isInt = (n) => Number.isInteger(n);
const isStrArr = (a) => Array.isArray(a) && a.every((s) => typeof s === 'string');
const ALLOWED_EXAMPLE_KEYS = new Set([
  'schema_version', 'id', 'text', 'text_utf16_length', 'issues', 'corrected_text', 'tags', 'split',
  'release_critical', 'needs_human_review', 'review_status', 'source', 'notes',
]);
const ALLOWED_ISSUE_KEYS = new Set(['start', 'end', 'original', 'category', 'subcategory', 'fixes', 'required', 'notes']);

/** Validate one corpus example. Returns {errors: string[], warnings: string[]}. */
export function validateExample(ex) {
  const errors = [];
  const warnings = [];
  if (ex === null || typeof ex !== 'object' || Array.isArray(ex)) return { errors: ['line is not a JSON object'], warnings };
  for (const k of Object.keys(ex)) if (!ALLOWED_EXAMPLE_KEYS.has(k)) errors.push(`unknown field "${k}"`);
  const vErr = checkVersion(ex.schema_version);
  if (vErr) errors.push(vErr);
  if (typeof ex.id !== 'string' || !ID_RE.test(ex.id)) errors.push(`invalid id ${JSON.stringify(ex.id)}`);
  if (typeof ex.text !== 'string') {
    errors.push('text must be a string');
    return { errors, warnings };
  }
  if (ex.text.length === 0) errors.push('text is empty');
  if (ex.text_utf16_length !== ex.text.length) {
    errors.push(`text_utf16_length ${ex.text_utf16_length} != actual UTF-16 length ${ex.text.length}`);
  }
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(ex.text)) {
    errors.push('text contains a lone surrogate');
  }
  if (!Array.isArray(ex.issues)) {
    errors.push('issues must be an array');
    return { errors, warnings };
  }
  if (!isStrArr(ex.tags)) errors.push('tags must be an array of strings');
  if (!SPLITS.includes(ex.split)) errors.push(`split must be one of ${SPLITS.join(', ')}`);
  for (const f of ['release_critical', 'needs_human_review']) if (typeof ex[f] !== 'boolean') errors.push(`${f} must be boolean`);
  if (!REVIEW_STATUSES.includes(ex.review_status)) errors.push(`review_status must be one of ${REVIEW_STATUSES.join(', ')}`);
  if (typeof ex.source !== 'string' || ex.source === '') errors.push('source must be a non-empty string');
  if (ex.notes !== undefined && typeof ex.notes !== 'string') errors.push('notes must be a string');

  ex.issues.forEach((iss, n) => {
    const p = `issues[${n}]`;
    if (iss === null || typeof iss !== 'object') return errors.push(`${p} is not an object`);
    for (const k of Object.keys(iss)) if (!ALLOWED_ISSUE_KEYS.has(k)) errors.push(`${p}: unknown field "${k}"`);
    const { start, end } = iss;
    if (!isInt(start) || !isInt(end)) return errors.push(`${p}: start/end must be integers`);
    if (start < 0 || end < start || end > ex.text.length) {
      return errors.push(`${p}: range [${start}, ${end}) out of bounds for UTF-16 length ${ex.text.length}`);
    }
    for (const o of [start, end]) {
      if (splitsSurrogatePair(ex.text, o)) errors.push(`${p}: offset ${o} splits a surrogate pair`);
      else if (splitsCombiningMark(ex.text, o)) warnings.push(`${p}: offset ${o} separates a base letter from a combining mark`);
    }
    const actual = ex.text.slice(start, end);
    if (iss.original !== actual) {
      errors.push(`${p}: original ${JSON.stringify(iss.original)} != text.slice(${start}, ${end}) ${JSON.stringify(actual)}`);
    }
    if (!CATEGORIES.includes(iss.category)) errors.push(`${p}: category must be one of ${CATEGORIES.join(', ')}`);
    if (typeof iss.subcategory !== 'string' || !iss.subcategory.startsWith(`${iss.category}.`)) {
      errors.push(`${p}: subcategory must start with "${iss.category}."`);
    }
    if (!isStrArr(iss.fixes)) errors.push(`${p}: fixes must be an array of strings`);
    else {
      if (new Set(iss.fixes).size !== iss.fixes.length) errors.push(`${p}: duplicate fixes`);
      if (iss.fixes.includes(actual)) errors.push(`${p}: a fix equals the original text (no-op)`);
      if (start === end && iss.fixes.includes('')) errors.push(`${p}: empty fix on a zero-length range is a no-op`);
    }
    if (typeof iss.required !== 'boolean') errors.push(`${p}: required must be boolean`);
    if (iss.notes !== undefined && typeof iss.notes !== 'string') errors.push(`${p}: notes must be a string`);
  });
  if (errors.length) return { errors, warnings };

  const sorted = [...ex.issues].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const overlap = b.start < a.end || (a.start === a.end && b.start === b.end && a.start === b.start);
    if (overlap) errors.push(`issues [${a.start},${a.end}) and [${b.start},${b.end}) overlap`);
  }
  const needsCorrected = ex.issues.some((i) => i.required && i.fixes.length > 0);
  if (needsCorrected || ex.corrected_text !== undefined) {
    const expected = computeCorrectedText(ex);
    if (ex.corrected_text === undefined) errors.push('corrected_text is required when a required issue has fixes');
    else if (ex.corrected_text !== expected) {
      errors.push(`corrected_text mismatch: expected ${JSON.stringify(expected)}`);
    }
  }
  if (ex.release_critical && ex.needs_human_review && ex.review_status !== 'verified') {
    warnings.push('release_critical example still needs human review');
  }
  return { errors, warnings };
}

/** Validate a whole corpus ([{line, value}]). Adds cross-example checks (unique ids). */
export function validateCorpus(entries, label = '<corpus>') {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  for (const { line, value } of entries) {
    const r = validateExample(value);
    const where = `${label}:${line}${value && value.id ? ` (${value.id})` : ''}`;
    r.errors.forEach((e) => errors.push(`${where}: ${e}`));
    r.warnings.forEach((w) => warnings.push(`${where}: ${w}`));
    if (value && typeof value.id === 'string') {
      if (seen.has(value.id)) errors.push(`${where}: duplicate id (first at line ${seen.get(value.id)})`);
      else seen.set(value.id, line);
    }
  }
  return { errors, warnings };
}

/** Validate one engine result line against the corpus example it refers to. */
export function validateEngineResult(res, example) {
  const errors = [];
  if (res === null || typeof res !== 'object' || Array.isArray(res)) return ['line is not a JSON object'];
  const vErr = checkVersion(res.schema_version);
  if (vErr) errors.push(vErr);
  if (typeof res.id !== 'string') errors.push('id must be a string');
  if (!RESULT_STATUSES.includes(res.status)) errors.push(`status must be one of ${RESULT_STATUSES.join(', ')}`);
  if (!Array.isArray(res.issues)) return [...errors, 'issues must be an array'];
  const len = example ? example.text.length : Infinity;
  res.issues.forEach((iss, n) => {
    const p = `issues[${n}]`;
    if (iss === null || typeof iss !== 'object') return errors.push(`${p} is not an object`);
    if (!isInt(iss.start) || !isInt(iss.end)) return errors.push(`${p}: start/end must be integers`);
    if (iss.start < 0 || iss.end < iss.start || iss.end > len) {
      return errors.push(`${p}: range [${iss.start}, ${iss.end}) out of bounds for UTF-16 length ${len}`);
    }
    if (example) for (const o of [iss.start, iss.end]) if (splitsSurrogatePair(example.text, o)) errors.push(`${p}: offset ${o} splits a surrogate pair`);
    if (iss.category !== undefined && typeof iss.category !== 'string') errors.push(`${p}: category must be a string`);
    if (iss.replacements !== undefined && !isStrArr(iss.replacements)) errors.push(`${p}: replacements must be an array of strings`);
  });
  return errors;
}
