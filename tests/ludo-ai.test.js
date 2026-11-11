/**
 * AI 测试（种子随机、定向构面）。
 * 覆盖：能撞机必撞、机库有子掷 6 优先起飞、危险规避（存在安全落点不送死）、
 * AI vs AI 种子整局合法终止并产出排名、三档难度行为符合定义。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame, rollDice, applyMove, legalMoves,
  absToStep,
} from '../web/js/engine/ludo.js';
import { chooseAction } from '../web/js/engine/ludo-ai.js';
import { createRng } from '../web/js/engine/rng.js';

function mkGame(planesBySeat, opts = {}) {
  const seats = Object.keys(planesBySeat);
  const game = createGame({
    seats,
    players: Object.fromEntries(seats.map((s) => [s, { type: 'cpu' }])),
    rng: createRng(opts.seed ?? 7),
  });
  for (const [seat, arr] of Object.entries(planesBySeat)) {
    const out = arr.slice();
    while (out.length < 4) out.push(null);
    game.planes[seat] = out;
  }
  game.turn = opts.turn || seats[0];
  game.dice = opts.dice ?? 1;
  game.phase = 'move';
  game.rollsThisTurn = opts.rollsThisTurn ?? 1;
  return game;
}

test('能撞机必撞（normal）', () => {
  // 候选一：step 9（abs 13）掷 1 → abs 14，黄机在该格（+900）
  // 候选二：step 30（abs 34）掷 1 → abs 35，普通前进 1 格
  const game = mkGame({
    red: [9, 30],
    yellow: [absToStep('yellow', 14)],
  }, { dice: 1, turn: 'red' });
  const mv = chooseAction(game, 'red', { level: 'normal' });
  assert.equal(mv.plane, 0, '优先选择能撞机的走法');
  const r = applyMove(game, mv.plane);
  assert.equal(r.state.planes.yellow[0], null);
});

test('机库有子且掷 6：normal 优先起飞', () => {
  const game = mkGame({ red: [null, 10, 20, 30], yellow: [] }, { dice: 6, turn: 'red' });
  const mv = chooseAction(game, 'red', { level: 'normal' });
  assert.equal(mv.kind, 'takeoff');
});

test('危险规避：存在安全落点时不主动送死（normal）', () => {
  // 候选一：step 2（abs 6）掷 3 → abs 9；黄机在 abs 7，距落点 2 格（威胁）
  // 候选二：step 30（abs 34）掷 3 → abs 37；周围无敌机（安全）
  const game = mkGame({
    red: [2, 30],
    yellow: [absToStep('yellow', 7)],
  }, { dice: 3, turn: 'red' });
  const mv = chooseAction(game, 'red', { level: 'normal' });
  assert.equal(mv.plane, 1, '避开敌方 1..6 格射程内的落点');
  // easy 忽略危险项：可能选任何合法走法，但必须合法
  const mvEasy = chooseAction(game, 'red', { level: 'easy', rng: createRng(1) });
  assert.ok(mvEasy && game.planes.red[mvEasy.plane] != null);
});

test('正常走子评分：连跳/飞线链加分高于平移', () => {
  // 候选一：step 5（abs 9）掷 3 → abs 12（红色非入口）→ 连跳 abs 16（入口）
  // → 飞越 abs 28（只飞不再跳），最终 step 24
  // 候选二：step 30（abs 34）掷 3 → abs 37 平移 3 格 → 链收益远高 → 选候选一
  const game = mkGame({ red: [5, 30], yellow: [] }, { dice: 3, turn: 'red' });
  const mv = chooseAction(game, 'red', { level: 'normal' });
  assert.equal(mv.plane, 0, '连跳+飞线路线评分更高');
  const r = applyMove(game, mv.plane);
  assert.equal(r.state.planes.red[0], 24, 'abs12 → 跳 abs16 → 飞 abs28（step 24）');
});

test('hard：期望校验识破「跳点反吃」陷阱（normal 静态扫描看不见）', () => {
  // X = abs 9（黄色格，黄色跳板 abs 5 连跳 +4 的落点）。红 A（abs 8，step 4）
  // 掷 1 落在 X，与埋伏的红 B（step 5，abs 9）成叠；黄三架追兵在 abs 1/0/51
  // （距 X 为 8/9/10），掷 4/5/6 时落跳板 abs 5 连跳 +4 反吃叠子（1800）。
  // normal 的静态危险扫描只看后方 1..6 格 → 看不见追兵，选 A（成叠 +100）；
  // hard 的 1 层期望校验把期望损失（1800×3/6 + 跳链收益）计入 → 放弃 A。
  const game = mkGame({
    red: [4, 30, 5],
    yellow: [absToStep('yellow', 1), absToStep('yellow', 0), absToStep('yellow', 51)],
  }, { dice: 1, turn: 'red', seed: 11 });
  const mvNormal = chooseAction(game, 'red', { level: 'normal' });
  assert.equal(mvNormal.plane, 0, 'normal 静态评分看不见 8..10 格外的反吃，选择落叠');
  const mvHard = chooseAction(game, 'red', { level: 'hard' });
  assert.notEqual(mvHard.plane, 0, 'hard 经期望校验后避开陷阱');
  // 验证反吃真实成立：红选 A 成叠后，黄掷 4 连跳反吃
  const r = applyMove(game, 0);
  assert.deepEqual(r.state.planes.red, [5, 30, 5, null]);
  const { state: rolled } = rollDice(r.state, () => 3.5 / 6); // 4 点
  const mvY = chooseAction(rolled, 'yellow', { level: 'normal' });
  assert.equal(mvY.plane, 0, '黄追兵（abs 1）掷 4 连跳反吃');
  const rY = applyMove(rolled, mvY.plane);
  const redBack = rY.state.planes.red.filter((s) => s === null).length;
  assert.ok(redBack >= 2, '叠子被反吃全体返回');
});

test('AI vs AI（种子）：整局合法终止并产出完整排名', () => {
  const rng = createRng(2026);
  let game = createGame({
    seats: ['red', 'yellow', 'blue', 'green'],
    players: Object.fromEntries(['red', 'yellow', 'blue', 'green'].map((s) => [s, { type: 'cpu' }])),
    rng,
  });
  let steps = 0;
  while (game.phase !== 'over') {
    steps += 1;
    assert.ok(steps < 20000, '对局必须终止');
    if (game.phase === 'roll') { game = rollDice(game).state; continue; }
    const mv = chooseAction(game, game.turn, { level: steps % 3 === 0 ? 'hard' : 'normal', rng });
    assert.ok(mv, '有合法动作时 AI 必须给出决策');
    assert.ok(legalMoves(game).some((m) => m.plane === mv.plane), 'AI 选择必须合法');
    game = applyMove(game, mv.plane).state;
  }
  assert.equal(game.ranking.length, 4);
  assert.equal(new Set(game.ranking).size, 4);
});

test('难度定义：easy 含随机、normal/hard 确定可复现', () => {
  // 四机均可动且基本等价（无险、无撞），easy 的「前 3 随机」用注入 rng 检验
  const game = mkGame({ red: [12, 13, 14, 15], yellow: [46] }, { dice: 2, turn: 'red', seed: 3 });
  const moves = legalMoves(game);
  assert.equal(moves.length, 4);
  const easyA = chooseAction(game, 'red', { level: 'easy', rng: () => 0.0 });
  const easyB = chooseAction(game, 'red', { level: 'easy', rng: () => 0.5 });
  const easyC = chooseAction(game, 'red', { level: 'easy', rng: () => 0.99 });
  assert.equal(new Set([easyA.plane, easyB.plane, easyC.plane]).size, 3,
    'easy 在候选里按注入随机源取不同选择');
  const normalA = chooseAction(game, 'red', { level: 'normal', rng: createRng(0) });
  const normalB = chooseAction(game, 'red', { level: 'normal', rng: createRng(9) });
  assert.equal(normalA.plane, normalB.plane, 'normal 与注入随机源无关，确定可复现');
  const hardA = chooseAction(game, 'red', { level: 'hard' });
  const hardB = chooseAction(game, 'red', { level: 'hard' });
  assert.equal(hardA.plane, hardB.plane, 'hard 确定可复现');
  assert.ok(moves.some((m) => m.plane === hardA.plane));
});

test('chooseAction 阶段守卫：非行动阶段/非当前座位返回 null', () => {
  const game = mkGame({ red: [1], yellow: [] }, { dice: 1, turn: 'red' });
  assert.equal(chooseAction(game, 'yellow', { level: 'normal' }), null);
  const rolling = { ...game, phase: 'roll' };
  assert.equal(chooseAction(rolling, 'red', { level: 'normal' }), null);
});
