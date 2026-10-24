'use strict';
(() => {
  // 難易度ごとの遊び方
  const LEVELS = {
    1: { name: 'やさしい', mode: 'choice', desc: '3つの中から選びます' },
    2: { name: 'ふつう', mode: 'choice', desc: '4つの中から選びます。まぎらわしい答えもあります' },
    3: { name: 'ややむずかしい', mode: 'input', lengthHint: true, desc: '自分で書きます。□の数が文字数のヒントです' },
    4: { name: 'むずかしい', mode: 'input', desc: '自分で書きます。文字数のヒントはなく、伏字が増えます' },
    5: { name: 'とてもむずかしい', mode: 'input', desc: '言葉のかたまり（句）を書きます' },
    6: { name: '達人', mode: 'input', desc: '文をまるごと書きます。前後の流れに合っていれば正解です' },
  };
  const STORE_KEY = 'fuseji-bunko-v1';
  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const STORIES = window.STORIES || [];
  // 1ページで終わる短い話（shorts/*.js）は「ひとページ百話」として目次のいちばん上に置く
  const SHORTS = window.SHORTS || [];
  if (SHORTS.length) {
    STORIES.unshift({
      id: 'hyakuwa',
      title: 'ひとページ百話',
      intro: '1ページで終わる短い話。やさしい話から順に並んでいます。同じ難易度を3話こなすと、次の難易度が開きます。',
      collection: true,
      pages: [...SHORTS].sort((a, b) => a.level - b.level),
    });
  }
  const UNLOCK_COUNT = 3;
  const app = document.getElementById('app');
  const sheet = document.getElementById('sheet');
  const reader = document.getElementById('reader');
  const editor = document.getElementById('editor');
  // スマホ（指で操作する端末）では、書く伏字を押すと画面の上に入力窓を出す。?ui=touch で試せる
  const touchUI = () => window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).get('ui') === 'touch';

  const num = i => CIRCLED[i] || `(${i + 1})`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIR_KEY = 'fuseji-bunko-dir';
  let dir = (() => { try { return localStorage.getItem(DIR_KEY) || 'v'; } catch (e) { return 'v'; } })();
  const stars = r => r >= 0.9 ? '★★★' : r >= 0.6 ? '★★☆' : r > 0 ? '★☆☆' : '☆☆☆';

  // ---- 記録（ブラウザ内だけ） ----
  function loadAll() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function saveAll(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { /* 保存できなくても遊べる */ } }
  function getProg(id) { const p = loadAll()[id] || {}; return { reached: p.reached || 0, best: p.best || {} }; }
  function setProg(id, p) { const all = loadAll(); all[id] = p; saveAll(all); }

  // ---- 本文の読み取り ----
  // [正解/別解|ダミー/ダミー] と [[見本|鍵語,鍵語;鍵語]] を伏字に変える
  function parseLine(line, blanks) {
    const parts = [];
    const re = /\[\[([\s\S]+?)\]\]|\[([^\[\]]+?)\]/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push({ t: 'text', v: line.slice(last, m.index) });
      let b;
      if (m[1] !== undefined) {
        const [model, kw = ''] = m[1].split('|');
        b = {
          kind: 'sentence',
          model: model.trim(),
          groups: kw.split(';').map(g => g.split(',').map(s => s.trim()).filter(Boolean)).filter(g => g.length),
        };
      } else {
        const [ans, dum = ''] = m[2].split('|');
        b = {
          kind: 'word',
          answers: ans.split('/').map(s => s.trim()).filter(Boolean),
          dummies: dum.split('/').map(s => s.trim()).filter(Boolean),
        };
      }
      parts.push({ t: 'blank', i: blanks.length });
      blanks.push(b);
      last = re.lastIndex;
    }
    if (last < line.length) parts.push({ t: 'text', v: line.slice(last) });
    return parts;
  }

  function parsePage(text) {
    const blanks = [];
    const paras = text.split('\n').filter(l => l.trim()).map(l => {
      const letter = l.startsWith('>');
      return { letter, parts: parseLine(letter ? l.slice(1).trim() : l, blanks) };
    });
    return { blanks, paras };
  }

  // ---- 判定 ----
  // 全角半角・カタカナひらがな・句読点や空白の違いは気にしない
  function norm(s) {
    return String(s).normalize('NFKC')
      .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/[\s、。，．,.!?！？「」『』（）()…・〜~]/g, '')
      .toLowerCase();
  }
  // 読みで比べる（yomi.js）。漢字の書き方や送りがながちがっても、読みが同じなら○
  const Yomi = window.Yomi && window.Yomi.ready ? window.Yomi : null;
  const isKana = s => /^[ぁ-ゖー]+$/.test(s);

  // 結果は { score: 1|0, yomi: 読みが同じで○にしたときの、その読み }
  function judgeWord(b, v) {
    const n = norm(v);
    if (!n) return { score: 0 };
    if (b.answers.some(a => norm(a) === n)) return { score: 1 };
    const readings = b.answers.map(norm).filter(isKana);
    const hit = Yomi && readings.find(r => Yomi.canRead(n, r));
    if (hit) return { score: 1, yomi: hit };
    return { score: 0 };
  }
  // 鍵語の組がすべて入っていれば○、一部なら△
  // ひらがな3文字以上の鍵語は、読みが同じ部分があれば入っているとみなす
  function keyHit(n, k) {
    const nk = norm(k);
    if (n.includes(nk)) return true;
    return !!Yomi && isKana(nk) && nk.length >= 3 && Yomi.containsReading(n, nk);
  }
  function judgeSentence(b, v) {
    const n = norm(v);
    if (!n) return { score: 0 };
    if (norm(b.model) === n) return { score: 1 };
    const total = b.groups.length;
    if (!total) return { score: 0 };
    const hit = b.groups.filter(g => g.some(k => keyHit(n, k))).length;
    return { score: hit === total ? 1 : hit > 0 ? 0.5 : 0 };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---- 縦書き／横書き ----
  const dirSwitch = () => `<span class="seg" role="group" aria-label="文字の向き"><button class="seg-btn" data-act="dir" data-v="v">縦書き</button><button class="seg-btn" data-act="dir" data-v="h">横書き</button></span>`;
  const scrollHint = '<p class="scroll-hint" hidden>◀ 左へスクロールすると続きがあります</p>';

  function applyDir() {
    document.body.classList.toggle('vertical', dir === 'v');
    document.querySelectorAll('[data-act="dir"]').forEach(b => b.classList.toggle('on', b.dataset.v === dir));
    updateScrollHint();
  }
  // 縦書きで本文がはみ出しているあいだだけ「左へ」の案内を出す
  function updateScrollHint() {
    document.querySelectorAll('.paper').forEach(paper => {
      const hint = paper.nextElementSibling;
      if (!hint || !hint.classList.contains('scroll-hint')) return;
      const more = dir === 'v' && paper.scrollWidth > paper.clientWidth + 2
        && Math.abs(paper.scrollLeft) + paper.clientWidth < paper.scrollWidth - 2;
      hint.hidden = !more;
    });
  }

  // ---- 開いているかどうか ----
  // 物語：読み進めたページまで。短編集：難易度ごとに、1つ下の難易度を UNLOCK_COUNT 話こなすと開く
  const levelsOf = st => [...new Set(st.pages.map(pg => pg.level))].sort((a, b) => a - b);
  const playedAt = (st, p, lv) => Object.keys(p.best).filter(i => st.pages[i] && st.pages[i].level === lv).length;
  function levelOpen(st, p, lv) {
    const lvs = levelsOf(st);
    const k = lvs.indexOf(lv);
    if (k <= 0) return true;
    const prev = lvs[k - 1];
    const need = Math.min(UNLOCK_COUNT, st.pages.filter(pg => pg.level === prev).length);
    return levelOpen(st, p, prev) && playedAt(st, p, prev) >= need;
  }
  function isOpen(st, p, pi) {
    return st.collection ? levelOpen(st, p, st.pages[pi].level) : pi <= p.reached;
  }
  // 次に開く話：pi より後ろで開いているもの → なければ、まだ読んでいない開いている話
  function nextOpen(st, pi) {
    const p = getProg(st.id);
    for (let k = pi + 1; k < st.pages.length; k++) if (isOpen(st, p, k)) return k;
    return st.pages.findIndex((_, k) => isOpen(st, p, k) && p.best[k] === undefined);
  }

  // ---- 状態 ----
  let S = null; // 今開いているページ

  // ---- 目次 ----
  function renderHome() {
    closeEditor(false);
    S = null;
    closeSheet();
    closeReader();
    app.innerHTML = `
      <header class="hero">
        <div class="hero-top"><h1><img class="logo" src="icon.svg" alt="">ふせじ文庫</h1>${dirSwitch()}</div>
        <p>小説の一部が伏字になっています。前後の流れを読んで、入る言葉を当ててください。<br>ページが進むほど伏字が増え、選ぶ → 書く → 文をまるごと書く、と難しくなっていきます。</p>
      </header>
      ${STORIES.map((st, si) => {
        if (st.collection) return renderCollection(st, si);
        const p = getProg(st.id);
        const cont = Math.min(p.reached, st.pages.length - 1);
        return `
        <section class="story">
          <h2>${esc(st.title)}</h2>
          <p class="intro">${esc(st.intro || '')}</p>
          <div class="row">
            <button class="primary" data-act="open" data-s="${si}" data-p="0">はじめから</button>
            ${p.reached > 0 ? `<button data-act="open" data-s="${si}" data-p="${cont}">つづきから（${cont + 1}ページ目）</button>` : ''}
          </div>
          <ol class="toc">
            ${st.pages.map((pg, pi) => {
              const locked = pi > p.reached;
              const best = p.best[pi];
              return `<li><button class="toc-item" data-act="open" data-s="${si}" data-p="${pi}" ${locked ? 'disabled' : ''}>
                <span class="toc-no">${pi + 1}</span>
                <span class="toc-title">${locked ? '？？？' : esc(pg.title)}</span>
                <span class="lv-badge lv${pg.level}">Lv.${pg.level}</span>
                <span class="toc-star">${best === undefined ? '' : stars(best)}</span>
              </button></li>`;
            }).join('')}
          </ol>
        </section>`;
      }).join('')}
      <details class="levels">
        <summary>難易度のしくみ</summary>
        <dl>${Object.entries(LEVELS).map(([k, l]) => `<dt><span class="lv-badge lv${k}">Lv.${k}</span> ${esc(l.name)}</dt><dd>${esc(l.desc)}</dd>`).join('')}</dl>
        <p class="muted">Lv.3 からはヒント（最初の文字）を見られます。使った伏字は半分の点になります。<br>文を書く問題は、大事な言葉が入っているかで判定します。判定がきびしすぎると思ったら「この答えでも合っている」で○にできます。</p>
      </details>
      <p class="foot"><button class="link" data-act="reset">記録を消す</button></p>
      <p class="foot credit">漢字の読み：<a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noopener">KANJIDIC2</a>（EDRDG, CC BY-SA 4.0）</p>`;
    applyDir();
    window.scrollTo(0, 0);
  }

  // 短編集の目次：難易度ごとにまとめる
  function renderCollection(st, si) {
    const p = getProg(st.id);
    const unread = st.pages.findIndex((_, k) => isOpen(st, p, k) && p.best[k] === undefined);
    const anyPlayed = Object.keys(p.best).length > 0;
    const lvs = levelsOf(st);
    const openLvs = lvs.filter(lv => levelOpen(st, p, lv));
    const showLv = openLvs[openLvs.length - 1];
    return `
      <section class="story">
        <h2>${esc(st.title)}</h2>
        <p class="intro">${esc(st.intro || '')}</p>
        <div class="row">
          ${!anyPlayed ? `<button class="primary" data-act="open" data-s="${si}" data-p="0">第1話から</button>`
            : unread >= 0 ? `<button class="primary" data-act="open" data-s="${si}" data-p="${unread}">つづきから（第${unread + 1}話）</button>` : ''}
          <button data-act="random" data-s="${si}">おまかせで1話</button>
          <span class="muted small">読んだ話 ${Object.keys(p.best).length} / ${st.pages.length}</span>
        </div>
        ${lvs.map(lv => {
          const open = levelOpen(st, p, lv);
          const idx = st.pages.map((pg, pi) => pg.level === lv ? pi : -1).filter(pi => pi >= 0);
          const done = idx.filter(pi => p.best[pi] !== undefined).length;
          const prevLv = lvs[lvs.indexOf(lv) - 1];
          return `<details class="lvgroup" ${lv === showLv ? 'open' : ''}>
            <summary>
              <span class="lv-badge lv${lv}">Lv.${lv}</span> <b>${esc((LEVELS[lv] || LEVELS[6]).name)}</b>
              <span class="muted small">${open ? `${done} / ${idx.length} 話` : `Lv.${prevLv} を${UNLOCK_COUNT}話こなすと開きます`}</span>
            </summary>
            <ol class="toc">
              ${idx.map(pi => {
                const best = p.best[pi];
                return `<li><button class="toc-item" data-act="open" data-s="${si}" data-p="${pi}" ${open ? '' : 'disabled'}>
                  <span class="toc-no">${pi + 1}</span>
                  <span class="toc-title">${open ? esc(st.pages[pi].title) : '？？？'}</span>
                  <span class="lv-badge lv${lv}">Lv.${lv}</span>
                  <span class="toc-star">${best === undefined ? '' : stars(best)}</span>
                </button></li>`;
              }).join('')}
            </ol>
          </details>`;
        }).join('')}
      </section>`;
  }

  // ---- ページ ----
  function openPage(si, pi) {
    const story = STORIES[si];
    const page = story.pages[pi];
    const { blanks, paras } = parsePage(page.text);
    closeReader();
    closeEditor(false);
    const paraOf = [];
    paras.forEach((p, k) => p.parts.forEach(part => { if (part.t === 'blank') paraOf[part.i] = k; }));
    S = {
      si, pi, story, page, blanks, paras, paraOf, dialog: touchUI(),
      lv: LEVELS[page.level] || LEVELS[6],
      values: blanks.map(() => ''),
      hinted: blanks.map(() => false),
      choices: blanks.map(b => b.kind === 'word' ? shuffle([b.answers[0], ...b.dummies]) : null),
      checked: false, raw: [], yomi: [], self: [], warned: false,
    };
    renderPage();
    window.scrollTo(0, 0);
  }

  // keep: 同じページを描き直すとき、画面と本文の枠のスクロール位置をそのまま保つ
  function renderPage(keep) {
    const old = app.querySelector('.paper');
    const pos = keep && old ? { y: window.scrollY, left: old.scrollLeft, top: old.scrollTop } : null;
    const { story, page, pi, lv } = S;
    const prev = story.pages[pi - 1];
    const levelUp = prev && page.level > prev.level && !S.checked;
    app.innerHTML = `
      <nav class="bar">
        <button class="link" data-act="home">← 目次</button>
        <span class="bar-title">${esc(story.title)}</span>
        <span class="bar-page">${story.collection ? `第${pi + 1}話` : `${pi + 1} / ${story.pages.length}`}</span>
        ${dirSwitch()}
      </nav>
      ${levelUp ? `<div class="levelup">難易度アップ！　<b>Lv.${page.level} ${esc(lv.name)}</b><br>${esc(lv.desc)}</div>` : ''}
      <div class="lv"><span class="lv-badge lv${page.level}">Lv.${page.level}</span> <b>${esc(lv.name)}</b><span class="muted">${esc(lv.desc)}</span>
        ${pi > 0 && !story.collection ? '<button class="reread" data-act="reader-open">前のページを読み返す</button>' : ''}</div>
      <article class="paper">
        <h2>${esc(page.title)}</h2>
        ${S.paras.map(p => `<p class="${p.letter ? 'letter' : ''}">${p.parts.map(renderPart).join('')}</p>`).join('')}
      </article>
      ${scrollHint}
      ${renderHints()}
      ${renderFooter()}`;
    applyDir();
    if (pos) {
      const paper = app.querySelector('.paper');
      paper.scrollLeft = pos.left;
      paper.scrollTop = pos.top;
      window.scrollTo(0, pos.y);
      updateScrollHint();
    }
  }

  function renderPart(part) {
    if (part.t === 'text') return esc(part.v);
    const i = part.i, b = S.blanks[i];
    if (S.checked) return renderResult(i);
    if (S.dialog && !(b.kind === 'word' && S.lv.mode === 'choice')) return renderEditButton(i);
    if (b.kind === 'sentence' && isPhrase(b)) {
      return `<span class="blank"><span class="num">${num(i)}</span><input data-i="${i}" value="${esc(S.values[i])}" style="inline-size:8em" autocomplete="off" enterkeyhint="next"></span>`;
    }
    if (b.kind === 'sentence') {
      return `<span class="sent"><span class="num">${num(i)}</span><textarea data-i="${i}" rows="2" placeholder="ここに入る言葉や文を書く">${esc(S.values[i])}</textarea></span>`;
    }
    if (S.lv.mode === 'choice') {
      const v = S.values[i];
      const len = Math.max(...S.choices[i].map(o => [...o].length));
      return `<button class="blank choice ${v ? 'filled' : ''}" data-act="choose" data-i="${i}" style="inline-size:${len + 2.2}em"><span class="num">${num(i)}</span><span class="val">${v ? esc(v) : '？'}</span></button>`;
    }
    return `<span class="blank"><span class="num">${num(i)}</span><input data-i="${i}" value="${esc(S.values[i])}" placeholder="${placeholderOf(i)}" style="inline-size:${fieldWidth(i)}em" autocomplete="off" enterkeyhint="next"></span>`;
  }

  // 書く伏字の幅（em）と、空のときに見せる字（Lv.3 は文字数の □）
  function fieldWidth(i) {
    const b = S.blanks[i];
    if (b.kind === 'sentence') return 8;
    return S.lv.lengthHint ? [...b.answers[0]].length + 1.4 : 5.5;
  }
  function placeholderOf(i) {
    const b = S.blanks[i];
    return b.kind === 'word' && S.lv.lengthHint ? '□'.repeat([...b.answers[0]].length) : '';
  }

  // スマホ用：書く伏字は押すと入力窓が開くボタンにする（本文の中では文字を打たない）
  function editButtonInner(i) {
    const v = S.values[i];
    if (v) return esc(v);
    const b = S.blanks[i];
    if (b.kind === 'sentence' && !isPhrase(b)) return '<span class="ph">押して書く</span>';
    return `<span class="ph">${placeholderOf(i) || '　'}</span>`;
  }
  function renderEditButton(i) {
    const b = S.blanks[i];
    if (b.kind === 'sentence' && !isPhrase(b)) {
      return `<span class="sent"><span class="num">${num(i)}</span><button class="sentbtn" data-act="edit" data-i="${i}">${editButtonInner(i)}</button></span>`;
    }
    return `<span class="blank"><span class="num">${num(i)}</span><button class="editbtn" data-act="edit" data-i="${i}" style="inline-size:${fieldWidth(i)}em">${editButtonInner(i)}</button></span>`;
  }

  // 短い句は文中に入れ、長い文は段落として書かせる
  const isPhrase = b => [...b.model].length <= 12;

  function hintText(b) {
    return b.kind === 'word' ? [...b.answers[0]][0] : [...b.model].slice(0, 3).join('');
  }

  function renderHints() {
    if (S.checked || S.lv.mode === 'choice') return '';
    return `<div class="hints">
      <span class="muted">ヒント（最初の文字。使った伏字は半分の点）</span>
      <div class="row">${S.blanks.map((b, i) => S.hinted[i]
        ? `<span class="hint-open">${num(i)} ${esc(hintText(b))}…</span>`
        : `<button class="chip" data-act="hint" data-i="${i}">${num(i)}</button>`).join('')}</div>
    </div>`;
  }

  function scoreOf(i) {
    const s = S.self[i] ? 1 : S.raw[i];
    return S.hinted[i] ? s * 0.5 : s;
  }
  function pageRatio() {
    if (!S.blanks.length) return 1;
    return S.blanks.reduce((a, _, i) => a + scoreOf(i), 0) / S.blanks.length;
  }

  function renderFooter() {
    if (!S.checked) {
      return `<div class="actions">
        ${S.warned ? `<p class="warn">まだ空いている伏字があります。もう一度押すと、このまま答え合わせします。</p>` : ''}
        <button class="primary big" data-act="check">答え合わせ</button>
      </div>`;
    }
    const got = S.blanks.reduce((a, _, i) => a + scoreOf(i), 0);
    const last = S.pi === S.story.pages.length - 1;
    const r = pageRatio();
    const msg = r >= 0.9 ? 'おみごと！ よく読めています。' : r >= 0.6 ? 'いい調子です。' : '前後の文をもう一度読んでみましょう。';
    return `<div class="score">
      <div class="score-star">${stars(r)}</div>
      <div class="score-num">${fmt(got)} / ${S.blanks.length} 点</div>
      <p>${msg}</p>
      <div class="row center">
        <button data-act="retry">もう一度</button>
        <button class="primary" data-act="next">${nextLabel(last)}</button>
      </div>
    </div>`;
  }
  function nextLabel(last) {
    if (S.story.collection) {
      if (nextOpen(S.story, S.pi) < 0) return '目次へ';
      return dir === 'v' ? '← 次の話へ' : '次の話へ →';
    }
    if (last) return 'おわりへ';
    return dir === 'v' ? '← 次のページへ' : '次のページへ →';
  }
  const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');

  function renderResult(i) {
    const b = S.blanks[i];
    const v = S.values[i].trim();
    const ok = S.raw[i] === 1 || S.self[i];
    const hintNote = S.hinted[i] ? '<span class="muted small">（ヒント）</span>' : '';
    if (b.kind === 'word') {
      const yomiNote = S.yomi[i] && !S.self[i] ? `<span class="muted small">（読みが同じ：${esc(S.yomi[i])}）</span>` : '';
      if (ok) return `<mark class="ok"><span class="num">${num(i)}</span>${esc(v)}${hintNote}${yomiNote}</mark>`;
      return `<span class="ng"><span class="num">${num(i)}</span><s>${v ? esc(v) : '空欄'}</s><b>${esc(b.answers[0])}</b></span>`;
    }
    const mark = ok ? '○' : S.raw[i] > 0 ? '△' : '×';
    const cls = ok ? 'ok' : S.raw[i] > 0 ? 'part' : 'bad';
    const selfBtn = !ok && v ? `<button class="chip" data-act="self" data-i="${i}">この答えでも合っている</button>` : '';
    const same = norm(v) === norm(b.model);
    if (isPhrase(b)) {
      return `<span class="phr-res ${cls}"><span class="num">${num(i)}</span><span class="mark">${mark}</span>${v ? esc(v) : '（空欄）'}${hintNote}${S.self[i] ? '<span class="muted small">（自分で○）</span>' : ''}${same ? '' : `<span class="model">見本：${esc(b.model)}</span>`}</span>${selfBtn}`;
    }
    return `<span class="sent-res ${cls}">
      <span class="sent-head"><span class="num">${num(i)}</span><span class="mark">${mark}</span>${hintNote}${S.self[i] ? '<span class="muted small">（自分で○にした）</span>' : ''}</span>
      <span class="yours">${v ? esc(v) : '（空欄）'}</span>
      ${same ? '' : `<span class="model">見本：${esc(b.model)}</span>`}
      ${selfBtn}
    </span>`;
  }

  function check() {
    closeEditor();
    const empty = S.values.some(v => !v.trim());
    if (empty && !S.warned) { S.warned = true; renderPage(true); focusFirstEmpty(); return; }
    const results = S.blanks.map((b, i) => b.kind === 'word' ? judgeWord(b, S.values[i]) : judgeSentence(b, S.values[i]));
    S.raw = results.map(r => r.score);
    S.yomi = results.map(r => r.yomi || '');
    S.self = S.blanks.map(() => false);
    S.checked = true;
    record();
    renderPage();
    document.querySelector('.paper').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function record() {
    const p = getProg(S.story.id);
    const r = pageRatio();
    p.best[S.pi] = Math.max(p.best[S.pi] || 0, r);
    p.reached = Math.max(p.reached, Math.min(S.pi + 1, S.story.pages.length - 1));
    if (S.pi === S.story.pages.length - 1) p.done = true;
    setProg(S.story.id, p);
  }

  function focusFirstEmpty() {
    const i = S.values.findIndex(v => !v.trim());
    const el = app.querySelector(`[data-i="${i}"]`);
    if (el) el.focus();
  }

  // ---- 選択肢のシート ----
  let sheetReturnY = null; // 伏字が枠に隠れないように画面をずらしたとき、閉じたら戻る位置
  function openSheet(i) {
    sheet.innerHTML = `<div class="sheet-inner">
      <div class="sheet-head"><span>${num(i)} に入る言葉は？</span><button class="link" data-act="close">閉じる</button></div>
      <div class="opts">${S.choices[i].map(o => `<button class="opt ${S.values[i] === o ? 'sel' : ''}" data-act="pick" data-i="${i}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    </div>`;
    sheet.hidden = false;
    app.querySelectorAll('.choice').forEach(el => el.classList.toggle('active', el.dataset.i === String(i)));
    const target = app.querySelector(`.choice[data-i="${i}"]`);
    if (target) {
      const r = target.getBoundingClientRect();
      const limit = window.innerHeight - sheet.offsetHeight - 16;
      if (r.bottom > limit) {
        if (sheetReturnY === null) sheetReturnY = window.scrollY;
        window.scrollBy(0, r.bottom - limit);
      }
    }
  }
  function closeSheet(restore) {
    const wasOpen = !sheet.hidden;
    sheet.hidden = true;
    sheet.innerHTML = '';
    app.querySelectorAll('.choice.active').forEach(el => el.classList.remove('active'));
    if (restore && wasOpen && sheetReturnY !== null) window.scrollTo(0, sheetReturnY);
    sheetReturnY = null;
  }

  // ---- 入力窓（スマホ用） ----
  // キーボードは下から出るので、窓は画面の上に出す。本文は描き直さず、ページの位置も動かさない
  let edAt = -1;
  let edReturnY = null;
  const writable = () => S.blanks.map((_, k) => k).filter(k => !(S.blanks[k].kind === 'word' && S.lv.mode === 'choice'));

  function renderContext(i) {
    const p = S.paras[S.paraOf[i]];
    return p.parts.map(part => {
      if (part.t === 'text') return esc(part.v);
      if (part.i === i) return `<mark class="ctx-target">${esc(S.values[i]) || num(i)}</mark>`;
      return `<span class="ctx-other">${esc(S.values[part.i]) || num(part.i)}</span>`;
    }).join('');
  }

  function openEditor(i) {
    if (!S || S.checked) return;
    closeSheet();
    if (edReturnY === null) edReturnY = window.scrollY;
    edAt = i;
    const b = S.blanks[i];
    const multi = b.kind === 'sentence' && !isPhrase(b);
    const list = writable();
    const k = list.indexOf(i);
    const prev = list[k - 1], next = list[k + 1];
    const prevBtn = `<button data-act="ed-go" data-i="${prev}" ${prev === undefined ? 'disabled' : ''}>${dir === 'v' ? '前の伏字 →' : '← 前の伏字'}</button>`;
    const nextBtn = next === undefined
      ? '<button class="primary" data-act="ed-close">決定</button>'
      : `<button class="primary" data-act="ed-go" data-i="${next}">${dir === 'v' ? '← 次の伏字' : '次の伏字 →'}</button>`;
    const what = b.kind === 'word' ? '言葉' : multi ? '文' : '言葉のかたまり';
    editor.innerHTML = `<div class="ed-panel" role="dialog" aria-label="${num(i)} に入る${what}">
      <div class="ed-head"><span>${num(i)} に入る${what}</span><button class="link" data-act="ed-close">閉じる</button></div>
      <div class="ed-ctx">${renderContext(i)}</div>
      ${S.hinted[i] ? `<div class="ed-hint">ヒント：最初は「${esc(hintText(b))}」</div>` : ''}
      ${multi
        ? `<textarea id="ed-input" rows="3" placeholder="ここに入る文を書く">${esc(S.values[i])}</textarea>`
        : `<input id="ed-input" value="${esc(S.values[i])}" placeholder="${placeholderOf(i)}" autocomplete="off" enterkeyhint="${next === undefined ? 'done' : 'next'}">`}
      <div class="row center ed-nav">${dir === 'v' ? nextBtn + prevBtn : prevBtn + nextBtn}</div>
    </div>`;
    editor.hidden = false;
    document.body.classList.add('editing');
    app.querySelectorAll('[data-act="edit"]').forEach(el => el.classList.toggle('active', el.dataset.i === String(i)));
    placeEditor();
    // 前後の文の枠は、伏字のところが見えるまでスクロールしておく
    const ctx = editor.querySelector('.ed-ctx');
    const mark = ctx.querySelector('.ctx-target');
    ctx.scrollTop = Math.max(0, mark.offsetTop - ctx.offsetTop - ctx.clientHeight / 3);
    const inp = editor.querySelector('#ed-input');
    inp.focus({ preventScroll: true });
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }

  function closeEditor(restore = true) {
    if (!editor || editor.hidden) return;
    editor.hidden = true;
    editor.innerHTML = '';
    document.body.classList.remove('editing');
    app.querySelectorAll('[data-act="edit"].active').forEach(el => el.classList.remove('active'));
    if (restore && edReturnY !== null) window.scrollTo(0, edReturnY);
    edReturnY = null;
    edAt = -1;
  }

  // キーボードが出て見えている範囲が動いても、窓をその上端に合わせる
  function placeEditor() {
    if (!editor || editor.hidden) return;
    const vv = window.visualViewport;
    editor.style.top = vv ? `${vv.offsetTop}px` : '0px';
    editor.style.height = vv ? `${vv.height}px` : '100%';
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', placeEditor);
    window.visualViewport.addEventListener('scroll', placeEditor);
  }

  function editorInput(v) {
    if (edAt < 0) return;
    S.values[edAt] = v;
    const btn = app.querySelector(`[data-act="edit"][data-i="${edAt}"]`);
    if (btn) btn.innerHTML = editButtonInner(edAt);
    const mark = editor.querySelector('.ctx-target');
    if (mark) mark.textContent = v || num(edAt);
  }

  // ---- 読み返し ----
  // 解いているページの答えはそのまま残し、それより前のページだけを重ねて見せる
  function openReader(at) {
    if (!S || at < 0 || at >= S.pi) return;
    closeSheet();
    const pg = S.story.pages[at];
    // 縦書きは右から左へ読み進むので、「次」を左・「前」を右に置く
    const prevBtn = `<button data-act="reader-go" data-p="${at - 1}" ${at === 0 ? 'disabled' : ''}>${dir === 'v' ? '前のページ →' : '← 前のページ'}</button>`;
    const nextBtn = `<button data-act="reader-go" data-p="${at + 1}" ${at + 1 >= S.pi ? 'disabled' : ''}>${dir === 'v' ? '← 次のページ' : '次のページ →'}</button>`;
    reader.innerHTML = `<div class="reader-inner">
      <div class="reader-bar">
        <span class="reader-title">読み返し　<span class="muted">${at + 1}ページ目</span></span>
        <button class="primary" data-act="reader-close">${S.pi + 1}ページ目に戻る</button>
      </div>
      <p class="muted small reader-note">伏字には正解を入れてあります（色のついた部分）。</p>
      <article class="paper">${filledPage(pg)}</article>
      ${scrollHint}
      <div class="row center reader-nav">${dir === 'v' ? nextBtn + prevBtn : prevBtn + nextBtn}</div>
    </div>`;
    reader.hidden = false;
    reader.scrollTop = 0;
    document.body.classList.add('reading');
    updateScrollHint();
  }
  function closeReader() {
    if (!reader || reader.hidden) return;
    reader.hidden = true;
    reader.innerHTML = '';
    document.body.classList.remove('reading');
  }

  // ---- おわり ----
  function renderEnd(si) {
    S = null;
    const st = STORIES[si];
    const p = getProg(st.id);
    const ratios = st.pages.map((_, pi) => p.best[pi] || 0);
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    app.innerHTML = `
      <nav class="bar"><button class="link" data-act="home">← 目次</button><span class="bar-title">${esc(st.title)}</span><span class="bar-page">おわり</span>${dirSwitch()}</nav>
      <div class="end">
        <h2>読了</h2>
        <div class="score-star">${stars(avg)}</div>
        <p>全ページの最高記録の平均：<b>${Math.round(avg * 100)}点</b></p>
        <div class="row center">
          <button class="primary" data-act="fulltext" data-s="${si}">伏字なしで通して読む</button>
          <button data-act="home">目次へ</button>
        </div>
      </div>`;
    applyDir();
    window.scrollTo(0, 0);
  }

  function filledPage(pg) {
    const { blanks, paras } = parsePage(pg.text);
    const fill = part => part.t === 'text' ? esc(part.v)
      : `<span class="filled-in">${esc(blanks[part.i].kind === 'word' ? blanks[part.i].answers[0] : blanks[part.i].model)}</span>`;
    return `<h2>${esc(pg.title)}</h2>${paras.map(p => `<p class="${p.letter ? 'letter' : ''}">${p.parts.map(fill).join('')}</p>`).join('')}`;
  }

  function renderFull(si) {
    S = null;
    const st = STORIES[si];
    const body = st.pages.map(filledPage).join('<hr>');
    app.innerHTML = `
      <nav class="bar"><button class="link" data-act="home">← 目次</button><span class="bar-title">${esc(st.title)}</span><span class="bar-page">全文</span>${dirSwitch()}</nav>
      <article class="paper">${body}</article>
      ${scrollHint}
      <div class="actions"><button data-act="home">目次へ</button></div>`;
    applyDir();
    window.scrollTo(0, 0);
  }

  // ---- 操作 ----
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (!sheet.hidden && !e.target.closest('.sheet')) closeSheet(true);
      if (e.target === editor) closeEditor(); // 窓の外（うす暗いところ）を押したら閉じる
      return;
    }
    const act = el.dataset.act;
    const i = Number(el.dataset.i);
    switch (act) {
      case 'home': renderHome(); break;
      case 'dir':
        dir = el.dataset.v;
        try { localStorage.setItem(DIR_KEY, dir); } catch (err) { /* 保存できなくても切り替えはできる */ }
        if (S) renderPage(); else applyDir(); // ページはボタンの矢印も向きに合わせて描き直す
        break;
      case 'open': openPage(Number(el.dataset.s), Number(el.dataset.p)); break;
      case 'choose': openSheet(i); break;
      case 'pick': {
        S.values[i] = el.dataset.v;
        const btn = app.querySelector(`.choice[data-i="${i}"]`);
        if (btn) {
          btn.classList.add('filled');
          btn.querySelector('.val').textContent = el.dataset.v;
        }
        closeSheet(true);
        break;
      }
      case 'close': closeSheet(true); break;
      case 'edit': openEditor(i); break;
      case 'ed-go': openEditor(i); break;
      case 'ed-close': closeEditor(); break;
      case 'reader-open': openReader(S.pi - 1); break;
      case 'reader-go': openReader(Number(el.dataset.p)); break;
      case 'reader-close': closeReader(); break;
      case 'hint': S.hinted[i] = true; renderPage(true); break;
      case 'check': check(); break;
      case 'self': S.self[i] = true; record(); renderPage(true); break;
      case 'retry': openPage(S.si, S.pi); break;
      case 'next':
        if (S.story.collection) {
          const k = nextOpen(S.story, S.pi);
          if (k >= 0) openPage(S.si, k); else renderHome();
        } else if (S.pi < S.story.pages.length - 1) openPage(S.si, S.pi + 1);
        else renderEnd(S.si);
        break;
      case 'random': {
        const si = Number(el.dataset.s);
        const st = STORIES[si];
        const p = getProg(st.id);
        const open = st.pages.map((_, k) => k).filter(k => isOpen(st, p, k));
        const fresh = open.filter(k => p.best[k] === undefined);
        const pool = fresh.length ? fresh : open;
        openPage(si, pool[Math.floor(Math.random() * pool.length)]);
        break;
      }
      case 'fulltext': renderFull(Number(el.dataset.s)); break;
      case 'reset':
        if (confirm('すべての記録を消しますか？')) { saveAll({}); renderHome(); }
        break;
    }
  });

  document.addEventListener('input', e => {
    if (!S || S.checked) return;
    if (e.target.id === 'ed-input') { editorInput(e.target.value); return; }
    const i = e.target.dataset && e.target.dataset.i;
    if (i !== undefined && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) S.values[Number(i)] = e.target.value;
  });

  // Enter で次の伏字へ（文の欄は Ctrl+Enter）
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSheet(true); closeEditor(); closeReader(); return; }
    // 入力窓：Enter で次の伏字へ（最後なら閉じる）。文の欄は改行のまま
    if (e.key === 'Enter' && !e.isComposing && e.target.id === 'ed-input' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      const list = writable();
      const next = list[list.indexOf(edAt) + 1];
      if (next === undefined) closeEditor(); else openEditor(next);
      return;
    }
    if (e.key !== 'Enter' || e.isComposing || !S || S.checked) return;
    const t = e.target;
    if (t.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const fields = [...app.querySelectorAll('input[data-i], textarea[data-i]')];
    const next = fields[fields.indexOf(t) + 1];
    if (next) next.focus(); else app.querySelector('[data-act="check"]').focus();
  });

  document.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('paper')) updateScrollHint(); }, true);
  window.addEventListener('resize', updateScrollHint);

  renderHome();
})();
