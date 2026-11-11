/**
 * 主题数据完整性测试：三主题字段齐全、故事 ≥200 字、配色 4 色、
 * 棋子 emoji 组、全套事件文案键存在，且占位符可渲染。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { THEMES, getTheme, DEFAULT_THEME_ID, themeCopy, seatLabel, planeLabel, planeEmoji } from '../web/data/themes.js';

const COPY_KEYS = [
  'roll', 'skip', 'takeoff', 'move', 'runway', 'jump', 'fly', 'capture',
  'stack', 'bounce', 'arrive', 'finish', 'bonus', 'bonusCap', 'win',
];
const PALETTE_KEYS = ['red', 'yellow', 'blue', 'green', 'bg', 'bgSoft', 'panel', 'board', 'cellLine', 'ink', 'accent'];
const SEATS = ['red', 'yellow', 'blue', 'green'];

test('共三主题：海洋 / 热带雨林 / 沙漠，默认主题有效', () => {
  assert.equal(THEMES.length, 3);
  assert.deepEqual(THEMES.map((t) => t.id).sort(), ['desert', 'ocean', 'rainforest']);
  assert.ok(THEMES.some((t) => t.id === DEFAULT_THEME_ID));
  assert.equal(getTheme('nonexistent').id, THEMES[0].id);
  assert.equal(getTheme(DEFAULT_THEME_ID).id, DEFAULT_THEME_ID);
});

for (const theme of THEMES) {
  test(`[${theme.id}] 基础字段与背景故事（≥200 字）`, () => {
    assert.ok(theme.name && theme.icon && theme.summary);
    assert.ok(['waves', 'leaves', 'dunes'].includes(theme.pattern), '纹样 id 合法');
    assert.ok(typeof theme.story === 'string' && theme.story.length >= 200,
      `${theme.id} 背景故事应 ≥200 字，当前 ${theme.story.length}`);
  });

  test(`[${theme.id}] 配色 4 色 + 背景/盘面色板`, () => {
    for (const key of PALETTE_KEYS) {
      assert.ok(theme.palette[key], `缺少 palette.${key}`);
      assert.match(theme.palette[key], /^#[0-9a-fA-F]{6}$/, `palette.${key} 应为 #rrggbb`);
    }
    const seatColors = [theme.palette.red, theme.palette.yellow, theme.palette.blue, theme.palette.green];
    assert.equal(new Set(seatColors).size, 4, '四色互不相同');
  });

  test(`[${theme.id}] 四座位称谓 + emoji 组 + 每机命名`, () => {
    for (const seat of SEATS) {
      const p = theme.pieces[seat];
      assert.ok(p, `缺少 pieces.${seat}`);
      assert.ok(p.team && p.team.length >= 2);
      assert.ok(p.emoji && [...p.emoji].length >= 1);
      assert.equal(p.planes.length, 4, '每座位 4 机命名');
      for (const name of p.planes) assert.ok(name && name.includes('号'), `机名应为「xx号」：${name}`);
      assert.equal(new Set(p.planes).size, 4, '机名互不相同');
    }
  });

  test(`[${theme.id}] 全套事件文案键存在且为非空变体数组`, () => {
    assert.ok(theme.copy, '缺少 copy');
    for (const key of COPY_KEYS) {
      const variants = theme.copy[key];
      assert.ok(Array.isArray(variants) && variants.length >= 1, `缺少文案键 ${key}`);
      for (const v of variants) {
        assert.ok(typeof v === 'string' && v.length >= 4, `${key} 变体过短`);
      }
    }
    // 占位符可渲染
    const ctx = { seat: '珊瑚队', plane: '海豚号', n: 4, seq: 1 };
    for (const key of COPY_KEYS) {
      const text = themeCopy(theme, key, ctx);
      assert.ok(text.length > 0, `${key} 渲染结果非空`);
      assert.ok(!text.includes('{seat}') && !text.includes('{plane}') && !text.includes('{n}'),
        `${key} 渲染后不应残留占位符`);
    }
  });

  test(`[${theme.id}] 称谓/机名/emoji 出口函数`, () => {
    assert.equal(seatLabel(theme, 'red'), theme.pieces.red.team);
    assert.equal(planeLabel(theme, 'blue', 2), theme.pieces.blue.planes[2]);
    assert.equal(planeEmoji(theme, 'green'), theme.pieces.green.emoji);
    assert.ok(themeCopy(theme, 'capture', { seat: seatLabel(theme, 'blue'), plane: planeLabel(theme, 'blue', 0), n: 1 }).includes(theme.pieces.blue.planes[0]));
  });
}
