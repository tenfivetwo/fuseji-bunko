// KANJIDIC2 から、漢字ごとの読み（音読み・訓読み）だけを取り出して kanji.js を作る
//
//   node tools/build-kanji.js <kanjidic2.xml.gz のパス>
//
// 元データ: KANJIDIC2（Electronic Dictionary Research and Development Group, CC BY-SA 4.0）
//   https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
// JIS 第1・第2水準の漢字（パソコンでふつうに変換して出る字）と、常用漢字・人名用漢字を残す。
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const src = process.argv[2];
if (!src) { console.error('使い方: node tools/build-kanji.js <kanjidic2.xml.gz>'); process.exit(1); }

const buf = fs.readFileSync(src);
const xml = (src.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8');

const out = {};
let count = 0;
for (const m of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
  const block = m[1];
  const literal = (block.match(/<literal>(.+?)<\/literal>/) || [])[1];
  if (!literal) continue;
  if (!/<grade>|<freq>|cp_type="jis208"/.test(block)) continue;
  const readings = [...block.matchAll(/<reading r_type="ja_(?:on|kun)">(.+?)<\/reading>/g)]
    .map(r => r[1].replace(/-/g, ''))
    .filter(Boolean);
  if (!readings.length) continue;
  out[literal] = [...new Set(readings)].join(' ');
  count++;
}

const header = `// 漢字の読み（自動生成。手で直さない。作り直すときは tools/build-kanji.js）
// 元データ: KANJIDIC2 — Electronic Dictionary Research and Development Group, CC BY-SA 4.0
//   https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
// 音読みはカタカナ、訓読みはひらがな。「.」の後ろは送りがな。
`;
const body = 'window.KANJI_YOMI = ' + JSON.stringify(out).replace(/","/g, '",\n"') + ';\n';
const dest = path.join(__dirname, '..', 'kanji.js');
fs.writeFileSync(dest, header + body);
console.log(`${count} 字を書き出しました → ${dest} (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
