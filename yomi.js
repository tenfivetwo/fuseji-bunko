'use strict';
// 読みで比べる
// 入力の漢字を、辞書（kanji.js）にある読みに置き換えていき、正解の読み（ひらがな）と同じになれるかを調べる。
// 「引越し」「引越」「引っこし」「ひっこし」はどれも「ひっこし」と読めるので同じ答えとみなす。
(() => {
  const DICT = window.KANJI_YOMI || {};
  const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const isKanji = c => /[㐀-鿿豈-﫿々]/.test(c);
  const ROWS = ['あいうえお', 'かきくけこ', 'がぎぐげご', 'さしすせそ', 'ざじずぜぞ', 'たちつてと', 'だぢづでど', 'なにぬねの',
    'はひふへほ', 'ばびぶべぼ', 'ぱぴぷぺぽ', 'まみむめも', 'やゆよ', 'らりるれろ', 'わを'];
  const rowOf = c => ROWS.find(r => r.includes(c)) || c;
  const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
    た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ばぱ', ひ: 'びぴ', ふ: 'ぶぷ', へ: 'べぺ', ほ: 'ぼぽ' };
  const cache = new Map();

  // 1字ずつの読みでは出せない語の読み（熟字訓など）。必要に応じて足す
  const WORDS = {
    文字: 'もじ', 今日: 'きょう', 明日: 'あした あす', 昨日: 'きのう', 一昨日: 'おととい', 今朝: 'けさ', 今年: 'ことし',
    大人: 'おとな', 一人: 'ひとり', 二人: 'ふたり', 一日: 'ついたち', 二日: 'ふつか', 三日: 'みっか', 四日: 'よっか',
    五日: 'いつか', 六日: 'むいか', 七日: 'なのか', 八日: 'ようか', 九日: 'ここのか', 十日: 'とおか', 二十日: 'はつか', 二十歳: 'はたち',
    母さん: 'かあさん', 父さん: 'とうさん', 兄さん: 'にいさん', 姉さん: 'ねえさん', 叔父: 'おじ', 伯父: 'おじ', 叔母: 'おば', 伯母: 'おば',
    息子: 'むすこ', 迷子: 'まいご', 部屋: 'へや', 時計: 'とけい', 眼鏡: 'めがね', 景色: 'けしき', 上手: 'じょうず', 下手: 'へた',
    真面目: 'まじめ', 土産: 'みやげ', 果物: 'くだもの', 八百屋: 'やおや', 博士: 'はかせ', 浴衣: 'ゆかた', 田舎: 'いなか',
    心地: 'ここち', 河原: 'かわら', 川原: 'かわら', 風邪: 'かぜ', 笑顔: 'えがお', 芝生: 'しばふ', 相撲: 'すもう', 紅葉: 'もみじ',
    梅雨: 'つゆ', 七夕: 'たなばた', 雪崩: 'なだれ', 時雨: 'しぐれ', 五月雨: 'さみだれ', 一寸: 'ちょっと', 何処: 'どこ', 煙草: 'たばこ',
    裸足: 'はだし', 尻尾: 'しっぽ', 海苔: 'のり', 蒲公英: 'たんぽぽ', 竹刀: 'しない', 足袋: 'たび', 草履: 'ぞうり', 乳母: 'うば',
    若人: 'わこうど', 玄人: 'くろうと', 素人: 'しろうと', 仲人: 'なこうど', 寄席: 'よせ', 名残: 'なごり', 吹雪: 'ふぶき',
    行方: 'ゆくえ', 為替: 'かわせ', 太刀: 'たち', 山車: 'だし', 小豆: 'あずき', 大和: 'やまと', 百合: 'ゆり', 向日葵: 'ひまわり', 有難: 'ありがと ありがた',
  };
  const WORD_LIST = Object.entries(WORDS).map(([w, r]) => [[...w], r.split(' ')]);

  // 1字の漢字が取りうる読み
  //   送りがなを書かない形（引越＝ひっこし の「越」→こし）、活用の1字目（越す→こさ・こし…、買う→かわ）、
  //   促音（がく→がっ、ひき→ひっ）、連濁（かさ→がさ）も含める
  function readingsOf(k) {
    if (cache.has(k)) return cache.get(k);
    const set = new Set();
    for (const raw of (DICT[k] || '').split(' ').filter(Boolean)) {
      const [stem, okuri = ''] = toHira(raw).split('.');
      set.add(stem);
      if (okuri) {
        for (let n = 1; n <= okuri.length; n++) set.add(stem + okuri.slice(0, n));
        const row = okuri[0] === 'う' ? 'あいうえおわ' : rowOf(okuri[0]);
        for (const c of row) set.add(stem + c);
      }
    }
    for (const r of [...set]) {
      if (r.length > 1 && 'つちくきり'.includes(r.slice(-1))) set.add(r.slice(0, -1) + 'っ');
    }
    for (const r of [...set]) {
      for (const c of DAKU[r[0]] || '') set.add(c + r.slice(1));
    }
    const list = [...set].filter(Boolean);
    cache.set(k, list);
    return list;
  }

  // 位置 i から読める候補 [何文字使うか, 読み]
  //   「々」は直前の漢字の読みをくり返す。WORDS の語はまとめて読む
  const optionsAt = (chars, i) => {
    const c = chars[i];
    if (!isKanji(c)) return [[1, c]];
    const opts = readingsOf(c === '々' && i > 0 ? chars[i - 1] : c).map(r => [1, r]);
    for (const [w, rs] of WORD_LIST) {
      if (!w.every((ch, k) => chars[i + k] === ch)) continue;
      for (const r of rs) {
        opts.push([w.length, r]);
        if (i > 0) for (const c of DAKU[r[0]] || '') opts.push([w.length, c + r.slice(1)]);
      }
    }
    return opts;
  };

  // input 全体を target（ひらがな）と読めるか
  function canRead(input, target) {
    const chars = [...input];
    const seen = new Set();
    const stack = [[0, 0]];
    while (stack.length) {
      const [i, j] = stack.pop();
      const key = i * 1000 + j;
      if (seen.has(key)) continue;
      seen.add(key);
      if (i === chars.length) { if (j === target.length) return true; continue; }
      for (const [len, r] of optionsAt(chars, i)) {
        if (target.startsWith(r, j)) stack.push([i + len, j + r.length]);
      }
    }
    return false;
  }

  // input のどこかに key（ひらがな）と読める部分があるか
  function containsReading(input, key) {
    if (!key) return false;
    const chars = [...input];
    const step = (j, c) => {
      let t = key.slice(0, j) + c;
      while (t && !key.startsWith(t)) t = t.slice(1);
      return t.length;
    };
    // at[i] = 位置 i までを読んだとき、key の何文字目まで一致しているか（の集合）
    const at = chars.map(() => new Set());
    at.push(new Set());
    at[0].add(0);
    for (let i = 0; i < chars.length; i++) {
      if (!at[i].size) at[i].add(0); // 読めない字があれば、そこから数え直す
      for (const j0 of at[i]) {
        for (const [len, r] of optionsAt(chars, i)) {
          let j = j0;
          for (const c of r) {
            j = step(j, c);
            if (j === key.length) return true;
          }
          at[i + len].add(j);
        }
      }
    }
    return false;
  }

  window.Yomi = { canRead, containsReading, readingsOf, ready: Object.keys(DICT).length > 0 };
})();
