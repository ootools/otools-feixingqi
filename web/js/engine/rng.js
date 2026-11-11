/**
 * 可注入、可序列化的伪随机源（mulberry32）。
 * ------------------------------------------------------------------
 * 规则引擎与 AI 都不直接用 Math.random：随机源一律从外部注入，
 * 测试用固定种子即可复现任意整局对局。
 *
 * 用法：
 *   const rng = createRng(20260101);
 *   rng()            // -> [0,1) 浮点
 *   rng.int(6)       // -> 0..5 整数
 *   rng.getState()   // -> uint32，可存档
 *   rng.setState(v)  // -> 恢复到存档点
 */

/**
 * @param {number} seed 任意整数种子
 * @returns {(()=>number) & {int:(n:number)=>number, getState:()=>number, setState:(v:number)=>void}}
 */
export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n) % n;
  next.getState = () => s;
  next.setState = (v) => {
    s = v >>> 0;
  };
  return next;
}
