// TS types from the schema: the stdin/stdout message union, plus IPC-only $defs that the
// union does not reference (json-schema-to-typescript skips unreachable $defs).
import { readFileSync, writeFileSync } from 'node:fs';
import { compile } from 'json-schema-to-typescript';

const [, , input, output] = process.argv;
const schema = JSON.parse(readFileSync(input, 'utf8'));
const opts = { additionalProperties: false, cwd: process.cwd() };
let out = await compile(schema, 'Protocol', opts);
for (const name of ['EngineStatus', 'EngineVersions']) {
  out += '\n' + (await compile({ ...schema.$defs[name], title: name }, name, { ...opts, bannerComment: '' }));
}
writeFileSync(output, out);
