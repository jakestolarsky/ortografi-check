// Adapter from engine protocol v1 messages (contracts/v1/protocol.schema.json) to the
// scorer's engine-result line (FORMAT.md "Engine result line"). See FORMAT.md
// "Protocol v1 input". The schema is read at load time so the enums stay in sync.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'contracts', 'v1', 'protocol.schema.json');
const defs = JSON.parse(readFileSync(schemaPath, 'utf8')).$defs;

/** Request ids for corpus checks are `corpus-<example id>` (contracts/tools/build-examples.mjs). */
export const CORPUS_ID_PREFIX = 'corpus-';
export const V1_CATEGORIES = defs.Issue.properties.category.enum;
export const V1_ERROR_CODES = defs.ErrorMessage.properties.code.enum;
const V1_TYPES = ['ready', 'check', 'result', 'error', 'shutdown'];

const isInt = (x) => Number.isInteger(x);
const isVer = (x) => isInt(x) && x >= 0;
const isStr = (x) => typeof x === 'string';

/** A line is a v1 protocol message when it has `protocol` and no corpus `schema_version`. */
export function isV1Message(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && 'protocol' in v && !('schema_version' in v);
}

/** Corpus example id for a v1 request id: strip `corpus-`; ids without it are used as-is. */
export function corpusIdFromRequestId(id) {
  return isStr(id) && id.startsWith(CORPUS_ID_PREFIX) ? id.slice(CORPUS_ID_PREFIX.length) : id;
}

function checkShape(obj, def, where) {
  const errors = [];
  for (const k of def.required) if (!(k in obj)) errors.push(`${where}missing required field ${k}`);
  for (const k of Object.keys(obj)) if (!(k in def.properties)) errors.push(`${where}unknown field ${k} (v1 rejects unknown fields)`);
  return errors;
}

/** Schema checks for one v1 message (subset of the JSON Schema that matters here). */
export function validateV1Message(m) {
  if (m.protocol !== 1) return [`unsupported protocol ${JSON.stringify(m.protocol)} (expected 1)`];
  if (!V1_TYPES.includes(m.type)) return [`unknown v1 message type ${JSON.stringify(m.type)}`];
  const def = { ready: defs.Ready, check: defs.CheckRequest, result: defs.CheckResult, error: defs.ErrorMessage, shutdown: defs.Shutdown }[m.type];
  const errors = checkShape(m, def, '');
  if (m.type === 'result') {
    if ('id' in m && !isStr(m.id)) errors.push('id must be a string');
    for (const k of ['docVersion', 'settingsVersion']) if (k in m && !isVer(m[k])) errors.push(`${k} must be a non-negative integer`);
    if ('engineVersion' in m && !isStr(m.engineVersion)) errors.push('engineVersion must be a string');
    if ('status' in m && m.status !== 'complete') errors.push('status must be "complete" (incomplete analyses are errors in v1)');
    if ('analysisMs' in m && !(typeof m.analysisMs === 'number' && m.analysisMs >= 0)) errors.push('analysisMs must be a non-negative number');
    if ('issues' in m && !Array.isArray(m.issues)) errors.push('issues must be an array');
    else (m.issues ?? []).forEach((iss, n) => {
      const p = `issues[${n}]: `;
      if (iss === null || typeof iss !== 'object' || Array.isArray(iss)) return errors.push(`${p}not an object`);
      errors.push(...checkShape(iss, defs.Issue, p));
      if (!isVer(iss.start) || !isVer(iss.end)) errors.push(`${p}start/end must be non-negative integers`);
      if ('category' in iss && !V1_CATEGORIES.includes(iss.category)) errors.push(`${p}category must be one of ${V1_CATEGORIES.join(', ')}`);
      for (const k of ['ruleId', 'engineCategory', 'issueType', 'message']) if (k in iss && !isStr(iss[k])) errors.push(`${p}${k} must be a string`);
      if ('replacements' in iss && !(Array.isArray(iss.replacements) && iss.replacements.every(isStr))) errors.push(`${p}replacements must be an array of strings`);
    });
  } else if (m.type === 'error') {
    if ('id' in m && !(m.id === null || isStr(m.id))) errors.push('id must be a string or null');
    if ('code' in m && !V1_ERROR_CODES.includes(m.code)) errors.push(`unknown error code ${JSON.stringify(m.code)}`);
    if (('docVersion' in m) !== ('settingsVersion' in m)) errors.push('docVersion and settingsVersion must appear together');
  }
  return errors;
}

/**
 * Convert one v1 message to a scorer line.
 * Returns { skip: true } for messages with no corpus answer (ready, check, shutdown,
 * error with id null), { errors } for invalid lines, or { value } (legacy shape).
 */
export function fromV1Message(m) {
  const errors = validateV1Message(m);
  if (errors.length) return { errors };
  if (m.type === 'result') {
    return {
      value: {
        schema_version: '1.0', id: corpusIdFromRequestId(m.id), status: 'complete', engine: m.engineVersion, protocol_v1: true,
        issues: m.issues.map((i) => ({ start: i.start, end: i.end, category: i.category, rule_id: i.ruleId, message: i.message, replacements: i.replacements })),
      },
    };
  }
  if (m.type === 'error' && m.id !== null) {
    return { value: { schema_version: '1.0', id: corpusIdFromRequestId(m.id), status: 'error', engine_error: m.code, protocol_v1: true, issues: [] } };
  }
  return { skip: true };
}

/**
 * Normalise parsed result-file entries ({ line, value }) so legacy and v1 lines can be
 * mixed. Returns entries { line, value, errors, v1 }; skipped v1 messages are dropped.
 */
export function normalizeResultEntries(entries) {
  const out = [];
  for (const { line, value } of entries) {
    if (!isV1Message(value)) { out.push({ line, value, errors: [], v1: false }); continue; }
    const r = fromV1Message(value);
    if (r.skip) continue;
    out.push({ line, value: r.value ?? null, errors: r.errors ?? [], v1: true, rawId: value.id });
  }
  return out;
}

