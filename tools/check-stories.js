// 物語データ（stories.js）の点検
//
//   node tools/check-stories.js
//
// - 言葉の伏字に、ひらがなだけの別解（読み）があるか … ないと「読みが同じなら○」が効かない
// - 漢字の正解を、辞書で読みのどれかに読めるか   … 読めないときは辞書にない読み（熟字訓など）
// - 選択肢のダミーの数（Lv.1 は2つ、Lv.2 は3つ）
// - 句・文の伏字で、見本の文が鍵語の組をすべて満たしているか
'use strict';
global.window = {};
require('../stories.js');
const fs = require('fs');
const path = require('path');
const shortsDir = path.join(__dirname, '..', 'shorts');
const shorts2Dir = path.join(__dirname, '..', 'shorts2');
for (const dir of [shortsDir, shorts2Dir]) {
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) require(path.join(dir, f));
}
require('../kanji.js');
require('../yomi.js');
const Yomi = window.Yomi;

const norm = s => String(s).normalize('NFKC')
  .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s、。，．,.!?！？「」『』（）()…・〜~]/g, '')
  .toLowerCase();
const isKana = s => /^[ぁ-ゖー]+$/.test(s);
const hasKanji = s => /[㐀-鿿々]/.test(s);
const re = /\[\[([\s\S]+?)\]\]|\[([^\[\]]+?)\]/g;

let problems = 0;
const answerCount = {}; // 同じ答えが何度も出ていないかを見るため
const warn = (where, msg) => { problems++; console.log(`  ${where}: ${msg}`); };

const all = [...window.STORIES];
const shorts = [...(window.SHORTS || []), ...(window.SHORTS2 || [])];
if (shorts.length) {
  all.push({ title: `ひとページ文庫（${shorts.length}話）`, pages: [...shorts].sort((a, b) => a.level - b.level) });
  const byLv = {};
  shorts.forEach(pg => { byLv[pg.level] = (byLv[pg.level] || 0) + 1; });
  console.log('短編の数（難易度ごと）:', JSON.stringify(byLv));
  const titles = shorts.map(pg => pg.title);
  titles.filter((t, i) => titles.indexOf(t) !== i).forEach(t => { problems++; console.log(`  題名が重複: ${t}`); });
}

for (const st of all) {
  console.log(`== ${st.title}`);
  st.pages.forEach((pg, pi) => {
    const where = `${pi + 1}ページ目「${pg.title}」`;
    let m;
    while ((m = re.exec(pg.text))) {
      if (m[1] !== undefined) {
        const [model, kw = ''] = m[1].split('|');
        if (pg.level === 5 && model.length > 12) warn(where, `Lv.5 の見本「${model}」が${model.length}文字（12文字以下にする）`);
        if (!kw) warn(where, `見本「${model}」に鍵語がない`);
        if (pg.level < 5) warn(where, `Lv.${pg.level} に句・文の伏字がある`);
        kw.split(';').map(g => g.split(',')).forEach(g => {
          g.filter(k => /^[ぁ-ゖ]$/.test(k)).forEach(k => warn(where, `鍵語「${k}」は1文字のかなで、何にでも当たってしまう`));
          if (!g.some(k => norm(model).includes(norm(k)))) warn(where, `見本「${model}」が鍵語の組 [${g.join(',')}] を満たしていない`);
        });
        continue;
      }
      if (pg.level >= 5) warn(where, `Lv.${pg.level} に言葉の伏字 [${m[2]}] がある（句・文の伏字にする）`);
      const [ans, dum = ''] = m[2].split('|');
      const answers = ans.split('/').filter(Boolean);
      answerCount[answers[0]] = (answerCount[answers[0]] || 0) + 1;
      const readings = answers.map(norm).filter(isKana);
      if (!readings.length) warn(where, `[${ans}] にひらがなの読みがない`);
      for (const a of answers.filter(a => hasKanji(a) && !/[0-9０-９]/.test(a))) {
        if (readings.length && !readings.some(r => Yomi.canRead(norm(a), r))) {
          warn(where, `「${a}」を辞書で ${readings.join('/')} と読めない（読みを足すか、そのままでも可）`);
        }
      }
      if (pg.level <= 2) {
        const need = pg.level === 1 ? 2 : 3;
        const n = dum.split('/').filter(Boolean).length;
        if (n !== need) warn(where, `[${ans}] のダミーが ${n} 個（Lv.${pg.level} は ${need} 個）`);
      }
    }
  });
}
const often = Object.entries(answerCount).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
if (often.length) console.log('\n答えによく出る言葉（5回以上）:', often.map(([a, n]) => `${a}×${n}`).join(' '));
console.log(problems ? `\n${problems} 件の注意があります` : '\n問題ありません');
