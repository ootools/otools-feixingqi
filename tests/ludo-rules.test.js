/**
 * 规则引擎测试（种子随机、定向构面）。
 * 覆盖：起飞与奖励掷骰、自动过、同色连跳、飞线捷径与交叉格撞机、
 * 撞机返回、叠子被撞全体返回、引道整点进入与超出反弹、到达结算与排名、
 * 复合链、状态可序列化与纯函数性。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame, rollDice, applyMove, legalMoves, previewMove, withDice,
  serializeState, hydrateState, progressOf,
  SEAT_START, SEAT_ORDER, FLY_ENTRY_STEPS, ARRIVE_STEP,
  ringColorOf, stepToAbs, absToStep, isFlyEntry, flyCrossOf, flyDestOf,
} from '../web/js/engine/ludo.js';
import { createRng } from '../web/js/engine/rng.js';

/** 构造定制局面：planesBySeat 为「座位 → 个人步数数组（不足补 null）」；
 *  只给一个座位时自动补一个空座位凑满两人（不影响纯移动类断言）。 */
function mkGame(planesBySeat, opts = {}) {
  const entries = Object.entries(planesBySeat).map(([s, arr]) => {
    const out = arr.slice();
    while (out.length < 4) out.push(null);
    return [s, out];
  });
  if (entries.length < 2) {
    const filler = SEAT_ORDER.find((s) => !planesBySeat[s]);
    entries.push([filler, [null, null, null, null]]);
  }
  const seats = entries.map(([s]) => s);
  const game = createGame({
    seats,
    players: Object.fromEntries(seats.map((s) => [s, { type: 'human' }])),
    rng: createRng(opts.seed ?? 7),
  });
  for (const [seat, arr] of entries) game.planes[seat] = arr;
  for (const [seat, arr] of Object.entries(planesBySeat)) {
    const out = arr.slice();
    while (out.length < 4) out.push(null);
    game.planes[seat] = out;
  }
  game.turn = opts.turn || seats[0];
  game.dice = opts.dice ?? 1;
  game.phase = opts.phase || 'move';
  game.rollsThisTurn = opts.rollsThisTurn ?? 1;
  return game;
}

const eventsOf = (r) => r.events.map((e) => e.type);

test('坐标约定：起点格颜色与飞线入口', () => {
  for (let i = 0; i < SEAT_ORDER.length; i += 1) {
    const seat = SEAT_ORDER[i];
    assert.equal(SEAT_START[seat] % 4, i, `${seat} 起点格必为己色`);
    assert.equal(ringColorOf(SEAT_START[seat]), seat);
    // 飞线入口必为己色，终点为己色且仍在可达主环内
    for (const s of FLY_ENTRY_STEPS) {
      const abs = stepToAbs(seat, s);
      assert.equal(ringColorOf(abs), seat);
      assert.ok(s + 12 <= 49, '飞线终点不越出主环');
      assert.equal(flyDestOf(abs), (abs + 12) % 52);
      assert.equal(flyCrossOf(abs), (abs + 6) % 52);
    }
  }
  assert.deepEqual(FLY_ENTRY_STEPS, [12, 24, 36]);
  assert.ok(isFlyEntry('red', stepToAbs('red', 12)));
  assert.ok(!isFlyEntry('red', stepToAbs('red', 8)));
  assert.equal(absToStep('red', 4), 0);
});

test('掷 6 才能起飞；起飞落点撞机；起飞后奖励再掷', () => {
  // 黄机停在红方起飞格（abs 4 → 黄个人步数 39），红掷 6 起飞即撞回
  const game = mkGame({ red: [], yellow: [39] }, { dice: 6, turn: 'red' });
  const moves = legalMoves(game);
  assert.deepEqual(moves.map((m) => m.kind), ['takeoff', 'takeoff', 'takeoff', 'takeoff']);
  const r = applyMove(game, 0);
  assert.equal(r.state.planes.red[0], 0);
  assert.ok(eventsOf(r).includes('takeoff'));
  const capture = r.events.find((e) => e.type === 'capture');
  assert.ok(capture, '起飞落点撞机');
  assert.equal(capture.seat, 'yellow');
  assert.equal(r.state.planes.yellow[0], null, '被撞回机库');
  assert.ok(eventsOf(r).includes('bonus'), '掷 6 奖励再掷');
  assert.equal(r.state.phase, 'roll');
  assert.equal(r.state.turn, 'red');
});

test('非 6 时机库无动作 → 自动过并换人', () => {
  const game = mkGame({ red: [], yellow: [] }, { turn: 'red', phase: 'roll' });
  // 注入骰点 3：floor(0.3343×6)=2 → 3 点
  const stub = () => 2 / 6 + 0.001;
  const r = rollDice(game, stub);
  assert.equal(r.dice, 3);
  assert.ok(eventsOf(r).includes('skip'), '无动作自动过');
  assert.equal(r.state.turn, 'yellow');
  assert.equal(r.state.phase, 'roll');
  assert.equal(r.state.dice, null);
});

test('全部在机库掷出 6 → 可起飞，不自动过', () => {
  const game = mkGame({ red: [] }, { turn: 'red', phase: 'roll' });
  const r = rollDice(game, () => 5.5 / 6); // floor(5.5)=5 → 6 点
  assert.equal(r.dice, 6);
  assert.equal(r.state.phase, 'move');
  assert.ok(r.moves.length > 0);
});

test('同色连跳 +4（普通色格，无飞线）', () => {
  // 红机 step 1（abs 5），掷 3 → abs 8（红色）→ 跳到 abs 12（step 8，非入口）
  const game = mkGame({ red: [1] }, { dice: 3, turn: 'red' });
  const r = applyMove(game, 0);
  assert.equal(r.state.planes.red[0], 8);
  assert.ok(eventsOf(r).includes('jump'));
  const jump = r.events.find((e) => e.type === 'jump');
  assert.equal(jump.from, 8);
  assert.equal(jump.to, 12);
});

test('踏上飞线入口：飞越 +12（交叉格撞机）再跳 +4', () => {
  // 红机 step 11（abs 15），掷 1 → abs 16 = 入口(step 12)
  // 飞到 abs 28，交叉格 abs 22 上的蓝机被撞，落点 abs 28 的绿机被撞，再跳 abs 32
  const blueStep = absToStep('blue', 22); // 44
  const greenStep = absToStep('green', 32); // 41
  const game = mkGame({ red: [11], blue: [blueStep], green: [greenStep] }, { dice: 1, turn: 'red' });
  assert.ok(isFlyEntry('red', 16));
  const r = applyMove(game, 0);
  const types = eventsOf(r);
  assert.ok(types.includes('fly'));
  assert.ok(types.includes('jump'));
  assert.equal(r.state.planes.red[0], 28, '最终 16 → 28 → 32（step 28）');
  assert.equal(r.state.planes.blue[0], null, '交叉格敌机被撞回');
  assert.equal(r.state.planes.green[0], null, '飞线落点敌机被撞回');
  const fly = r.events.find((e) => e.type === 'fly');
  assert.equal(fly.from, 16);
  assert.equal(fly.to, 28);
  assert.equal(fly.cross, 22);
  const crossCapture = r.events.find((e) => e.type === 'capture' && e.via === 'cross');
  assert.equal(crossCapture.seat, 'blue');
});

test('连跳跳到飞线入口：只飞不再跳', () => {
  // 红机 step 19（abs 23），掷 1 → abs 24（红色非入口）→ 跳到 abs 28（入口）
  // → 飞越到 abs 40（step 36），不再跳（abs 44 不会到达）
  const game = mkGame({ red: [19] }, { dice: 1, turn: 'red' });
  assert.ok(!isFlyEntry('red', 24));
  assert.ok(isFlyEntry('red', 28));
  const r = applyMove(game, 0);
  const types = eventsOf(r);
  assert.deepEqual(types.filter((t) => t === 'jump').length, 1);
  assert.deepEqual(types.filter((t) => t === 'fly').length, 1);
  assert.equal(r.state.planes.red[0], 36);
});

test('落点撞机：普通格降落撞回敌机（路过不撞）', () => {
  const yellowStep = absToStep('yellow', 14); // 49
  const game = mkGame({ red: [9], yellow: [yellowStep] }, { dice: 1, turn: 'red' });
  // 红机 step 9（abs 13）→ 掷 1 落 abs 14，黄机在该格被撞
  const r = applyMove(game, 0);
  const capture = r.events.find((e) => e.type === 'capture');
  assert.ok(capture);
  assert.equal(capture.seat, 'yellow');
  assert.equal(r.state.planes.yellow[0], null);
  // 路过不撞：红机从 abs 13 到 abs 14 才撞；若只路过（格间）无事件
  const game2 = mkGame({ red: [8], yellow: [absToStep('yellow', 10)] }, { dice: 1, turn: 'red' });
  // 红机 step 8（abs 12）→ 掷 1 落 abs 13，路过不了别的格子，黄机在 abs 10 无恙
  const r2 = applyMove(game2, 0);
  assert.equal(r2.state.planes.yellow[0], absToStep('yellow', 10));
});

test('叠子：己方同格成叠（≤4），被撞全体返回', () => {
  // 红机 A 已在 abs 14（step 10），红机 B step 9（abs 13）掷 1 落 abs 14 → 叠子
  const game = mkGame({ red: [10, 9], yellow: [absToStep('yellow', 14)] }, { dice: 1, turn: 'red' });
  const r = applyMove(game, 1);
  const stack = r.events.find((e) => e.type === 'stack');
  assert.ok(stack, '落点成叠');
  assert.equal(stack.count, 2);
  assert.equal(r.state.planes.red[0], 10);
  assert.equal(r.state.planes.red[1], 10);
  // 黄机 step 46（abs 11）掷 3 → abs 14，撞回两架红机
  const game2 = mkGame({ red: [10, 10], yellow: [46] }, { dice: 3, turn: 'yellow' });
  const r2 = applyMove(game2, 0);
  const capture = r2.events.find((e) => e.type === 'capture');
  assert.ok(capture, '叠子被撞');
  assert.equal(capture.count, 2, '全体返回');
  assert.deepEqual(r2.state.planes.red, [null, null, null, null]);
});

test('引道：整点进入、逐格推进、超出反弹', () => {
  // 恰好越过入口：step 48 掷 2 → 引道第 1 格（step 50）
  const game = mkGame({ red: [48] }, { dice: 2, turn: 'red' });
  let r = applyMove(game, 0);
  assert.equal(r.state.planes.red[0], 50);
  assert.ok(eventsOf(r).includes('runway'));
  // 引道内移动：step 50 掷 3 → step 53
  const game2 = mkGame({ red: [50] }, { dice: 3, turn: 'red' });
  r = applyMove(game2, 0);
  assert.equal(r.state.planes.red[0], 53);
  // 超出反弹：step 55 掷 6 → 61 → 112-61 = 51
  const game3 = mkGame({ red: [55] }, { dice: 6, turn: 'red' });
  r = applyMove(game3, 0);
  assert.equal(r.state.planes.red[0], 51);
  assert.ok(eventsOf(r).includes('bounce'));
  // 引道内不受撞机影响：敌机引道里的棋子不会被打（各自引道独立，构造落点不涉敌）
  assert.ok(r.chain.every((s) => s.zone !== 'ring'));
});

test('精确到达与胜利结算：第一名完成即结束，其余按进度排名', () => {
  const game = mkGame({
    red: [ARRIVE_STEP, ARRIVE_STEP, ARRIVE_STEP, 50],
    yellow: [40],
    blue: [10, 20],
    green: [],
  }, { dice: 6, turn: 'red' });
  const r = applyMove(game, 3); // step 50 + 6 = 56 到达（第 4 架）
  assert.equal(r.state.planes.red[3], ARRIVE_STEP);
  assert.ok(eventsOf(r).includes('arrive'));
  assert.ok(eventsOf(r).includes('finish'));
  assert.ok(eventsOf(r).includes('gameover'));
  assert.equal(r.state.phase, 'over');
  assert.equal(r.state.winner, 'red');
  // 排名：红(4 到达) > 黄(41) > 蓝(11+21=32) > 绿(0)
  assert.deepEqual(r.state.ranking, ['red', 'yellow', 'blue', 'green']);
  assert.equal(progressOf(r.state, 'blue').distance, 32);
});

test('奖励掷骰上限：一回合最多 3 次奖励', () => {
  const game = mkGame({ red: [1] }, { dice: 6, turn: 'red', rollsThisTurn: 4 });
  const r = applyMove(game, 0);
  assert.ok(eventsOf(r).includes('bonusCap'), '第 4 次掷骰后不再奖励');
  assert.equal(r.state.turn, 'yellow');
  assert.equal(r.state.phase, 'roll');
  // rollsThisTurn = 3 时仍可奖励
  const game2 = mkGame({ red: [1] }, { dice: 6, turn: 'red', rollsThisTurn: 3 });
  const r2 = applyMove(game2, 0);
  assert.ok(eventsOf(r2).includes('bonus'));
  assert.equal(r2.state.turn, 'red');
});

test('复合链：连跳落点撞机', () => {
  // 红机 step 5（abs 9）掷 3 → abs 12（红色非入口）→ 跳 abs 16（step 12 = 入口！）
  // hmm：abs 16 是入口，会飞线。改用 abs 8 链：step 1 掷 3 → abs 8 → 跳 abs 12，
  // 黄机在 abs 12（step 47）被撞。
  const game = mkGame({ red: [1], yellow: [absToStep('yellow', 12)] }, { dice: 3, turn: 'red' });
  const r = applyMove(game, 0);
  assert.equal(r.state.planes.red[0], 8);
  const capture = r.events.find((e) => e.type === 'capture');
  assert.ok(capture, '连跳落点撞机');
  assert.equal(capture.cell, 12);
  assert.equal(r.state.planes.yellow[0], null);
});

test('纯函数性：applyMove / previewMove 不改入参状态', () => {
  const game = mkGame({ red: [1, 9], yellow: [absToStep('yellow', 14)] }, { dice: 1, turn: 'red' });
  const snapshot = JSON.stringify(serializeState(game));
  previewMove(game, 0);
  applyMove(game, 1);
  assert.equal(JSON.stringify(serializeState(game)), snapshot);
  // hydrate 后行为一致
  const restored = hydrateState(JSON.parse(snapshot), { rng: createRng(7) });
  assert.deepEqual(serializeState(restored), JSON.parse(snapshot));
});

test('序列化：中断局存档后可继续到终局', () => {
  let game = createGame({
    seats: ['red', 'yellow'],
    players: { red: { type: 'cpu' }, yellow: { type: 'cpu' } },
    rng: createRng(99),
  });
  for (let i = 0; i < 60 && game.phase !== 'over'; i += 1) {
    if (game.phase === 'roll') { game = rollDice(game).state; continue; }
    game = applyMove(game, legalMoves(game)[0].plane).state;
  }
  assert.notEqual(game.phase, 'over', '60 步内不会终局，得到的是中断局');
  const saved = JSON.parse(JSON.stringify(serializeState(game)));
  const rng2 = createRng(4242);
  let restored = hydrateState(saved, { rng: rng2 });
  for (let i = 0; i < 20000 && restored.phase !== 'over'; i += 1) {
    if (restored.phase === 'roll') { restored = rollDice(restored).state; continue; }
    restored = applyMove(restored, legalMoves(restored)[0].plane).state;
  }
  assert.equal(restored.phase, 'over');
  assert.ok(restored.winner);
  assert.equal(restored.ranking.length, 2);
});

test('withDice：供 AI/测试构面（纯函数）', () => {
  const game = mkGame({ red: [1] }, { turn: 'red', phase: 'roll' });
  game.dice = null; // roll 阶段尚无骰点
  const withRoll = withDice(game, 5);
  assert.equal(withRoll.dice, 5);
  assert.equal(withRoll.phase, 'move');
  assert.equal(game.dice, null, '原状态不被修改');
  assert.deepEqual(legalMoves(withRoll).map((m) => m.plane), [0]);
});
