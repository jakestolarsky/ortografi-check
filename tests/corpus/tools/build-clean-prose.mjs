#!/usr/bin/env node
// Builds tests/corpus/clean-prose/{wikipedia,wolnelektury}/sentences.jsonl from raw
// downloads (not committed). See ../clean-prose/SOURCES.md for sources and how to fetch.
// Usage: node build-clean-prose.mjs <raw-dir>
//   <raw-dir>/wiki/a*.json  MediaWiki API responses (prop=extracts|revisions|info, formatversion=2)
//   <raw-dir>/*.txt         Wolne Lektury plain-text downloads (https://wolnelektury.pl/media/book/txt/<slug>.txt)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reformFlags } from './reform-2026.mjs';

const ABBR = /(?:^|[\s(])(?:r|w|ok|np|tzw|tj|św|ul|im|prof|dr|gen|ks|p\.n\.e|n\.e|tys|mln|mld|ang|łac|itp|itd|wyd|zm|ur|pl|m\.in|m\.st|al|płk|mjr|hr|zob|por|wg|ds|nr|godz|min|cm|km|kg|ha|woj|pow|gm|ok|ew|jw|ss|s|t|r\.p|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|R|S|T|U|W|Z)\.$/u;
const ALLOWED = /^[\p{Script=Latin}\d\s.,;:!?'’„”"«»()\-–%°&+]+$/u;
const ARCHAIC = [/é/u, /\p{L}(?:rj|tj|lj|nj|gj|fj|mj|kj|bj|pj)[aąęeiouó]/u, /(?<!(?<!\p{L})(?:od|pod|nad|przed|ode|pode|nade|przede|z|ze|roz|bez|wy|po|przy|na|u))dj[aąęeiouó]/iu, /(?<!\p{L})(?:ztąd|zkąd|wogóle|poprostu|napewno|naprzykład|conajmniej|niema|bezemnie|odemnie)(?!\p{L})/iu];
const FOREIGN = /(?<!\p{L})(?:le|la|les|de|du|des|et|est|une|un|mon|ma|monsieur|madame|oui|mais|der|die|das|und|ist|nicht|ich|sie|herr|non|sum|est|cum|ad|the|and|of)(?!\p{L})/u;

export function splitSentences(paragraph) {
  const out = [];
  let cur = '';
  const parts = paragraph.split(/(?<=[.!?…])\s+/u);
  for (const p of parts) {
    cur = cur ? `${cur} ${p}` : p;
    const next = parts[parts.indexOf(p) + 1];
    if (ABBR.test(cur) || (next !== undefined && !/^[„"]?[A-ZĄĆĘŁŃÓŚŹŻ0-9]/u.test(next))) continue;
    out.push(cur.trim());
    cur = '';
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Why a sentence is rejected, or null when it is kept. */
export function rejectReason(s, { literary = false } = {}) {
  const words = s.split(/\s+/u).filter(Boolean);
  if (words.length < 4) return 'short';
  if (words.length > 40 || s.length > 250) return 'long';
  if (!/[\p{L})”][.!?]$/u.test(s) || /\.\.$/.test(s)) return 'end';
  if (/[—]/u.test(s) || /^[-–]/u.test(s)) return 'dialogue';
  if (literary && /[„”"«»]/u.test(s)) return 'dialogue';
  if (!/^[A-ZĄĆĘŁŃÓŚŹŻ]/u.test(s)) return 'start';
  if (!ALLOWED.test(s)) return 'charset';
  if (/\(\s*\)|\(\s*[,;]/u.test(s)) return 'markup';
  if (ARCHAIC.some((re) => re.test(s))) return 'archaic';
  if (FOREIGN.test(s)) return 'foreign';
  return null;
}

const clean = (t) => t.normalize('NFC').replace(/\u00a0/gu, ' ').replace(/[ \t]+/gu, ' ').trim();

function fromWikipedia(rawDir, perArticle) {
  const files = readdirSync(join(rawDir, 'wiki')).filter((f) => /^a\d+\.json$/.test(f)).sort();
  const rows = [];
  for (const f of files) {
    const page = JSON.parse(readFileSync(join(rawDir, 'wiki', f), 'utf8')).query.pages[0];
    const text = page.extract.split(/\n/u).map(clean).filter(Boolean);
    let n = 0;
    for (const para of text) for (const s of splitSentences(para)) {
      if (n >= perArticle || rejectReason(s)) continue;
      rows.push({ text: s, source_title: page.title, author: 'Wikipedia contributors', url: page.fullurl, revision: page.revisions[0].revid,
        permalink: `https://pl.wikipedia.org/w/index.php?oldid=${page.revisions[0].revid}`, license: 'CC BY-SA 4.0' });
      n += 1;
    }
  }
  return rows;
}

function fromWolneLektury(rawDir, perBook) {
  const rows = [];
  for (const f of readdirSync(rawDir).filter((x) => x.endsWith('.txt')).sort()) {
    const raw = readFileSync(join(rawDir, f), 'utf8').replace(/\r\n/gu, '\n');
    const [body] = raw.split(/\n-----\n/u);
    const lines = body.split('\n');
    const author = clean(lines[0]);
    const tom = /tom-pierwszy/.test(f) ? ', tom pierwszy' : /tom-drugi/.test(f) ? ', tom drugi' : '';
    const title = clean(lines[2] ?? '') + tom;
    const edition = clean((raw.match(/Tekst opracowany na podstawie: (.*)/u) ?? [])[1] ?? '');
    const year = Number((edition.match(/(1[89]\d\d|20\d\d)\s*$/u) ?? [])[1]);
    if (!(year >= 1950)) throw new Error(`${f}: edition not post-1950 (${edition})`);
    if (!/Ten utwór jest w domenie publicznej/u.test(raw)) throw new Error(`${f}: not public domain`);
    const paras = body.split(/\n\s*\n/u).slice(1).map((p) => clean(p.replace(/\n/gu, ' '))).filter((p) => p && !/^[—–-]/u.test(p));
    let n = 0;
    for (const para of paras) for (const s of splitSentences(para)) {
      if (n >= perBook || rejectReason(s, { literary: true })) continue;
      rows.push({ text: s, source_title: title, author, url: `https://wolnelektury.pl/katalog/lektura/${f.replace(/\.txt$/, '')}/`,
        edition, license: 'Public domain (Wolne Lektury)' });
      n += 1;
    }
  }
  return rows;
}

function finish(rows, prefix) {
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.text) ? false : seen.add(r.text)))
    .map((r, i) => ({ id: `${prefix}-${String(i + 1).padStart(5, '0')}`, ...r, reform_2026: reformFlags(r.text) }));
}

export function main(argv) {
  const rawDir = argv[0];
  if (!rawDir) throw new Error('usage: build-clean-prose.mjs <raw-dir>');
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'clean-prose');
  const sets = { wikipedia: finish(fromWikipedia(rawDir, 35), 'cp-wp'), wolnelektury: finish(fromWolneLektury(rawDir, 400), 'cp-wl') };
  const all = new Set();
  for (const [dir, rows] of Object.entries(sets)) {
    const kept = rows.filter((r) => (all.has(r.text) ? false : all.add(r.text)));
    mkdirSync(join(out, dir), { recursive: true });
    writeFileSync(join(out, dir, 'sentences.jsonl'), kept.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`${dir}: ${kept.length} sentences`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
