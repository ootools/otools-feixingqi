/**
 * 棋盘渲染（SVG，随窗口缩放；主题换肤走 CSS 变量）。
 * ------------------------------------------------------------------
 * 盘面几何（15×15 格栅，每格 40，viewBox 600×600）：
 *   - 主环 52 格 = 4 条臂 × 13（臂 = 左列 6 + 顶点 1 + 右列 6），顺时针。
 *   - 4 条 6 格引道从各臂顶点折向中央枢纽；中央为到达枢纽。
 *   - 四角 6×6 区域为机库（机场），各 4 个泊位。
 *   - 虚线飞线：入口 → 十字交叉格 → 终点（+12）的折线。
 * 座位与臂位（顺时针 red→yellow→blue→green）：red=上(机库右上)、
 * yellow=右(机库右下)、blue=下(机库左下)、green=左(机库左上)。
 */

import {
  SEAT_START, SEAT_TIP, FLY_ENTRY_STEPS, RING_SIZE, RUNWAY_LEN,
  stepToAbs, ringColorOf, flyCrossOf, flyDestOf, runwayCellOf,
  ARRIVE_STEP, PLANES_PER_SEAT, SEAT_ORDER,
} from '../engine/ludo.js';
import { seatLabel } from '../../data/themes.js';

const CELL = 40;
const HALF = CELL / 2;
const px = (col) => col * CELL + HALF;
const py = (row) => row * CELL + HALF;

/** 主环 52 格的格栅坐标（index 0 = (6,0)，顺时针）。 */
function buildRing() {
  const cells = [];
  const push = (col, row) => cells.push({ col, row });
  push(6, 0); push(7, 0); push(8, 0);
  for (let r = 1; r <= 5; r += 1) push(8, r);
  for (let c = 9; c <= 14; c += 1) push(c, 6);
  push(14, 7);
  for (let c = 14; c >= 9; c -= 1) push(c, 8);
  for (let r = 9; r <= 14; r += 1) push(8, r);
  push(7, 14);
  for (let r = 14; r >= 9; r -= 1) push(6, r);
  for (let c = 5; c >= 0; c -= 1) push(c, 8);
  push(0, 7);
  for (let c = 0; c <= 5; c += 1) push(c, 6);
  for (let r = 5; r >= 1; r -= 1) push(6, r);
  return cells; // 长度 52
}

const RING = buildRing();
const RUNWAY_CELLS = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
};
const HANGAR_SLOTS = {
  red: [[10, 1], [12, 1], [10, 4], [12, 4]],
  yellow: [[10, 10], [12, 10], [10, 13], [12, 13]],
  blue: [[2, 10], [4, 10], [2, 13], [4, 13]],
  green: [[2, 1], [4, 1], [2, 4], [4, 4]],
};
const HANGAR_RECTS = {
  red: { x: 366, y: 6, w: 228, h: 228 },
  yellow: { x: 366, y: 366, w: 228, h: 228 },
  blue: { x: 6, y: 366, w: 228, h: 228 },
  green: { x: 6, y: 6, w: 228, h: 228 },
};
const HUB = { x: 300, y: 300, r: 56 };
/** 到达机位（枢纽内按座位象限的 2×2 微缩位）。 */
const ARRIVE_BASE = { red: [300, 281], yellow: [319, 300], blue: [300, 319], green: [281, 300] };
const ARRIVE_OFFSETS = [[-7, -7], [7, -7], [-7, 7], [7, 7]];

function ringPx(abs) {
  const c = RING[((abs % RING_SIZE) + RING_SIZE) % RING_SIZE];
  return [px(c.col), py(c.row)];
}
function runwayPx(seat, step) {
  const c = RUNWAY_CELLS[seat][runwayCellOf(step) - 1];
  return [px(c[0]), py(c[1])];
}
function hangarPx(seat, plane) {
  const c = HANGAR_SLOTS[seat][plane];
  return [px(c[0]), py(c[1])];
}
function arrivePx(seat, plane) {
  const b = ARRIVE_BASE[seat];
  const o = ARRIVE_OFFSETS[plane % 4];
  return [b[0] + o[0], b[1] + o[1]];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/** 同格多机的错位（2×2 微缩）。 */
const STACK_OFFSETS = [[-8, -7], [8, -7], [-8, 8], [8, 8]];

export function createBoard(container) {
  const svg = el('svg', { viewBox: '0 0 600 600', class: 'board-svg', 'aria-label': '飞行棋棋盘' });
  container.appendChild(svg);

  // ---------------- 静态骨架
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <pattern id="pat-waves" width="80" height="64" patternUnits="userSpaceOnUse">
      <path d="M0 16 Q20 4 40 16 T80 16 M0 48 Q20 36 40 48 T80 48" fill="none" stroke="rgba(255,255,255,.045)" stroke-width="3"/>
    </pattern>
    <pattern id="pat-leaves" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M36 8 C52 20 52 40 36 52 C20 40 20 20 36 8 Z" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="2.5"/>
      <line x1="36" y1="12" x2="36" y2="50" stroke="rgba(255,255,255,.05)" stroke-width="2"/>
    </pattern>
    <pattern id="pat-dunes" width="96" height="56" patternUnits="userSpaceOnUse">
      <path d="M-6 40 Q24 14 54 40 T114 40 M-6 20 Q30 -2 66 20" fill="none" stroke="rgba(255,255,255,.045)" stroke-width="3"/>
    </pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="context-stroke"></path>
    </marker>
  `;

  const gBg = el('g', {}, svg);
  el('rect', { x: 0, y: 0, width: 600, height: 600, class: 'board-bg' }, gBg);
  const patRect = el('rect', { x: 0, y: 0, width: 600, height: 600, 'pattern-units': 'userSpaceOnUse' }, gBg);

  const gFly = el('g', { class: 'fly-lines' }, svg);
  const gHangar = el('g', { class: 'hangars' }, svg);
  const gCells = el('g', { class: 'cells' }, svg);
  const gHub = el('g', { class: 'hub' }, svg);
  const gPreview = el('g', { class: 'preview' }, svg);
  const gPlanes = el('g', { class: 'planes' }, svg);
  const gFx = el('g', { class: 'fx' }, svg);

  let theme = null;
  let planeClickCb = null;
  let activeSeat = null;
  const planeEls = new Map(); // `${seat}:${plane}` -> <g>

  // ---------------- 构建盘面
  function buildStatic() {
    // 机库
    for (const seat of SEAT_ORDER) {
      const r = HANGAR_RECTS[seat];
      const g = el('g', { class: `hangar hangar-${seat}` }, gHangar);
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 22, class: `hangar-box fill-${seat}` }, g);
      el('text', {
        x: r.x + r.w / 2, y: r.y + r.h - 14, 'text-anchor': 'middle', class: `hangar-label ink-${seat}`,
      }, g).textContent = '';
      for (const [c, rw] of HANGAR_SLOTS[seat]) {
        el('circle', { cx: px(c), cy: py(rw), r: 16, class: 'hangar-slot' }, g);
      }
    }
    // 主环格
    for (let i = 0; i < RING_SIZE; i += 1) {
      const c = RING[i];
      const color = ringColorOf(i);
      const cls = ['ring-cell', `line-${color}`].join(' ');
      el('rect', {
        x: c.col * CELL + 2, y: c.row * CELL + 2, width: CELL - 4, height: CELL - 4,
        rx: 8, class: cls, 'data-abs': i,
      }, gCells);
    }
    // 飞线入口标记（虚线框 + 小飞机）
    for (const seat of SEAT_ORDER) {
      for (const s of FLY_ENTRY_STEPS) {
        const abs = stepToAbs(seat, s);
        const c = RING[abs];
        el('rect', {
          x: c.col * CELL + 5.5, y: c.row * CELL + 5.5, width: CELL - 11, height: CELL - 11,
          rx: 6, class: `fly-entry dashed-${seat}`,
        }, gCells);
      }
    }
    // 引道
    for (const seat of SEAT_ORDER) {
      RUNWAY_CELLS[seat].forEach(([c, r], idx) => {
        el('rect', {
          x: c * CELL + 2, y: r * CELL + 2, width: CELL - 4, height: CELL - 4, rx: 8,
          class: `runway-cell fill-${seat}`, opacity: idx === RUNWAY_LEN - 1 ? 0.95 : 1,
        }, gCells);
      });
    }
    // 起飞格（粗描边 + 星标）与跑道入口箭头
    for (const seat of SEAT_ORDER) {
      const startAbs = SEAT_START[seat];
      const c = RING[startAbs];
      el('rect', {
        x: c.col * CELL + 1, y: c.row * CELL + 1, width: CELL - 2, height: CELL - 2, rx: 9,
        class: `start-cell strong-${seat}`,
      }, gCells);
      el('text', { x: px(c.col), y: py(c.row) + 5, 'text-anchor': 'middle', class: 'start-mark' }, gCells).textContent = '✈';
      const tip = RING[SEAT_TIP[seat]];
      const rw0 = RUNWAY_CELLS[seat][0];
      el('line', {
        x1: px(tip.col), y1: py(tip.row), x2: px(rw0[0]), y2: py(rw0[1]),
        class: `tip-arrow stroke-${seat}`, 'marker-end': 'url(#arrow)',
      }, gCells);
    }
    // 飞线（入口 → 交叉格 → 终点 折线）
    for (const seat of SEAT_ORDER) {
      for (const s of FLY_ENTRY_STEPS) {
        const entry = stepToAbs(seat, s);
        const cross = flyCrossOf(entry);
        const dest = flyDestOf(entry);
        const p1 = ringPx(entry); const p2 = ringPx(cross); const p3 = ringPx(dest);
        el('path', {
          d: `M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]} L${p3[0]} ${p3[1]}`,
          class: `fly-line stroke-${seat}`, 'marker-end': 'url(#arrow)',
        }, gFly);
      }
    }
    // 中央枢纽
    const hub = el('g', {}, gHub);
    el('circle', { cx: HUB.x, cy: HUB.y, r: HUB.r + 4, class: 'hub-ring' }, hub);
    // 四象限色环（每座位的到达指示弧）
    const arc = (seat, x0, y0, x1, y1) => `M${x0} ${y0} A${HUB.r} ${HUB.r} 0 0 1 ${x1} ${y1}`;
    el('path', { d: arc('red', 300 - HUB.r * 0.7071, 300 - HUB.r * 0.7071, 300 + HUB.r * 0.7071, 300 - HUB.r * 0.7071), class: 'hub-arc stroke-red' }, hub);
    el('path', { d: arc('yellow', 300 + HUB.r * 0.7071, 300 - HUB.r * 0.7071, 300 + HUB.r * 0.7071, 300 + HUB.r * 0.7071), class: 'hub-arc stroke-yellow' }, hub);
    el('path', { d: arc('blue', 300 + HUB.r * 0.7071, 300 + HUB.r * 0.7071, 300 - HUB.r * 0.7071, 300 + HUB.r * 0.7071), class: 'hub-arc stroke-blue' }, hub);
    el('path', { d: arc('green', 300 - HUB.r * 0.7071, 300 + HUB.r * 0.7071, 300 - HUB.r * 0.7071, 300 - HUB.r * 0.7071), class: 'hub-arc stroke-green' }, hub);
    el('circle', { cx: HUB.x, cy: HUB.y, r: 15, class: 'hub-core' }, hub);
    el('text', { x: HUB.x, y: HUB.y + 6, 'text-anchor': 'middle', class: 'hub-mark' }, hub).textContent = '✈';
  }

  buildStatic();

  // ---------------- 主题
  function setTheme(t) {
    theme = t;
    patRect.setAttribute('fill', `url(#pat-${t.pattern})`);
    for (const seat of SEAT_ORDER) {
      const label = svg.querySelector(`.hangar-${seat} .hangar-label`);
      if (label) label.textContent = seatLabel(t, seat);
    }
  }

  // ---------------- 棋子渲染
  function planePos(state, seat, plane) {
    const step = state.planes[seat][plane];
    if (step == null) return { zone: 'hangar', pt: hangarPx(seat, plane) };
    if (step === ARRIVE_STEP) return { zone: 'arrived', pt: arrivePx(seat, plane) };
    if (step <= 49) return { zone: 'ring', pt: ringPx(stepToAbs(seat, step)) };
    return { zone: 'runway', pt: runwayPx(seat, step) };
  }

  function setTransform(node, [x, y], scale = 1) {
    node.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }

  /** 全量重绘棋子层（含同格错位与叠子角标）。 */
  function render(state) {
    gPlanes.innerHTML = '';
    planeEls.clear();
    // 同格聚合
    const groups = new Map(); // key -> [{seat, plane}]
    for (const seat of state.seats) {
      for (let plane = 0; plane < PLANES_PER_SEAT; plane += 1) {
        const pos = planePos(state, seat, plane);
        const key = pos.zone === 'ring' ? `ring:${pos.pt[0]},${pos.pt[1]}` : `solo:${seat}:${plane}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ seat, plane, pos });
      }
    }
    for (const list of groups.values()) {
      const stacked = list.length > 1;
      list.forEach(({ seat, plane, pos }, i) => {
        const g = el('g', {
          class: `plane plane-${seat}`,
          'data-seat': seat, 'data-plane': plane,
        }, gPlanes);
        const base = stacked ? STACK_OFFSETS[i % 4] : [0, 0];
        const scale = stacked ? 0.78 : 1;
        setTransform(g, [pos.pt[0] + base[0], pos.pt[1] + base[1]], scale);
        el('circle', { r: 15, class: `plane-body fill-${seat}` }, g);
        const emoji = theme && theme.pieces[seat] ? theme.pieces[seat].emoji : '✈';
        el('text', { class: 'plane-emoji', y: 5.5, 'text-anchor': 'middle' }, g).textContent = emoji;
        if (stacked) {
          el('circle', { cx: 11, cy: -11, r: 7.5, class: 'stack-badge' }, g);
          el('text', { x: 11, y: -7.8, 'text-anchor': 'middle', class: 'stack-count' }, g).textContent = list.length;
        }
        g.addEventListener('click', () => planeClickCb && planeClickCb(seat, plane));
        planeEls.set(`${seat}:${plane}`, g);
      });
    }
    // 当前座位机库高亮（由 renderActive 传入座位）
    svg.querySelectorAll('.hangar-box').forEach((n) => n.classList.remove('active'));
    if (activeSeat && state.phase !== 'over') {
      const box = svg.querySelector(`.hangar-${activeSeat} .hangar-box`);
      if (box) box.classList.add('active');
    }
  }

  /** 高亮当前座位的机库（换人/阶段变化时调用）。 */
  function renderActive(seat) {
    activeSeat = seat;
    svg.querySelectorAll('.hangar-box').forEach((n) => n.classList.remove('active'));
    if (!seat) return;
    const box = svg.querySelector(`.hangar-${seat} .hangar-box`);
    if (box) box.classList.add('active');
  }

  function clearPreview() {
    gPreview.innerHTML = '';
  }

  /** 画预览：可动机呼吸圈 + 落点幽灵（chain 末位）+ 链路虚线。 */
  function renderPreview(previews) {
    clearPreview();
    for (const pv of previews) {
      const { seat, plane, chain } = pv;
      const node = planeEls.get(`${seat}:${plane}`);
      if (node && !node.querySelector('.plane-ring')) {
        node.appendChild(el('circle', { r: 15, class: 'plane-ring movable' }));
      }
      if (!chain || !chain.length) continue;
      const last = chain[chain.length - 1];
      let pt = null;
      if (last.zone === 'ring') pt = ringPx(last.abs);
      else if (last.zone === 'runway') pt = runwayPx(seat, last.step);
      else if (last.zone === 'arrived') pt = arrivePx(seat, plane);
      if (!pt) continue;
      el('circle', { cx: pt[0], cy: pt[1], r: 12, class: `ghost fill-${seat}` }, gPreview);
      // 链路虚线（起点 → 各落点）
      const pts = [];
      for (const stop of chain) {
        if (stop.zone === 'ring') pts.push(ringPx(stop.abs));
        else if (stop.zone === 'runway') pts.push(runwayPx(seat, stop.step));
      }
      if (pts.length > 1) {
        el('path', {
          d: `M${pts.map((p) => p.join(' ')).join(' L')}`,
          class: `preview-line stroke-${seat}`,
        }, gPreview);
      }
    }
  }

  // ---------------- 动画
  // 计时器驱动的补间：后台标签页 rAF 会被冻结，setTimeout 保证动画必然收敛；
  // 页面不可见时直接跳帧到终点，避免后台对局卡住。
  function tween(node, from, to, ms, { lift = false } = {}) {
    return new Promise((resolve) => {
      if (typeof document !== 'undefined' && document.hidden) {
        setTransform(node, to, 1);
        resolve();
        return;
      }
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        const x = from[0] + (to[0] - from[0]) * t;
        const y = from[1] + (to[1] - from[1]) * t;
        const s = (lift ? 1 + 0.28 * Math.sin(Math.PI * t) : 1);
        setTransform(node, [x, y], s);
        if (t < 1) setTimeout(step, 16);
        else resolve();
      };
      step();
    });
  }

  function flashCellAbs(abs, seat) {
    const cell = gCells.querySelector(`[data-abs="${abs}"]`);
    if (!cell) return;
    const halo = el('rect', {
      x: cell.getAttribute('x'), y: cell.getAttribute('y'),
      width: cell.getAttribute('width'), height: cell.getAttribute('height'),
      rx: 8, class: `flash flash-${seat}`,
    }, gFx);
    setTimeout(() => halo.remove(), 700);
  }

  /**
   * 沿事件链动画移动一架飞机。
   * @param {object} args {state(最终态), events, chain, seat, plane}
   */
  async function animateMove({ state, events, seat, plane }) {
    const node = planeEls.get(`${seat}:${plane}`);
    if (!node) { render(state); return; }
    clearPreview();
    // 抬到最上层
    gPlanes.appendChild(node);
    const seq = [];
    for (const e of events) {
      if (e.seat !== seat) continue;
      if (e.type === 'move') {
        for (let s = e.from + 1; s <= e.to; s += 1) {
          if (s === ARRIVE_STEP) seq.push({ kind: 'step', pt: arrivePx(seat, plane) });
          else seq.push({ kind: 'step', pt: s <= 49 ? ringPx(stepToAbs(seat, s)) : runwayPx(seat, s) });
        }
      } else if (e.type === 'jump' || e.type === 'fly') {
        seq.push({ kind: e.type === 'fly' ? 'fly' : 'jump', pt: ringPx(e.to), cross: e.cross });
      } else if (e.type === 'bounce') {
        for (let s = e.from - 1; s >= e.to; s -= 1) {
          seq.push({ kind: 'step', pt: runwayPx(seat, s) });
        }
      } else if (e.type === 'arrive') {
        seq.push({ kind: 'step', pt: arrivePx(seat, plane) });
      }
    }
    // 逐步动画（第一步从当前实际位置出发，起飞时即机库泊位）
    for (const seg of seq) {
      const cur = (node.getAttribute('transform') || '').match(/translate\(([-\d.]+) ([-\d.]+)/);
      const fromPt = cur ? [parseFloat(cur[1]), parseFloat(cur[2])] : seg.pt;
      await tween(node, fromPt, seg.pt, seg.kind === 'fly' ? 320 : seg.kind === 'jump' ? 240 : 150, { lift: seg.kind !== 'step' });
      if (seg.cross != null) flashCellAbs(seg.cross, seat);
    }
    // 动画后全量重绘，处理叠子错位等最终布局
    render(state);
  }

  function onPlaneClick(cb) { planeClickCb = cb; }

  return { setTheme, render, renderActive, renderPreview, clearPreview, animateMove, onPlaneClick, svg };
}
