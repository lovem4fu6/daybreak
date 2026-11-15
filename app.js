'use strict';

/* ───────── 設定：想調整數值改這裡 ───────── */
const STORE_KEY = 'daybreak.v1';
const XP = { fried: 30, english: 30, train: 50, week: 100, penalty: 15, streak7: 50 };
const WEEK_GOAL = 4;          // 每週訓練次數目標
const PASS_EVERY = 7;         // 連續幾天無炸物可得一張解禁券
const RANKS = [[50, '傳說'], [35, '金'], [20, '銀'], [10, '銅'], [5, '鐵'], [1, '見習']];
const TITLES = [
  { name: '踏出第一步', desc: '完成第一個任務', test: r => r.total >= 1 },
  { name: '七日無炸', desc: '連續 7 天不吃炸物', test: r => r.bestFried >= 7 },
  { name: '油鍋絕緣體', desc: '連續 30 天不吃炸物', test: r => r.bestFried >= 30 },
  { name: '說到做到', desc: '首次達成每週 4 次訓練', test: r => r.weeksCleared >= 1 },
  { name: '鐵打的紀律', desc: '連續 4 週達成訓練目標', test: r => r.bestWeekStreak >= 4 },
  { name: '開口的勇氣', desc: '連續 7 天學英文', test: r => r.bestEng >= 7 },
  { name: '語言成為習慣', desc: '連續 30 天學英文', test: r => r.bestEng >= 30 },
  { name: '突破十級', desc: '等級達到 10', test: r => r.level >= 10 },
];

/* ───────── 日期工具 ───────── */
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return dkey(d); };
const weekOf = k => shift(k, -((parse(k).getDay() + 6) % 7)); // 該週的週一
const todayKey = () => dkey(new Date());

/* ───────── 存檔 ───────── */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.days && s.start) return s;
  } catch (e) { /* 沒有存檔或損壞時重新開始 */ }
  return { v: 1, start: todayKey(), days: {}, sound: true };
}
let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('存檔失敗：儲存空間不可用'); }
}
const dayRec = k => (state.days[k] = state.days[k] || {});

/* ───────── 核心：所有數值都由每日紀錄推算 ───────── */
const need = l => 100 + (l - 1) * 40;
function derive() {
  const today = todayKey(), yesterday = shift(today, -1);
  const r = { xp: 0, str: 0, vit: 0, int: 0, total: 0, friedStreak: 0, bestFried: 0, engStreak: 0, bestEng: 0,
    passEarned: 0, passUsed: 0, weeksCleared: 0, weekStreak: 0, bestWeekStreak: 0, weeks: {} };
  for (let d = state.start; d <= today; d = shift(d, 1)) {
    const rec = state.days[d] || {}, past = d !== today;
    if (rec.fried === 'kept') {
      r.friedStreak++; r.vit++; r.total++; r.xp += XP.fried;
      if (r.friedStreak % PASS_EVERY === 0) { r.passEarned++; r.xp += XP.streak7; }
    } else if (rec.fried === 'pass') r.passUsed++;
    else if (rec.fried === 'broken') r.friedStreak = 0;
    else if (past && d !== yesterday) r.friedStreak = 0; // 昨天還能補回報，更早的視同中斷
    r.bestFried = Math.max(r.bestFried, r.friedStreak);

    if (rec.english) { r.engStreak++; r.int++; r.total++; r.xp += XP.english; }
    else if (past) r.engStreak = 0;
    r.bestEng = Math.max(r.bestEng, r.engStreak);

    if (rec.train) { r.str++; r.total++; r.xp += XP.train; const w = weekOf(d); r.weeks[w] = (r.weeks[w] || 0) + 1; }
    if (rec.pen) for (const id in rec.pen) if (rec.pen[id]) r.xp += XP.penalty;
  }
  const thisWeek = weekOf(today);
  for (let w = weekOf(state.start); w <= thisWeek; w = shift(w, 7)) {
    if ((r.weeks[w] || 0) >= WEEK_GOAL) { r.weeksCleared++; r.weekStreak++; r.xp += XP.week; }
    else if (w !== thisWeek) r.weekStreak = 0;
    r.bestWeekStreak = Math.max(r.bestWeekStreak, r.weekStreak);
  }
  r.passes = Math.max(0, r.passEarned - r.passUsed);
  let l = 1, x = r.xp;
  while (x >= need(l)) { x -= need(l); l++; }
  r.level = l; r.cur = x; r.need = need(l);
  r.rank = RANKS.find(([min]) => l >= min)[1];
  r.titles = TITLES.filter(t => t.test(r)).map(t => t.name);
  r.weekCount = r.weeks[thisWeek] || 0;
  r.lastWeekCount = thisWeek > weekOf(state.start) ? (r.weeks[shift(thisWeek, -7)] || 0) : null;
  return r;
}

/* 今天的補償任務：由昨天的結果決定 */
function penalties() {
  const y = shift(todayKey(), -1);
  if (y < state.start) return [];
  const rec = state.days[y] || {}, list = [];
  if (rec.fried === 'broken') list.push({ id: 'fried', text: '快走 20 分鐘', why: '昨天吃了炸物' });
  if (!rec.english) list.push({ id: 'english', text: '今天英文多學 10 分鐘', why: '昨天沒有學英文' });
  return list;
}

/* ───────── 畫面 ───────── */
const $app = document.getElementById('app');
const WD = ['日', '一', '二', '三', '四', '五', '六'];

function render() {
  const r = derive(), today = todayKey(), yesterday = shift(today, -1);
  const rec = state.days[today] || {}, yrec = state.days[yesterday] || {};
  const d = new Date();
  const pens = penalties();
  const askYesterday = yesterday >= state.start && !yrec.fried;

  const friedBody = rec.fried
    ? `<div class="done-row"><span class="tag ${rec.fried}">${{ kept: '✓ 今天守住了', broken: '已記錄：破戒', pass: '已使用解禁券' }[rec.fried]}</span>
         <button class="link" data-act="fried" data-val="">更正</button></div>`
    : `<div class="btn-row">
         <button class="btn primary" data-act="fried" data-val="kept">守住了</button>
         <button class="btn ghost" data-act="fried" data-val="broken">破戒了</button>
       </div>
       ${r.passes > 0 ? `<button class="btn ticket" data-act="fried" data-val="pass">使用解禁券（剩 ${r.passes} 張）</button>` : ''}`;

  const pips = Array.from({ length: Math.max(WEEK_GOAL, r.weekCount) }, (_, i) =>
    `<i class="pip ${i < r.weekCount ? 'on' : ''}"></i>`).join('');

  $app.innerHTML = `
  <header class="status">
    <div class="date">${d.getMonth() + 1} 月 ${d.getDate()} 日　星期${WD[d.getDay()]}</div>
    <div class="who">
      <div class="rank">${r.rank}</div>
      <div class="lv"><small>等級</small><b>${r.level}</b></div>
      <div class="passes" title="解禁券">🎟 ${r.passes}</div>
    </div>
    <div class="bar"><span style="width:${Math.round(r.cur / r.need * 100)}%"></span></div>
    <div class="bar-label">經驗 ${r.cur} / ${r.need}</div>
  </header>

  <section class="stats">
    <div><small>力量</small><b>${r.str}</b><em>訓練</em></div>
    <div><small>體質</small><b>${r.vit}</b><em>無炸日</em></div>
    <div><small>智力</small><b>${r.int}</b><em>英文</em></div>
  </section>

  ${askYesterday ? `
  <section class="card ask">
    <h3>昨天還沒回報</h3>
    <p>昨天有守住不吃炸物嗎？今天之內回報，連續紀錄就不會中斷。</p>
    <div class="btn-row">
      <button class="btn primary" data-act="fried" data-val="kept" data-day="${yesterday}">守住了</button>
      <button class="btn ghost" data-act="fried" data-val="broken" data-day="${yesterday}">破戒了</button>
    </div>
  </section>` : ''}

  <h2>今日任務</h2>

  <section class="card ${rec.fried === 'kept' ? 'done' : ''}">
    <div class="card-head"><h3>禁炸令</h3><span class="xp">+${XP.fried}</span></div>
    <p>今天不吃炸物。連續 ${r.friedStreak} 天${r.friedStreak ? '' : '，從今天開始'}　·　每 ${PASS_EVERY} 天得一張解禁券</p>
    ${friedBody}
  </section>

  <section class="card ${rec.english ? 'done' : ''}">
    <div class="card-head"><h3>英文修煉</h3><span class="xp">+${XP.english}</span></div>
    <p>今天學英文。連續 ${r.engStreak} 天</p>
    <button class="btn ${rec.english ? 'checked' : 'primary'}" data-act="toggle" data-key="english">${rec.english ? '✓ 已完成（點一下取消）' : '完成'}</button>
  </section>

  <section class="card ${rec.train ? 'done' : ''}">
    <div class="card-head"><h3>肉體鍛鍊</h3><span class="xp">+${XP.train}</span></div>
    <p>本週 ${r.weekCount} / ${WEEK_GOAL} 次　·　達標再 +${XP.week}${r.weekStreak ? `　·　連續 ${r.weekStreak} 週` : ''}</p>
    <div class="pips">${pips}</div>
    ${r.lastWeekCount !== null && r.lastWeekCount < WEEK_GOAL && r.weekCount === 0
      ? `<p class="warn">上週只完成 ${r.lastWeekCount} 次，這週重新來過。</p>` : ''}
    <button class="btn ${rec.train ? 'checked' : 'primary'}" data-act="toggle" data-key="train">${rec.train ? '✓ 今天練過了（點一下取消）' : '記錄今天的訓練'}</button>
  </section>

  ${pens.length ? `<h2>補償任務</h2>` + pens.map(p => {
    const done = rec.pen && rec.pen[p.id];
    return `<section class="card penalty ${done ? 'done' : ''}">
      <div class="card-head"><h3>${p.text}</h3><span class="xp">+${XP.penalty}</span></div>
      <p>${p.why}</p>
      <button class="btn ${done ? 'checked' : 'primary'}" data-act="pen" data-id="${p.id}">${done ? '✓ 已補償（點一下取消）' : '完成'}</button>
    </section>`;
  }).join('') : ''}

  <h2>稱號</h2>
  <ul class="titles">
    ${TITLES.map(t => `<li class="${r.titles.includes(t.name) ? 'got' : ''}"><b>${t.name}</b><span>${t.desc}</span></li>`).join('')}
  </ul>

  <footer>
    <button class="link" data-act="sound">音效：${state.sound ? '開' : '關'}</button>
    <button class="link" data-act="backup">備份 / 還原</button>
  </footer>`;
}

/* ───────── 操作 ───────── */
function act(mutate) {
  const before = derive();
  mutate();
  save();
  const after = derive();
  render();
  const msgs = [];
  const dx = after.xp - before.xp;
  if (dx > 0) msgs.push(`經驗 +${dx}`);
  if (after.passEarned > before.passEarned) msgs.push('獲得解禁券 1 張');
  after.titles.filter(t => !before.titles.includes(t)).forEach(t => msgs.push(`獲得稱號「${t}」`));
  if (msgs.length) { toast(msgs.join('\n')); ding(after.level > before.level); }
  if (after.level > before.level) levelUp(after);
  return after;
}

$app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const today = todayKey(), a = b.dataset.act;
  if (a === 'fried') {
    const day = b.dataset.day || today, val = b.dataset.val;
    act(() => { const rec = dayRec(day); if (val) rec.fried = val; else delete rec.fried; });
    if (val === 'broken') toast('已誠實記錄。\n明天會出現補償任務。');
    if (val === 'pass') toast('解禁券已使用，連續紀錄保留。');
  } else if (a === 'toggle') {
    const k = b.dataset.key;
    act(() => { const rec = dayRec(today); rec[k] = !rec[k]; });
  } else if (a === 'pen') {
    const id = b.dataset.id;
    act(() => { const rec = dayRec(today); rec.pen = rec.pen || {}; rec.pen[id] = !rec.pen[id]; });
  } else if (a === 'sound') {
    state.sound = !state.sound; save(); render(); if (state.sound) ding();
  } else if (a === 'backup') openBackup();
});

/* ───────── 回饋：提示、音效、升級 ───────── */
const $toast = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

let audio;
function ding(big) {
  if (!state.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = big ? [523, 659, 784, 1047] : [784, 1175];
    notes.forEach((f, i) => {
      const t = audio.currentTime + i * 0.11, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.55);
    });
  } catch (e) { /* 沒有音效也不影響使用 */ }
}

const $overlay = document.getElementById('overlay');
function closeOverlay() { $overlay.hidden = true; $overlay.innerHTML = ''; }
function levelUp(r) {
  $overlay.innerHTML = `<div class="panel levelup">
    <small>升級</small><b>${r.level}</b><p>${r.rank}階　·　下一級需要 ${r.need} 經驗</p>
    <button class="btn primary" data-close>繼續</button></div>`;
  $overlay.hidden = false;
}
function openBackup() {
  $overlay.innerHTML = `<div class="panel">
    <h3>備份 / 還原</h3>
    <p>紀錄只存在這支手機裡。定期把下面的文字複製到備忘錄，換手機時貼回來按「還原」。</p>
    <textarea id="bk" rows="6" spellcheck="false"></textarea>
    <div class="btn-row">
      <button class="btn primary" data-copy>複製</button>
      <button class="btn ghost" data-restore>還原</button>
    </div>
    <button class="link" data-close>關閉</button></div>`;
  $overlay.querySelector('#bk').value = JSON.stringify(state);
  $overlay.hidden = false;
}
$overlay.addEventListener('click', e => {
  const t = e.target;
  if (t.matches('[data-close]') || t === $overlay) return closeOverlay();
  const box = $overlay.querySelector('#bk');
  if (t.matches('[data-copy]')) {
    box.select();
    (navigator.clipboard ? navigator.clipboard.writeText(box.value) : Promise.reject())
      .catch(() => document.execCommand('copy'))
      .finally(() => toast('已複製備份文字'));
  }
  if (t.matches('[data-restore]')) {
    let s;
    try { s = JSON.parse(box.value); } catch (err) { s = null; }
    if (!s || typeof s.days !== 'object' || !/^\d{4}-\d\d-\d\d$/.test(s.start)) return toast('這段文字不是有效的備份');
    if (!confirm('確定用這份備份覆蓋目前的紀錄嗎？')) return;
    state = { v: 1, start: s.start, days: s.days, sound: s.sound !== false };
    save(); closeOverlay(); render(); toast('已還原');
  }
});

/* ───────── 啟動 ───────── */
render();
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); }); // 跨日後回到 App 會刷新
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
