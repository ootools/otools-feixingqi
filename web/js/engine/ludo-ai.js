/**
 * 飞行棋 AI（纯函数、无 DOM、随机源可注入）。
 * ------------------------------------------------------------------
 * chooseAction(state, seatId, {level, rng}) → 合法动作之一（legalMoves 的元素）
 * 或 null（当前无动作可选）。
 *
 * 评分制（normal/hard）：
 *   撞机 +900×对方损失机数 > 精确到达机场 +1000 > 起飞 +500 >
 *   连跳/飞线 +300 > 进入终点引道 +150 > 形成叠子 +100 > 前进里程。
 *   危险规避：落点主环后方 1..6 格内有敌机（或落点恰为敌机起飞格）时，
 *   按距离加权扣分；己方棋子当前处于危险格且能移出则加分。
 * 难度：
 *   easy   —— 忽略危险项，评分前 3 里按注入随机源挑一个；
 *   normal —— 完整评分，取最高分（平分时按机号顺序，确定性可复现）；
 *   hard   —— 完整评分 + 对前 5 候选拟合下一家掷骰 1..6 的最坏回应
 *             （1 层期望校验：期望被撞/被到达的损失从评分中扣除）。
 */

import {
  SEAT_START, RING_SIZE, legalMoves, applyMove, withDice, progressOf,
} from './ludo.js';

const SCORE = {
  capturePerPlane: 900,
  arrive: 1000,
  takeoff: 500,
  chain: 300,
  runway: 150,
  stack: 100,
};

/** 距离 d(1..6) 的威胁权重：越近越危险。 */
function threatWeight(d) {
  return 130 - 20 * d;
}

function cellOf(seat, step) {
  return (SEAT_START[seat] + step) % RING_SIZE;
}

/**
 * abs 格所受的全部敌方威胁权重（下一轮内能打到该格的敌机，
 * 含仍在机库、掷 6 即可落在我格上的敌机）。
 */
function threatAt(state, seat, abs) {
  let weight = 0;
  for (const other of state.seats) {
    if (other === seat) continue;
    state.planes[other].forEach((step) => {
      if (step == null) {
        if (abs === SEAT_START[other]) weight += threatWeight(6);
      } else if (step <= 49) {
        const d = (abs - cellOf(other, step) + RING_SIZE) % RING_SIZE;
        if (d >= 1 && d <= 6) weight += threatWeight(d);
      }
    });
  }
  return weight;
}

/** 从事件流提取即时收益。 */
function immediateScore(events, seat) {
  let score = 0;
  let chainSeen = false;
  let runwaySeen = false;
  for (const e of events) {
    if (e.type === 'capture' && e.by === seat) score += SCORE.capturePerPlane * e.count;
    else if (e.type === 'arrive' && e.seat === seat) score += SCORE.arrive;
    else if (e.type === 'takeoff' && e.seat === seat) score += SCORE.takeoff;
    else if ((e.type === 'jump' || e.type === 'fly') && e.seat === seat && !chainSeen) {
      chainSeen = true;
      score += SCORE.chain;
    } else if (e.type === 'runway' && e.seat === seat && !runwaySeen) {
      runwaySeen = true;
      score += SCORE.runway;
    } else if (e.type === 'stack' && e.seat === seat) score += SCORE.stack;
  }
  return score;
}

/**
 * 单个候选动作的完整评分。
 * 落点危险 = 落点上全部己方机数 × 威胁权重（叠子被撞损失更大）。
 */
function scoreMove(state, move, { considerDanger }) {
  const seat = state.turn;
  const stepBefore = state.planes[seat][move.plane];
  const dangerBefore = considerDanger && stepBefore != null && stepBefore <= 49
    ? threatAt(state, seat, cellOf(seat, stepBefore))
    : 0;
  const { state: next, events, chain } = applyMove(state, move.plane);
  const gain = immediateScore(events, seat);
  const stepAfter = next.planes[seat][move.plane];
  // 前进里程：机库起飞记 1；引道反弹可能为负。
  const progress = (stepAfter == null ? 0 : stepAfter + 1) - (stepBefore == null ? -1 : stepBefore + 1);

  let score = gain + progress;
  if (considerDanger) {
    const last = chain[chain.length - 1];
    if (last && last.zone === 'ring') {
      const own = next.planes[seat].filter(
        (s) => s != null && s <= 49 && cellOf(seat, s) === last.abs,
      ).length;
      score -= threatAt(next, seat, last.abs) * Math.min(own, 4);
    }
    if (dangerBefore > 0) score += Math.min(dangerBefore * 0.6, 240); // 移出危险格
  }
  return { move, score, next };
}

/** hard：下一家掷骰 1..6 的最坏回应期望收益（对我方而言是损失）。 */
function expectedOpponentGain(nextState) {
  const seat = nextState.turn; // 已轮到下一家
  let sum = 0;
  for (let dice = 1; dice <= 6; dice += 1) {
    const sim = withDice(nextState, dice);
    let best = 0;
    for (const mv of legalMoves(sim)) {
      const { events } = applyMove(sim, mv.plane);
      let gain = 0;
      for (const e of events) {
        if (e.type === 'capture' && e.by === seat) gain += SCORE.capturePerPlane * e.count;
        else if (e.type === 'arrive' && e.seat === seat) gain += SCORE.arrive;
        else if (e.type === 'takeoff' && e.seat === seat) gain += SCORE.takeoff;
      }
      if (gain > best) best = gain;
    }
    sum += best;
  }
  return sum / 6;
}

/**
 * 为 seatId 选择动作。state 须处于 phase 'move'（骰点已定）且轮到 seatId。
 * @param {object} state 引擎状态
 * @param {string} seatId 座位
 * @param {{level?:'easy'|'normal'|'hard', rng?:()=>number}} opts
 * @returns {{plane:number, kind:string}|null}
 */
export function chooseAction(state, seatId, opts = {}) {
  const level = opts.level || 'normal';
  const rng = opts.rng || state.rng || Math.random;
  if (state.phase !== 'move' || state.turn !== seatId) return null;
  const moves = legalMoves(state);
  if (!moves.length) return null;

  const considerDanger = level !== 'easy';
  const scored = moves.map((m) => scoreMove(state, m, { considerDanger }));
  scored.sort((a, b) => b.score - a.score || a.move.plane - b.move.plane);

  if (level === 'easy') {
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[rng.int ? rng.int(top.length) : Math.floor(rng() * top.length)].move;
  }
  if (level === 'hard') {
    const top = scored.slice(0, Math.min(5, scored.length));
    for (const c of top) c.score -= expectedOpponentGain(c.next);
    top.sort((a, b) => b.score - a.score || a.move.plane - b.move.plane);
    return top[0].move;
  }
  return scored[0].move;
}

/** 座位进度便捷出口（UI 结算面板用）。 */
export function seatProgress(state, seat) {
  return progressOf(state, seat);
}
