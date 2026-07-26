import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderPublicCapabilityMatrix } from '../dist/tools/public-capabilities.js';

const beginMarker = '<!-- BEGIN GENERATED CAPABILITY MATRIX -->';
const endMarker = '<!-- END GENERATED CAPABILITY MATRIX -->';
const checkOnly = process.argv.includes('--check');

const documents = [
  {
    path: resolve('README.md'),
    locale: 'en',
    legacyStart: '## Engines',
    legacyEnd: 'All tools are read-only',
  },
  {
    path: resolve('README_zh.md'),
    locale: 'zh',
    legacyStart: '## 搜索引擎',
    legacyEnd: '所有工具均为只读',
  },
];

function replaceGeneratedSection(source, document) {
  const generated = `${beginMarker}\n${renderPublicCapabilityMatrix(document.locale)}${endMarker}\n\n`;
  const markedStart = source.indexOf(beginMarker);
  if (markedStart >= 0) {
    const markedEnd = source.indexOf(endMarker, markedStart);
    if (markedEnd < 0) throw new Error(`${document.path}: missing end marker`);
    return `${source.slice(0, markedStart)}${generated}${source.slice(markedEnd + endMarker.length).replace(/^\r?\n+/, '')}`;
  }

  const legacyStart = source.indexOf(document.legacyStart);
  const legacyEnd = source.indexOf(document.legacyEnd, legacyStart);
  if (legacyStart < 0 || legacyEnd < 0) {
    throw new Error(`${document.path}: capability section anchors not found`);
  }
  return `${source.slice(0, legacyStart)}${generated}${source.slice(legacyEnd)}`;
}

let drifted = false;
for (const document of documents) {
  const source = readFileSync(document.path, 'utf8');
  const updated = replaceGeneratedSection(source, document);
  if (updated === source) continue;
  drifted = true;
  if (!checkOnly) writeFileSync(document.path, updated, 'utf8');
}

if (checkOnly && drifted) {
  console.error('Public capability matrix is stale. Run npm run capabilities:generate.');
  process.exitCode = 1;
}
