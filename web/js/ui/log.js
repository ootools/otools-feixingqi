/**
 * 事件日志：把引擎事件渲染为主题化文案。
 * 事件结构见 engine/ludo.js；变体轮换用事件自身的 seq，保证同种子可复现。
 */

import { themeCopy, seatLabel, planeLabel } from '../../data/themes.js';

const EMOJI = {
  roll: '🎲', skip: '💤', takeoff: '🛫', move: '➡️', runway: '🛬', jump: '⭐',
  fly: '🌀', capture: '💥', stack: '🧩', bounce: '↩️', arrive: '🏁',
  finish: '🏆', bonus: '🎁', bonusCap: '⏳', gameover: '🏆',
};

/** 事件的情绪类别（决定日志配色）。 */
function moodOf(type) {
  switch (type) {
    case 'capture': return 'bad';
    case 'fly': case 'jump': case 'takeoff': case 'arrive': case 'finish': return 'hot';
    case 'stack': case 'bonus': return 'good';
    default: return '';
  }
}

/**
 * 事件 → 日志条目 {text, emoji, mood}；无法识别的事件返回 null（跳过）。
 * @param {object} theme 当前主题
 * @param {object} state 事件发生后的引擎状态（取玩家名/座位信息）
 * @param {object} e 引擎事件
 */
export function formatEvent(theme, state, e) {
  const seat = e.seat || e.by;
  if (!seat) return null;
  const seatTeam = seatLabel(theme, seat);
  const seatName = (state.players[seat] && state.players[seat].name) || seatTeam;
  const seatText = seatName === seatTeam ? seatName : `${seatName}（${seatTeam}）`;
  const plane = e.plane != null ? planeLabel(theme, seat, e.plane) : '';
  const ctx = { seat: seatText, plane, n: e.count || e.dice, seq: e.seq || 0 };
  switch (e.type) {
    case 'roll':
      return { text: themeCopy(theme, 'roll', ctx), emoji: EMOJI.roll, mood: '' };
    case 'skip':
      return { text: themeCopy(theme, 'skip', ctx), emoji: EMOJI.skip, mood: '' };
    case 'takeoff':
      return { text: themeCopy(theme, 'takeoff', ctx), emoji: EMOJI.takeoff, mood: 'hot' };
    case 'move':
      return {
        text: e.runway
          ? themeCopy(theme, 'runway', ctx)
          : themeCopy(theme, 'move', { ...ctx, n: e.to - e.from }),
        emoji: e.runway ? EMOJI.runway : EMOJI.move,
        mood: e.runway ? 'hot' : '',
      };
    case 'runway':
      return { text: themeCopy(theme, 'runway', ctx), emoji: EMOJI.runway, mood: 'hot' };
    case 'jump':
      return { text: themeCopy(theme, 'jump', ctx), emoji: EMOJI.jump, mood: 'hot' };
    case 'fly':
      return { text: themeCopy(theme, 'fly', ctx), emoji: EMOJI.fly, mood: 'hot' };
    case 'capture': {
      // 飞线越过多机撞击时受害方可能没有单一机位：回退为斥候人数占位，避免出现「·被吹回了驿站」空名。
      const planeText = plane || (e.count > 1 ? `${e.count} 名斥候` : '斥候');
      const byLabel = seatLabel(theme, e.by);
      const byName = (state.players[e.by] && state.players[e.by].name) || byLabel;
      const byText = byName === byLabel ? byName : `${byName}（${byLabel}）`;
      return {
        text: themeCopy(theme, 'capture', { ...ctx, plane: planeText, n: e.count })
          + `（${byText}${e.via === 'cross' ? '飞线越过' : '降落撞机'}）`,
        emoji: EMOJI.capture, mood: 'bad',
      };
    }
    case 'stack':
      return { text: themeCopy(theme, 'stack', ctx), emoji: EMOJI.stack, mood: 'good' };
    case 'bounce':
      return { text: themeCopy(theme, 'bounce', ctx), emoji: EMOJI.bounce, mood: '' };
    case 'arrive':
      return { text: themeCopy(theme, 'arrive', ctx), emoji: EMOJI.arrive, mood: 'hot' };
    case 'finish':
      return { text: themeCopy(theme, 'finish', ctx), emoji: EMOJI.finish, mood: 'hot' };
    case 'bonus':
      return { text: themeCopy(theme, 'bonus', ctx), emoji: EMOJI.bonus, mood: 'good' };
    case 'bonusCap':
      return { text: themeCopy(theme, 'bonusCap', ctx), emoji: EMOJI.bonusCap, mood: '' };
    case 'gameover':
      return null; // 结算页呈现
    default:
      return null;
  }
}

/** 往日志容器追加一条（自动滚动到底，最多保留 120 条 DOM）。 */
export function appendLog(box, entry) {
  if (!entry) return;
  const p = document.createElement('p');
  p.className = entry.mood || 'fresh';
  p.textContent = `${entry.emoji} ${entry.text}`;
  box.appendChild(p);
  while (box.children.length > 120) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}
