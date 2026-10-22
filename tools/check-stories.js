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
for (const f of fs.readdirSync(shortsDir).filter(f => f.endsWith('.js')).sort()) require(path.join(shortsDir, f));
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
const warn = (where, msg) => { problems++; console.log(`  ${where}: ${msg}`); };

const all = [...window.STORIES];
if (window.SHORTS && window.SHORTS.length) {
  all.push({ title: `ひとページ百話（${window.SHORTS.length}話）`, pages: [...window.SHORTS].sort((a, b) => a.level - b.level) });
  const byLv = {};
  window.SHORTS.forEach(pg => { byLv[pg.level] = (byLv[pg.level] || 0) + 1; });
  console.log('短編の数（難易度ごと）:', JSON.stringify(byLv));
  const titles = window.SHORTS.map(pg => pg.title);
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
console.log(problems ? `\n${problems} 件の注意があります` : '\n問題ありません');
