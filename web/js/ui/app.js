/**
 * 飞行棋 UI 编排：开局设置 → 对局驱动（人机/热座）→ 结算。
 * ------------------------------------------------------------------
 * 驱动循环 drive()：
 *   phase 'roll'  —— 玩家点「掷骰」/ 电脑自动掷（骰子动画约 1s）；
 *   phase 'move'  —— 可动机呼吸高亮 + 落点幽灵预览；玩家点击执行，
 *                     唯一可动 600ms 自动执行；电脑由 chooseAction 决策；
 *   动画完成 → 事件日志（主题化文案）→ 存档 → 下一轮；
 *   phase 'over'  —— 结算页（主题化排名）。
 * localStorage：座位/主题配置记忆 + 未完对局恢复（含随机源状态）。
 * 宿主桥 window.otoolsPlugin：用于导出对局记录（宿主不可用时退回浏览器下载）。
 */

import {
  createGame, rollDice, applyMove, legalMoves, previewMove,
  serializeState, hydrateState, progressOf, SEAT_ORDER, ARRIVE_STEP,
} from '../engine/ludo.js';
import { chooseAction } from '../engine/ludo-ai.js';
import { createRng } from '../engine/rng.js';
import {
  THEMES, getTheme, applyThemeCss, seatLabel, planeLabel, themeCopy,
} from '../../data/themes.js';
import { createBoard } from './board.js';
import { formatEvent, appendLog } from './log.js';

const CFG_KEY = 'otools-feixingqi.config';
const SAVE_KEY = 'otools-feixingqi.save';

/** 骰面点阵（3×3 布位的点数）。 */
const DICE_PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
function renderDiceFace(value) {
  const face = $('#diceFace');
  face.innerHTML = '';
  if (value == null) {
    face.textContent = '✈';
    return;
  }
  for (let i = 0; i < 9; i += 1) {
    const dot = document.createElement('i');
    if (DICE_PIPS[value].includes(i)) dot.className = 'pip on';
    face.appendChild(dot);
  }
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);

let config = loadConfig();
let theme = getTheme(config.themeId);
let game = null;
let rng = null;
let busy = false;

const board = createBoard($('#boardWrap'));

// ------------------------------------------------------------------ 配置存取

function loadConfig() {
  const base = {
    themeId: THEMES[0].id,
    level: 'normal',
    seats: Object.fromEntries(SEAT_ORDER.map((s, i) => [s, {
      type: i === 0 ? 'human' : i === 1 ? 'cpu' : 'off',
      name: '',
    }])),
  };
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (!raw) return base;
    const merged = { ...base, ...raw };
    merged.seats = { ...base.seats, ...(raw.seats || {}) };
    if (!THEMES.some((t) => t.id === merged.themeId)) merged.themeId = base.themeId;
    return merged;
  } catch {
    return base;
  }
}

function saveConfig() {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(config)); } catch { /* 隐私模式等 */ }
}

function saveGame() {
  if (!game || game.phase === 'over') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      config, saved: serializeState(game), rngState: rng ? rng.getState() : 0, at: Date.now(),
    }));
  } catch { /* ignore */ }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!raw || !raw.saved || raw.saved.phase === 'over') return null;
    return raw;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ 屏幕切换

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((n) => n.classList.remove('active'));
  $(id).classList.add('active');
}

// ------------------------------------------------------------------ 开局设置

function renderSetup() {
  applyThemeCss(theme);
  // 主题卡
  const cards = $('#themeCards');
  cards.innerHTML = '';
  for (const t of THEMES) {
    const card = document.createElement('div');
    card.className = 'theme-card' + (t.id === config.themeId ? ' selected' : '');
    const p = t.palette;
    card.innerHTML = `
      <h3>${t.icon} ${t.name}</h3>
      <div class="t-swatches">
        <i style="background:${p.red}"></i><i style="background:${p.yellow}"></i>
        <i style="background:${p.blue}"></i><i style="background:${p.green}"></i>
      </div>
      <div class="t-pieces">${SEAT_ORDER.map((s) => t.pieces[s].emoji).join(' ')}</div>
      <p class="t-summary">${t.summary}</p>
      <button class="t-more" type="button">展开背景故事 ▾</button>
      <p class="t-story">${t.story}</p>
    `;
    card.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('t-more')) {
        card.classList.toggle('expanded');
        ev.target.textContent = card.classList.contains('expanded') ? '收起背景故事 ▴' : '展开背景故事 ▾';
        return;
      }
      config.themeId = t.id;
      theme = getTheme(t.id);
      applyThemeCss(theme);
      saveConfig();
      renderSetup();
    });
    cards.appendChild(card);
  }
  // 座位行
  const rows = $('#seatRows');
  rows.innerHTML = '';
  for (const seat of SEAT_ORDER) {
    const cfgSeat = config.seats[seat];
    const row = document.createElement('div');
    row.className = 'seat-row';
    row.innerHTML = `
      <span class="seat-dot" style="background:var(--c-${seat})"></span>
      <input type="text" maxlength="10" placeholder="${seatLabel(theme, seat)}" value="${cfgSeat.name || ''}" data-seat="${seat}">
      <select data-seat="${seat}">
        <option value="human"${cfgSeat.type === 'human' ? ' selected' : ''}>玩家</option>
        <option value="cpu"${cfgSeat.type === 'cpu' ? ' selected' : ''}>电脑</option>
        <option value="off"${cfgSeat.type === 'off' ? ' selected' : ''}>关闭</option>
      </select>
    `;
    row.querySelector('input').addEventListener('input', (ev) => {
      config.seats[seat].name = ev.target.value;
      saveConfig();
    });
    row.querySelector('select').addEventListener('change', (ev) => {
      config.seats[seat].type = ev.target.value;
      saveConfig();
    });
    rows.appendChild(row);
  }
  $('#levelSelect').value = config.level;
  // 恢复横幅
  const saved = loadSave();
  const banner = $('#resumeBanner');
  if (saved) {
    banner.hidden = false;
    const t = getTheme(saved.config && saved.config.themeId);
    $('#resumeText').textContent = `检测到未完成的「${t.name}」对局（进行到第 ${saved.saved.log.length} 条事件）。`;
  } else {
    banner.hidden = true;
  }
}

function startGameFromConfig() {
  const seats = SEAT_ORDER.filter((s) => config.seats[s].type !== 'off');
  if (seats.length < 2) {
    $('#setupError').textContent = '至少需要 2 个座位参战（把「关闭」改回玩家或电脑）。';
    return;
  }
  $('#setupError').textContent = '';
  clearSave();
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  rng = createRng(seed);
  const players = Object.fromEntries(seats.map((s) => [s, {
    type: config.seats[s].type,
    name: (config.seats[s].name || '').trim() || seatLabel(theme, s),
  }]));
  game = createGame({ seats, players, rng });
  enterGameScreen();
}

function resumeGame() {
  const saved = loadSave();
  if (!saved) return;
  config = loadConfig();
  config.themeId = (saved.config && saved.config.themeId) || config.themeId;
  config.seats = { ...config.seats, ...((saved.config && saved.config.seats) || {}) };
  theme = getTheme(config.themeId);
  applyThemeCss(theme);
  rng = createRng(0);
  rng.setState(saved.rngState || 0);
  game = hydrateState(saved.saved, { rng });
  enterGameScreen();
}

// ------------------------------------------------------------------ 对局页

let lastLogSeq = 0;

function enterGameScreen() {
  showScreen('#screen-game');
  board.setTheme(theme);
  lastLogSeq = 0;
  $('#logBox').innerHTML = '';
  // 恢复对局时回放最近 30 条事件，续上日志上下文
  if (game.log.length) {
    for (const e of game.log.slice(-30)) appendLog($('#logBox'), formatEvent(theme, game, e));
    lastLogSeq = game.log[game.log.length - 1].seq;
  }
  $('#diceFace').classList.remove('rolling');
  renderDiceFace(null);
  renderAll();
  drive();
}

function renderAll() {
  board.render(game);
  updatePanel();
}

function updatePanel() {
  const seat = game.turn;
  const player = game.players[seat];
  board.renderActive(game.phase === 'over' ? null : seat);
  $('#turnDot').style.background = `var(--c-${seat})`;
  $('#turnName').textContent = player.name;
  $('#turnSub').textContent = `（${seatLabel(theme, seat)}）· ${player.type === 'cpu' ? `电脑 · ${levelName(config.level)}` : '本机玩家'}`;
  $('#diceHint').textContent = game.phase === 'roll'
    ? (player.type === 'cpu' ? '电脑思考中…' : '轮到你了，掷骰出发！')
    : game.phase === 'move' ? '选择高亮的飞机行动' : '对局结束';
  $('#btnRoll').disabled = busy || game.phase !== 'roll' || player.type === 'cpu';
  // 座位进度
  const list = $('#seatProgress');
  list.innerHTML = '';
  const maxDist = (ARRIVE_STEP + 1) * 4;
  for (const s of game.seats) {
    const { arrived, distance } = progressOf(game, s);
    const row = document.createElement('div');
    row.className = 'sp-row' + (s === seat && game.phase !== 'over' ? ' current' : '');
    row.innerHTML = `
      <span class="sp-dot" style="background:var(--c-${s})"></span>
      <span class="sp-name">${game.players[s].name}</span>
      <span class="sp-bar"><i style="width:${Math.round((distance / maxDist) * 100)}%;background:var(--c-${s})"></i></span>
      <span class="sp-arrived">${arrived}/4</span>
    `;
    list.appendChild(row);
  }
}

function levelName(level) {
  return { easy: '简单', normal: '普通', hard: '困难' }[level] || level;
}

function pushEvents(events) {
  const box = $('#logBox');
  for (const e of events) {
    if (e.seq <= lastLogSeq) continue;
    lastLogSeq = e.seq;
    appendLog(box, formatEvent(theme, game, e));
  }
}

function setStatus(text) {
  $('#statusLine').textContent = text || '';
}

// ------------------------------------------------------------------ 驱动循环

async function drive() {
  if (!game || busy) return;
  if (game.phase === 'over') { showResult(); return; }
  const seat = game.turn;
  const player = game.players[seat];
  updatePanel();
  setStatus('');

  if (game.phase === 'roll') {
    if (player.type === 'cpu') {
      await delay(700);
      if (game.phase === 'roll' && game.turn === seat) await doRoll();
    }
    return; // 玩家等待点击「掷骰」
  }

  if (game.phase === 'move') {
    const moves = legalMoves(game);
    if (!moves.length) { drive(); return; }
    const previews = moves.map((m) => ({
      seat, plane: m.plane, move: m,
      chain: previewMove(game, m.plane).chain,
    }));
    board.renderPreview(previews);
    if (player.type === 'cpu') {
      await delay(650);
      if (game.phase !== 'move' || game.turn !== seat) return;
      const mv = chooseAction(game, seat, { level: config.level, rng });
      if (mv) await doMove(mv.plane);
      return;
    }
    if (moves.length === 1) {
      setStatus('唯一可动的飞机，自动执行…');
      await delay(600);
      if (game.phase === 'move' && game.turn === seat) await doMove(moves[0].plane);
    } else {
      setStatus(`请点击要行动的飞机（${moves.length} 架可动）`);
    }
  }
}

async function doRoll() {
  if (busy || !game || game.phase !== 'roll') return;
  busy = true;
  $('#btnRoll').disabled = true;
  try {
    // 骰子动画：约 1s，随机翻面后落定
    const face = $('#diceFace');
    face.classList.add('rolling');
    const spin = setInterval(() => {
      renderDiceFace(1 + Math.floor(Math.random() * 6));
    }, 90);
    await delay(1000);
    clearInterval(spin);
    const { state, events, dice, moves } = rollDice(game);
    game = state;
    face.classList.remove('rolling');
    renderDiceFace(dice);
    pushEvents(events);
    board.render(game);
    updatePanel();
    saveGame();
    if (!moves.length) setStatus('无可行动飞机，自动过。');
  } finally {
    busy = false;
    drive();
  }
}

async function doMove(planeIdx) {
  if (busy || !game || game.phase !== 'move') return;
  busy = true;
  board.clearPreview();
  const seat = game.turn;
  try {
    const { state, events } = applyMove(game, planeIdx);
    // 先动画（棋子层仍是旧布局），结束后再全量重绘
    await board.animateMove({ state, events, seat, plane: planeIdx });
    game = state;
    const planeName = planeLabel(theme, seat, planeIdx);
    setStatus(`${game.players[seat].name} · ${planeName} 行动完毕`);
    pushEvents(events);
    updatePanel();
    saveGame();
  } finally {
    // 无论动画是否异常都释放busy，避免整局卡死
    busy = false;
    drive();
  }
}

// ------------------------------------------------------------------ 结算

function showResult() {
  clearSave();
  const ranking = game.ranking.length ? game.ranking : game.seats;
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const list = $('#rankList');
  list.innerHTML = '';
  const maxDist = (ARRIVE_STEP + 1) * 4;
  ranking.forEach((seat, i) => {
    const { arrived, distance } = progressOf(game, seat);
    const row = document.createElement('div');
    row.className = 'rank-row' + (i === 0 ? ' champion' : '');
    row.innerHTML = `
      <span class="rank-medal">${medals[i] || '·'}</span>
      <div class="rank-info">
        <div class="rank-name">
          <span class="sp-dot" style="background:var(--c-${seat})"></span>
          ${game.players[seat].name}（${seatLabel(theme, seat)}）
        </div>
        <div class="rank-bar"><i style="width:${Math.round((distance / maxDist) * 100)}%;background:var(--c-${seat})"></i></div>
      </div>
      <span class="rank-stat">到达 ${arrived}/4 · 里程 ${distance}</span>
    `;
    list.appendChild(row);
  });
  $('#resultTitle').textContent = themeCopy(theme, 'win', {
    seat: game.players[ranking[0]].name,
  }) || `${game.players[ranking[0]].name} 获胜！`;
  $('#resultSub').textContent = `「${theme.name}」对局共 ${game.log.length} 条事件 · 第一名完成即结算`;
  showScreen('#screen-result');
}

// ------------------------------------------------------------------ 导出

async function exportGame() {
  if (!game) return;
  const payload = {
    plugin: 'otools-feixingqi',
    exportedAt: new Date().toISOString(),
    theme: theme.id,
    config,
    state: serializeState(game),
    log: game.log,
  };
  const text = JSON.stringify(payload, null, 2);
  const name = `飞行棋对局-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    if (window.otoolsPlugin && window.otoolsPlugin.available()) {
      const path = await window.otoolsPlugin.saveText(name, text);
      setStatus(path ? `已导出：${path}` : '已取消导出');
      return;
    }
  } catch (e) {
    setStatus(`宿主导出失败：${e.message}，改为浏览器下载`);
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  setStatus('已通过浏览器下载对局记录');
}

// ------------------------------------------------------------------ 事件绑定与启动

function bind() {
  $('#btnStart').addEventListener('click', startGameFromConfig);
  $('#btnResume').addEventListener('click', resumeGame);
  $('#btnDiscard').addEventListener('click', () => { clearSave(); renderSetup(); });
  $('#btnRoll').addEventListener('click', doRoll);
  $('#btnExport').addEventListener('click', exportGame);
  $('#btnBackSetup').addEventListener('click', () => {
    if (game && game.phase !== 'over' && !confirm('返回设置将保留当前对局存档，可稍后继续。确定？')) return;
    showScreen('#screen-setup');
    renderSetup();
  });
  $('#btnRestart').addEventListener('click', () => {
    if (!confirm('放弃当前对局并重新开局？')) return;
    clearSave();
    startGameFromConfig();
  });
  $('#btnAgain').addEventListener('click', () => startGameFromConfig());
  $('#btnToSetup').addEventListener('click', () => { showScreen('#screen-setup'); renderSetup(); });
  $('#levelSelect').addEventListener('change', (ev) => {
    config.level = ev.target.value;
    saveConfig();
  });
  board.onPlaneClick((seat, plane) => {
    if (busy || !game || game.phase !== 'move') return;
    if (seat !== game.turn) return;
    if (game.players[seat].type === 'cpu') return;
    if (!legalMoves(game).some((m) => m.plane === plane)) return;
    doMove(plane);
  });
}

function init() {
  applyThemeCss(theme);
  bind();
  renderSetup();
  showScreen('#screen-setup');
}

init();
