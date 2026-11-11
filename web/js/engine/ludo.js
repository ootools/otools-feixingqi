/**
 * 飞行棋规则引擎（标准中国飞行棋）。
 * ------------------------------------------------------------------
 * 纯函数、无 DOM 依赖，node --test 可直接 import；随机源从外部注入
 * （createGame({rng}) 或 rollDice(state, rng)），测试用种子即可复现整局。
 *
 * 盘面模型（抽象坐标，与 UI 几何完全解耦）：
 *   - 主环 52 格，index 0..51，顺时针行进。
 *   - 座位顺序 red(红) → yellow(黄) → blue(蓝) → green(绿)，即 index 递增方向。
 *   - 各座位起点格（起飞格）：red=4、yellow=17、blue=30、green=43；
 *     格子颜色 ringColorOf(i) = SEAT_ORDER[i % 4]，因此每格必属一色，
 *     己方颜色格恰好每 4 格一个（连跳 +4 的来源）。
 *   - 每机的「个人步数」step：
 *       null      机库（未起飞）
 *       0..49     主环（起点格为 0；49 = 己方跑道入口格，即 start+49）
 *       50..55    终点引道第 1..6 格（须整点进入，超出反弹）
 *       56        到达机场（ARRIVE_STEP）
 *   - 飞线捷径：每色固定 3 个入口格（个人步数 12/24/36），踏上（掷骰落点）
 *     则飞越 +12 再跳 +4；由连跳 +4 落到入口则只飞越 +12、不再跳。
 *     飞行途中越过「十字交叉格」(入口 +6) 时，该格敌方棋子一并撞回机场。
 *   - 撞机：任何落点（含连跳/飞线后的落点、起飞落点）若有敌方棋子则全部
 *     送回机库；己方棋子同格形成叠子（≤4），叠子被撞全体返回（规则变体，
 *     见 README）。
 *   - 掷 6：可起飞；起飞/移动后奖励再掷一次；一回合内奖励掷骰上限 3 次。
 *   - 无法行动（全部在机库且未掷 6）自动过；引道内不受撞机影响；
 *     第一名 4 机全部到达即结算，其余按（到达数, 总里程）排名。
 */

export const RING_SIZE = 52;
export const RUNWAY_LEN = 6;
export const PLANES_PER_SEAT = 4;
export const JUMP_DIST = 4;
export const FLY_DIST = 12;
export const DICE_MIN = 1;
export const DICE_MAX = 6;
/** 一回合内最多奖励掷骰次数（不含本回合第一次掷骰）。 */
export const MAX_BONUS_ROLLS = 3;
/** 个人步数：到达机场。 */
export const ARRIVE_STEP = 49 + RUNWAY_LEN + 1; // 56

export const SEAT_ORDER = ['red', 'yellow', 'blue', 'green'];
/** 各座位起飞格（主环 index）。 */
export const SEAT_START = { red: 4, yellow: 17, blue: 30, green: 43 };
/** 各座位跑道入口格（主环 index，= 起点格 +49），经过它即转入引道。 */
export const SEAT_TIP = { red: 1, yellow: 14, blue: 27, green: 40 };
/** 飞线入口所在「个人步数」（每色固定 3 个）。 */
export const FLY_ENTRY_STEPS = [12, 24, 36];

// ------------------------------------------------------------------ 坐标换算

/** 主环 index 的颜色（四色每 4 格一循环，每格必属一色）。 */
export function ringColorOf(abs) {
  return SEAT_ORDER[((abs % SEAT_ORDER.length) + SEAT_ORDER.length) % SEAT_ORDER.length];
}

/** 个人步数(0..49) → 主环 index。 */
export function stepToAbs(seat, step) {
  return (SEAT_START[seat] + step) % RING_SIZE;
}

/** 主环 index → 该座位的个人步数(0..51)。 */
export function absToStep(seat, abs) {
  return (((abs - SEAT_START[seat]) % RING_SIZE) + RING_SIZE) % RING_SIZE;
}

/** 该主环格是否为 seat 的飞线入口。 */
export function isFlyEntry(seat, abs) {
  return FLY_ENTRY_STEPS.includes(absToStep(seat, abs));
}

/** 飞行途中越过的十字交叉格（入口 +6）。 */
export function flyCrossOf(abs) {
  return (abs + 6) % RING_SIZE;
}

/** 飞线终点（入口 +12）。 */
export function flyDestOf(abs) {
  return (abs + FLY_DIST) % RING_SIZE;
}

/** 引道内个人步数(50..55) → 第几格(1..6)。 */
export function runwayCellOf(step) {
  return step - 49;
}

// ------------------------------------------------------------------ 对局创建

const SEAT_DEFAULT_NAMES = { red: '红方', yellow: '黄方', blue: '蓝方', green: '绿方' };

/**
 * 创建一局。
 * @param {object} opts
 *   - seats: 参战座位（SEAT_ORDER 的子集，按先后手顺序），默认四座全开。
 *   - players: { [seat]: {type:'human'|'cpu', name:string} }，缺省为本地玩家。
 *   - rng: () => [0,1)，注入随机源；缺省 Math.random（不可序列化，存档会剥离）。
 */
export function createGame({ seats, players, rng } = {}) {
  const active = seats && seats.length ? [...seats] : [...SEAT_ORDER];
  if (active.length < 2) throw new Error('至少需要 2 个座位参战');
  for (const s of active) {
    if (!SEAT_ORDER.includes(s)) throw new Error(`未知座位：${s}`);
  }
  // 归一为标准先后手顺序，避免调用方传乱序。
  active.sort((a, b) => SEAT_ORDER.indexOf(a) - SEAT_ORDER.indexOf(b));
  const seatPlayers = {};
  for (const s of active) {
    const p = (players && players[s]) || {};
    seatPlayers[s] = {
      type: p.type === 'cpu' ? 'cpu' : 'human',
      name: (p.name && String(p.name).trim()) || SEAT_DEFAULT_NAMES[s],
    };
  }
  return {
    v: 1,
    seats: active,
    players: seatPlayers,
    planes: Object.fromEntries(active.map((s) => [s, [null, null, null, null]])),
    turn: active[0],
    dice: null,
    phase: 'roll', // roll | move | over
    rollsThisTurn: 0,
    ranking: [],
    winner: null,
    log: [],
    lastChain: null,
    rng: rng || Math.random,
  };
}

/** 纯克隆（引擎所有出口都返回新状态，入参不被修改）。 */
function cloneState(state) {
  const { rng, ...rest } = state;
  const next = structuredClone(rest);
  next.rng = rng;
  return next;
}

function logPush(state, events) {
  for (const e of events) {
    state.log.push({ seq: state.log.length + 1, turn: state.turn, ...e });
  }
  if (state.log.length > 400) state.log = state.log.slice(-400);
}

function advanceTurn(state) {
  const idx = state.seats.indexOf(state.turn);
  state.turn = state.seats[(idx + 1) % state.seats.length];
  state.dice = null;
  state.rollsThisTurn = 0;
  state.phase = 'roll';
}

// ------------------------------------------------------------------ 查询

/** 该主环格上所有棋子（跨座位），用于撞机判定与 UI 渲染。 */
export function planesOnRingCell(state, abs) {
  const found = [];
  for (const seat of state.seats) {
    const start = SEAT_START[seat];
    state.planes[seat].forEach((step, plane) => {
      if (step != null && step <= 49 && (start + step) % RING_SIZE === abs) {
        found.push({ seat, plane });
      }
    });
  }
  return found;
}

/** 座位进度：arrived 到达数；distance 总里程（机库 0 / 主环与引道为 step+1 / 到达 57）。 */
export function progressOf(state, seat) {
  let arrived = 0;
  let distance = 0;
  for (const step of state.planes[seat]) {
    if (step == null) continue;
    if (step === ARRIVE_STEP) {
      arrived += 1;
      distance += ARRIVE_STEP + 1;
    } else {
      distance += step + 1;
    }
  }
  return { arrived, distance };
}

/** 当前方在当前骰点下的全部合法动作。 */
export function legalMoves(state) {
  if (state.phase !== 'move' || state.dice == null) return [];
  const moves = [];
  state.planes[state.turn].forEach((step, plane) => {
    if (step == null) {
      if (state.dice === DICE_MAX) moves.push({ plane, kind: 'takeoff' });
    } else if (step <= 49) {
      moves.push({ plane, kind: 'ring' });
    } else if (step <= 55) {
      moves.push({ plane, kind: 'runway' });
    } // step === ARRIVE_STEP：已到达，无动作
  });
  return moves;
}

/**
 * 把状态置为「指定骰点、待行动」——供 AI 做对手最坏回应拟合与测试构面。
 * 纯函数：返回克隆。
 */
export function withDice(state, dice) {
  const next = cloneState(state);
  next.dice = dice;
  if (next.phase === 'roll') next.phase = 'move';
  return next;
}

// ------------------------------------------------------------------ 内部规则件

/** 落点撞机：该格敌方棋子全部返回机库（按受害方分组产出事件）。 */
function captureAt(state, bySeat, abs, events, via) {
  for (const other of state.seats) {
    if (other === bySeat) continue;
    const start = SEAT_START[other];
    const hit = [];
    state.planes[other].forEach((step, plane) => {
      if (step != null && step <= 49 && (start + step) % RING_SIZE === abs) hit.push(plane);
    });
    if (!hit.length) continue;
    for (const plane of hit) state.planes[other][plane] = null;
    events.push({
      type: 'capture',
      by: bySeat,
      seat: other, // 受害方（文案主语）
      cell: abs,
      via: via || 'land', // land | cross | takeoff
      planes: hit,
      count: hit.length,
    });
  }
}

/** 落点己方叠子检查（≥2 架同格即叠子）。 */
function stackEvent(state, seat, abs, events) {
  const start = SEAT_START[seat];
  const count = state.planes[seat].filter(
    (s) => s != null && s <= 49 && (start + s) % RING_SIZE === abs,
  ).length;
  if (count >= 2) events.push({ type: 'stack', seat, cell: abs, count });
}

/**
 * 主环落点结算：撞机 → 同色连跳/飞线链。
 * 链式规则（标准中国飞行棋，维基百科口径）：
 *   - 落点即撞机（路过/跳过不撞）。
 *   - 踏上（掷骰落点）己方飞线入口：飞越 +12（越过交叉格撞机、落点撞机），
 *     落地后再跳 +4（落点撞机）。
 *   - 落在己方普通色格：连跳 +4（落点撞机）；若跳到的恰是飞线入口，
 *     则飞越 +12、不再跳。
 *   - 一次落点至多「一跳一飞」，链必然终止。
 * 调用前移动方棋子须已落位在 abs（叠子统计含自身）。
 * @returns 最终个人步数(0..49)
 */
function resolveLanding(state, seat, plane, abs, events, stops) {
  const placeAt = (toAbs) => {
    const s = absToStep(seat, toAbs);
    state.planes[seat][plane] = s;
    return s;
  };
  captureAt(state, seat, abs, events);
  if (ringColorOf(abs) !== seat) {
    stackEvent(state, seat, abs, events);
    return absToStep(seat, abs);
  }

  const landStep = (toAbs, fromAbs, kind) => {
    events.push({ type: kind, seat, plane, from: fromAbs, to: toAbs });
    stops.push({ zone: 'ring', step: absToStep(seat, toAbs), abs: toAbs });
    placeAt(toAbs);
  };

  if (isFlyEntry(seat, abs)) {
    // 踏上虚线起点：飞 +12，再跳 +4。
    const cross = flyCrossOf(abs);
    const land = flyDestOf(abs);
    events.push({ type: 'fly', seat, plane, from: abs, to: land, cross });
    captureAt(state, seat, cross, events, 'cross');
    stops.push({ zone: 'ring', step: absToStep(seat, land), abs: land });
    placeAt(land);
    captureAt(state, seat, land, events);
    const after = (land + JUMP_DIST) % RING_SIZE;
    landStep(after, land, 'jump');
    captureAt(state, seat, after, events);
    stackEvent(state, seat, after, events);
    return absToStep(seat, after);
  }

  // 同色连跳 +4。
  const jumped = (abs + JUMP_DIST) % RING_SIZE;
  landStep(jumped, abs, 'jump');
  captureAt(state, seat, jumped, events);
  if (isFlyEntry(seat, jumped)) {
    // 跳到虚线起点：只飞不再跳。
    const cross = flyCrossOf(jumped);
    const land = flyDestOf(jumped);
    events.push({ type: 'fly', seat, plane, from: jumped, to: land, cross });
    captureAt(state, seat, cross, events, 'cross');
    stops.push({ zone: 'ring', step: absToStep(seat, land), abs: land });
    placeAt(land);
    captureAt(state, seat, land, events);
    stackEvent(state, seat, land, events);
    return absToStep(seat, land);
  }
  stackEvent(state, seat, jumped, events);
  return absToStep(seat, jumped);
}

/** 首个满员座位结算：立即结束游戏，其余按进度排名。 */
function finishGame(state, winner, events) {
  const others = state.seats
    .filter((s) => s !== winner)
    .map((s) => ({ seat: s, ...progressOf(state, s) }));
  others.sort(
    (a, b) => b.arrived - a.arrived || b.distance - a.distance,
  );
  state.ranking = [winner, ...others.map((o) => o.seat)];
  state.winner = winner;
  state.phase = 'over';
  events.push({ type: 'finish', seat: winner });
  events.push({ type: 'gameover', ranking: [...state.ranking] });
}

// ------------------------------------------------------------------ 行动

/**
 * 掷骰。随机源优先级：显式参数 > state.rng（createGame 注入）。
 * 无合法动作（全在机库且未掷 6）时自动过并换人。
 * @returns {{state, events, dice, moves}}
 */
export function rollDice(state, rngOverride) {
  if (state.phase !== 'roll') throw new Error(`当前阶段不能掷骰（${state.phase}）`);
  const next = cloneState(state);
  const rng = rngOverride || next.rng || Math.random;
  const dice = DICE_MIN + Math.floor(rng() * (DICE_MAX - DICE_MIN + 1));
  next.dice = dice;
  next.rollsThisTurn += 1;
  next.phase = 'move'; // 先入行动阶段，legalMoves 才可判定
  const events = [{ type: 'roll', seat: next.turn, dice }];
  const moves = legalMoves(next);
  if (!moves.length) {
    // 全部在机库且未掷出 6：自动过。
    events.push({ type: 'skip', seat: next.turn, dice });
    advanceTurn(next);
  }
  logPush(next, events);
  return { state: next, events, dice, moves };
}

/**
 * 执行当前方的某个合法动作（含起飞/移动/连跳/飞线/撞机/反弹/到达全链结算）。
 * @returns {{state, events, chain}} chain 为本步落点序列（可序列化）。
 */
export function applyMove(state, planeIdx) {
  if (state.phase !== 'move') throw new Error(`当前阶段不能走子（${state.phase}）`);
  const seat = state.turn;
  const dice = state.dice;
  const step = state.planes[seat][planeIdx];
  const legal = legalMoves(state).some((m) => m.plane === planeIdx);
  if (!legal) throw new Error(`飞机 ${planeIdx} 当前不可动`);

  const next = cloneState(state);
  const events = [];
  const stops = [];
  let finalStep;

  if (step == null) {
    // 起飞：机库 → 起飞格（起飞落点同样撞机）。
    finalStep = 0;
    next.planes[seat][planeIdx] = finalStep;
    events.push({ type: 'takeoff', seat, plane: planeIdx });
    stops.push({ zone: 'ring', step: 0, abs: SEAT_START[seat] });
    captureAt(next, seat, SEAT_START[seat], events, 'takeoff');
    stackEvent(next, seat, SEAT_START[seat], events);
  } else if (step <= 49) {
    const target = step + dice;
    if (target <= 49) {
      const abs = stepToAbs(seat, target);
      events.push({ type: 'move', seat, plane: planeIdx, from: step, to: target });
      next.planes[seat][planeIdx] = target; // 先落位，链上叠子统计才包含自身
      stops.push({ zone: 'ring', step: target, abs });
      finalStep = resolveLanding(next, seat, planeIdx, abs, events, stops);
    } else {
      // 越过跑道入口，转入引道（主环最远 49，50..55 必为引道 1..6 格）。
      finalStep = target;
      next.planes[seat][planeIdx] = finalStep;
      events.push({
        type: 'runway', seat, plane: planeIdx, from: step, to: finalStep, cell: runwayCellOf(finalStep),
      });
      stops.push({ zone: 'runway', step: finalStep });
    }
  } else if (step <= 55) {
    const target = step + dice;
    if (target > ARRIVE_STEP) {
      // 引道内超出：反弹回走。
      finalStep = 2 * ARRIVE_STEP - target;
      events.push({ type: 'bounce', seat, plane: planeIdx, from: step, to: finalStep });
    } else {
      finalStep = target;
      events.push({
        type: 'move', seat, plane: planeIdx, from: step, to: target, runway: true,
      });
    }
    stops.push(
      finalStep === ARRIVE_STEP
        ? { zone: 'arrived', step: finalStep }
        : { zone: 'runway', step: finalStep },
    );
  } else {
    throw new Error('已到达的飞机不能再移动');
  }

  next.planes[seat][planeIdx] = finalStep;
  if (finalStep === ARRIVE_STEP) {
    events.push({ type: 'arrive', seat, plane: planeIdx });
    if (next.planes[seat].every((s) => s === ARRIVE_STEP)) {
      finishGame(next, seat, events);
    }
  }

  if (next.phase !== 'over') {
    if (dice === DICE_MAX && next.rollsThisTurn < 1 + MAX_BONUS_ROLLS) {
      // 掷 6 奖励再掷（含起飞后的 6）。
      next.phase = 'roll';
      events.push({ type: 'bonus', seat });
    } else {
      if (dice === DICE_MAX) events.push({ type: 'bonusCap', seat });
      advanceTurn(next);
    }
  }

  next.lastChain = { seat, plane: planeIdx, stops };
  logPush(next, events);
  return { state: next, events, chain: stops };
}

/**
 * 预演某动作（不改动原状态）：返回与 applyMove 相同结构，
 * UI 用它画落点预览、AI 用它评分。
 */
export function previewMove(state, planeIdx) {
  return applyMove(state, planeIdx);
}

// ------------------------------------------------------------------ 序列化

/** 剥离随机源，得到纯 JSON 状态（存档/AI 输入）。 */
export function serializeState(state) {
  const { rng, ...rest } = state;
  return structuredClone(rest);
}

/** 从序列化状态恢复（可重新注入随机源）。 */
export function hydrateState(saved, { rng } = {}) {
  const next = structuredClone(saved);
  next.rng = rng || Math.random;
  return next;
}
