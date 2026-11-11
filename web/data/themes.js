/**
 * 主题数据（规则数值与主题完全解耦：只换肤、换称谓、换文案）。
 * ------------------------------------------------------------------
 * 每主题结构：
 *   id / name / icon          主题标识
 *   summary                   主题卡上的一句话摘要
 *   story                     背景故事（≥200 字，设置页可展开阅读）
 *   palette                   CSS 变量映射：四色 + 背景 + 盘面 + 格子纹样
 *   pattern                   盘面装饰纹样 id（waves / leaves / dunes）
 *   pieces                    4 座位的称谓 / 主 emoji / 4 机命名（「xx号」）
 *   copy                      全套主题化事件文案（数组 = 变体，占位符见下）
 *
 * 文案占位符：{seat}=座位称谓，{plane}=机名（xx号），{n}=数字。
 * 事件键与引擎事件 type 一一对应：roll / skip / takeoff / move / runway /
 * jump / fly / capture / stack / bounce / arrive / finish / bonus /
 * bonusCap / win。
 */

/** 海洋主题四色：珊瑚红 / 沙金 / 深海蓝 / 海藻绿。 */
const OCEAN_PALETTE = {
  red: '#ff6b7a', yellow: '#ffcf5c', blue: '#4cc9f0', green: '#57d9a3',
  bg: '#0a1524', bgSoft: '#0f2036', panel: '#122338', board: '#0d1c30',
  cellLine: '#24405e', ink: '#dcebf7', accent: '#7dd8ff',
};

/** 热带雨林主题四色：金刚鹦鹉红 / 阳光黄 / 深林蓝 / 苔藓绿。 */
const RAINFOREST_PALETTE = {
  red: '#ff7a70', yellow: '#ffd166', blue: '#63b3ed', green: '#68d391',
  bg: '#101a12', bgSoft: '#15241a', panel: '#1a2b1f', board: '#0f1d14',
  cellLine: '#2c4633', ink: '#e4f0e2', accent: '#9ae6b4',
};

/** 沙漠主题四色：落日红 / 金沙黄 / 星夜蓝 / 绿洲青。 */
const DESERT_PALETTE = {
  red: '#ff8a5c', yellow: '#f6d365', blue: '#6fa8dc', green: '#7bc9a2',
  bg: '#191410', bgSoft: '#221a14', panel: '#2a2018', board: '#1c150f',
  cellLine: '#4a3a28', ink: '#f3e9d8', accent: '#f0b264',
};

export const THEMES = [
  {
    id: 'ocean',
    name: '海洋远航',
    icon: '🌊',
    pattern: 'waves',
    summary: '四大洋流竞速：珊瑚队、金滩队、深渊队、海藻队的机群乘着漩涡与洋流，飞越环礁返航。',
    story: '传说在无风带深处有一座螺旋环礁，礁盘上的四色水道是远古海流冲刷出的航线。每年洄游季，珊瑚队、金滩队、深渊队与海藻队的飞行中队都会在此集结：它们的「飞机」是各自的巡游艇，泊在珊瑚环抱的机库里。只有掷出六点的满潮，艇库闸门才会升起，让巡游艇滑入起飞水道。航道沿途铺着各队颜色的浮标，艇身擦过己方浮标便借着回流跃进一大截；若恰好踏上虚线航标，还能钻进海底漩涡，被洋流抛到十二格外的地方——只是漩涡正上方的十字水道常有别队巡游艇埋伏，被卷进乱流的话整艇都会被冲回机库。最先让四艘巡游艇全部驶回环礁中央灯塔泊位的队伍，将赢得本年度的「洋流杯」，成为无风带真正的航海之王。',
    palette: OCEAN_PALETTE,
    pieces: {
      red: { team: '珊瑚队', emoji: '🐬', planes: ['海豚号', '白鲨号', '旗鱼号', '水母号'] },
      yellow: { team: '金滩队', emoji: '🐋', planes: ['虎鲸号', '海狮号', '飞鱼号', '海星号'] },
      blue: { team: '深渊队', emoji: '🦑', planes: ['蛟龙号', '灯笼鱼号', '巨乌贼号', '鮟鱇号'] },
      green: { team: '海藻队', emoji: '🐢', planes: ['海龟号', '儒艮号', '小丑鱼号', '海马号'] },
    },
    copy: {
      roll: ['{seat}掷出 {n} 点，潮汐转动。', '海面翻涌——{seat}摇出了 {n} 点。', '螺号吹响，{seat}掷得 {n} 点。'],
      skip: ['{seat}的艇队仍在闸门后待命，满潮未至，只能按兵不动。', '风平浪静，{seat}没有等到六点的潮水。'],
      takeoff: ['满潮开启闸门！{seat}·{plane}滑出机库，冲上起飞水道！', '汽笛长鸣，{seat}·{plane}乘着六点的浪头出港！', '{seat}·{plane}跃过礁门，正式入列航道！'],
      move: ['{seat}·{plane}乘流前行 {n} 格。', '{seat}·{plane}破浪稳进 {n} 格。'],
      runway: ['{seat}·{plane}转入归航水道，灯塔已在眼前！', '{seat}·{plane}驶入环礁引道，向灯塔泊位进发！'],
      jump: ['{seat}·{plane}擦过己方浮标，借回流跃进 4 格！', '同色浮标连成一线，{seat}·{plane}顺势弹跳 4 格！'],
      fly: ['{seat}·{plane}一头扎进海底漩涡，被洋流抛飞 12 格！', '漩涡开启！{seat}·{plane}沿虚线航标飞越半片海域！'],
      capture: ['乱流突袭！{seat}·{plane}被卷离航道，冲回了机库。', '{seat}·{plane}在十字水道被撞个正着，随暗流退回闸门后。', '遗憾！{seat}·{plane}的航程被打断，整艇返厂整修。'],
      stack: ['{seat}的 {n} 艘巡游艇在浮标处并队结阵。', '{seat}·{plane}与同伴并排停泊，组成 {n} 机编队。'],
      bounce: ['泊位已满！{seat}·{plane}被引导线弹回 {n} 格。', '{seat}·{plane}冲过头了，顺着回流倒退 {n} 格。'],
      arrive: ['{seat}·{plane}稳稳驶入灯塔泊位，完成归航！', '灯塔闪耀！{seat}·{plane}正式入坞！'],
      finish: ['{seat}的四艘巡游艇全部归航，洋流杯到手！'],
      bonus: ['掷出六点，{seat}获得一次额外的潮汐！', '满潮加赐！{seat}可以再掷一次。'],
      bonusCap: ['{seat}的潮汐奖励已用尽，本回合到此为止。'],
      win: ['洋流杯属于{seat}！四机归航，航海之王当之无愧。'],
    },
  },
  {
    id: 'rainforest',
    name: '热带雨林',
    icon: '🌴',
    pattern: 'leaves',
    summary: '巨树、阳光、雨雾、绿荫四队穿行林冠：藤蔓弹跳、花桥飞渡，把雏鸟安全送回树冠巢穴。',
    story: '在南美洲腹地的千年巨树上，四支飞行中队以树冠为机场展开了一年一度的「绿冠大赛」。巨树队泊在最高的王冠枝桠，阳光队守着东面的光照平台，雨雾队藏在瀑布水幕之后，绿荫队的巢穴则铺满苔藓与地衣。树冠之间垂着四色的藤索与气生根，只有雷雨夜掷出六点的惊雷，才能吹响起飞的号角。林间每四步就有一枚同色标记，雏鸟们踩上自己队颜色的阔叶便被叶子弹床送出老远；若落在开着虚线花桥的巨花上，还能顺着蜂鸟衔来的花桥一口气飞渡十二格——只是花桥正中横着别队把守的十字枝桠，撞上巡守的巢卫就免不了被押送回巢。最先送四只雏鸟回到树冠之心的队伍，将被授予「雨林之翼」的称号，在整一个雨季里独享树冠最高处的那缕晨光。',
    palette: RAINFOREST_PALETTE,
    pieces: {
      red: { team: '巨树队', emoji: '🦜', planes: ['鹦鹉号', '金刚鹦号', '巨嘴鸟号', '蜂鸟号'] },
      yellow: { team: '阳光队', emoji: '🐆', planes: ['美洲豹号', '豹猫号', '细腰猫号', '虎猫号'] },
      blue: { team: '雨雾队', emoji: '🐒', planes: ['吼猴号', '蛛猴号', '卷尾猴号', '绒猴号'] },
      green: { team: '绿荫队', emoji: '🐸', planes: ['树蛙号', '箭毒蛙号', '角蛙号', '雨蛙号'] },
    },
    copy: {
      roll: ['{seat}掷出 {n} 点，林间惊雷滚动。', '树叶沙沙作响，{seat}掷得 {n} 点。'],
      skip: ['雷雨未至，{seat}的雏鸟们只能在巢里扑腾翅膀。', '林冠静悄悄，{seat}没有等到起飞的惊雷。'],
      takeoff: ['惊雷炸响！{seat}·{plane}振翅跃出巢穴，登上起飞枝！', '{seat}·{plane}迎着六点的雷声离巢，稳稳落在起飞枝上！'],
      move: ['{seat}·{plane}踩着枝桠前进 {n} 步。', '{seat}·{plane}在林冠间跳跃 {n} 步。'],
      runway: ['{seat}·{plane}踏上归巢藤索，树冠之心近在咫尺！', '{seat}·{plane}钻入林冠引道，向巢穴滑翔！'],
      jump: ['{seat}·{plane}踩中同色阔叶，被叶子弹床抛出 4 格！', '同色花海连片，{seat}·{plane}顺势弹跳 4 格！'],
      fly: ['{seat}·{plane}跃上虚线花桥，被蜂鸟领着飞渡 12 格！', '花桥盛放！{seat}·{plane}沿藤索索道飞越半个雨林！'],
      capture: ['十字枝桠的巡守围了上来，{seat}·{plane}被押送回巢。', '{seat}·{plane}撞上了别队的巢卫，垂头丧气地飞回巢穴。', '藤索一荡，{seat}·{plane}被送回了起飞前的老巢。'],
      stack: ['{seat}的 {n} 只雏鸟在同一根枝桠上挤作一团。', '{seat}·{plane}与同伴并枝歇脚，组成 {n} 机小队。'],
      bounce: ['巢口太窄！{seat}·{plane}被弹回 {n} 步外。', '{seat}·{plane}冲过了头，只好沿着藤索倒退 {n} 步。'],
      arrive: ['{seat}·{plane}钻进树冠之心的巢穴，安然归巢！', '巢穴亮起萤火，{seat}·{plane}正式归队！'],
      finish: ['{seat}的四只雏鸟全部归巢，雨林之翼实至名归！'],
      bonus: ['惊雷再加一场，{seat}获得额外行动！', '雷声未歇，{seat}可以再掷一次。'],
      bonusCap: ['{seat}的雷鸣号角吹完了，本回合到此为止。'],
      win: ['雨林之翼属于{seat}！四雏归巢，独享树冠最高处的晨光。'],
    },
  },
  {
    id: 'desert',
    name: '大漠商路',
    icon: '🏜️',
    pattern: 'dunes',
    summary: '落日、金沙、星夜、绿洲四支驼队沿古商道竞速：沙丘滑翔、星图捷径，把货队带回绿洲驿站。',
    story: '在丝路偏南的黄沙之下，埋着一张以星图为底的古商道。每年沙暴季过后，落日队、金沙队、星夜队与绿洲队的驼队便从四座驿站出发，沿着四色旗幡标记的商道竞速。驼队里跑得最快的斥候被唤作「飞机」，平日圈在驿站围栏里，只有掷出六点的顺风才能吹开栅门，放它们踏上第一面起飞旗。商道上每四步立着一面同色小旗，斥候踏上己方旗影便借着沙坡滑翔出一大段；若恰好跃上绘着虚线的星图石，还能循着星轨直接飞渡十二格——只是星轨正下方横着古商道的十字隘口，别队的斥候若守在那里，一场沙尘对撞就足以把整支前锋吹回驿站。最先让四名斥候全部跑回绿洲驿站的驼队，将点燃驿站最高处的烽火，在之后的一整年里掌管这条商路上的水源与灯火。',
    palette: DESERT_PALETTE,
    pieces: {
      red: { team: '落日队', emoji: '🐪', planes: ['骆驼号', '单峰驼号', '驼铃号', '商队号'] },
      yellow: { team: '金沙队', emoji: '🦅', planes: ['隼号', '雕号', '秃鹫号', '鸮号'] },
      blue: { team: '星夜队', emoji: '🦊', planes: ['沙狐号', '耳廓狐号', '郊狼号', '胡狼号'] },
      green: { team: '绿洲队', emoji: '🦎', planes: ['沙蜥号', '角蝰号', '石龙子号', '守宫号'] },
    },
    copy: {
      roll: ['{seat}掷出 {n} 点，沙丘上的风换了方向。', '驼铃轻响，{seat}掷得 {n} 点。'],
      skip: ['顺风未起，{seat}的斥候们仍在围栏里打着响鼻。', '热浪滚滚，{seat}没有等到六点的顺风。'],
      takeoff: ['顺风吹开栅门！{seat}·{plane}冲出驿站，踏上第一面起飞旗！', '{seat}·{plane}迎着六点的顺风出栏，扬起一路黄沙！'],
      move: ['{seat}·{plane}沿商道疾行 {n} 格。', '{seat}·{plane}踏着沙脊前进 {n} 格。'],
      runway: ['{seat}·{plane}转入绿洲引道，驿站的烽火已在望！', '{seat}·{plane}拐进归途水线，向驿站冲刺！'],
      jump: ['{seat}·{plane}踏进同色旗影，顺着沙坡滑出 4 格！', '同色旗幡相连，{seat}·{plane}借势飞跃 4 格！'],
      fly: ['{seat}·{plane}跃上星图石，循着星轨飞渡 12 格！', '星轨亮起！{seat}·{plane}沿虚线古图飞越整片沙海！'],
      capture: ['十字隘口一场沙尘对撞，{seat}·{plane}被吹回了驿站。', '{seat}·{plane}在隘口撞上别队斥候，只得随沙暴返程。', '风向骤变，{seat}·{plane}的侦察被中断，全速撤回围栏。'],
      stack: ['{seat}的 {n} 名斥候在同一面旗下会合结阵。', '{seat}·{plane}与同伴并旗扎营，组成 {n} 机驼阵。'],
      bounce: ['驿站门前太挤！{seat}·{plane}被路标弹回 {n} 格。', '{seat}·{plane}冲过了水线，只好沿沙脊倒退 {n} 格。'],
      arrive: ['{seat}·{plane}跑进绿洲驿站，烽火为它添了一分！', '水声潺潺，{seat}·{plane}正式归队入栏！'],
      finish: ['{seat}的四名斥候全部归驿，烽火点燃了大漠夜空！'],
      bonus: ['顺风再起，{seat}获得额外的赶路机会！', '风势正好，{seat}可以再掷一次。'],
      bonusCap: ['{seat}的顺风用完了，本回合到此扎营。'],
      win: ['大漠烽火为{seat}而燃！四骑归驿，独掌商路的水源与灯火。'],
    },
  },
];

export const DEFAULT_THEME_ID = 'ocean';

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

/**
 * 渲染一条主题文案：取变体（按 seq 轮换，保证同种子可复现）、填充占位符。
 * @param {object} theme 主题对象
 * @param {string} type 事件类型（copy 键；win 兜底 finish）
 * @param {object} ctx {seat, plane, n, seq}
 */
export function themeCopy(theme, type, { seat, plane, n, seq = 0 } = {}) {
  const variants = (theme.copy && (theme.copy[type] || theme.copy[type === 'win' ? 'finish' : type])) || [];
  if (!variants.length) return '';
  const text = variants[Math.abs(seq) % variants.length];
  return text
    .replaceAll('{seat}', seat || '')
    .replaceAll('{plane}', plane || '')
    .replaceAll('{n}', n == null ? '' : String(n));
}

/** 主题下的座位称谓（如「珊瑚队」），未配置时回退默认色名。 */
export function seatLabel(theme, seat) {
  const fallback = { red: '红方', yellow: '黄方', blue: '蓝方', green: '绿方' };
  return (theme.pieces[seat] && theme.pieces[seat].team) || fallback[seat] || seat;
}

/** 主题下某机（0..3）的称谓，如「海豚号」。 */
export function planeLabel(theme, seat, plane) {
  const list = (theme.pieces[seat] && theme.pieces[seat].planes) || [];
  return list[plane] || `${seat}#${plane}`;
}

/** 主题下某机 emoji。 */
export function planeEmoji(theme, seat) {
  return (theme.pieces[seat] && theme.pieces[seat].emoji) || '✈️';
}

/** 把主题色板写入 CSS 变量（--c-red 等），实现整页换肤。 */
export function applyThemeCss(theme, root = document.documentElement) {
  const p = theme.palette;
  const vars = {
    '--c-red': p.red, '--c-yellow': p.yellow, '--c-blue': p.blue, '--c-green': p.green,
    '--bg': p.bg, '--bg-soft': p.bgSoft, '--panel': p.panel, '--board': p.board,
    '--cell-line': p.cellLine, '--ink': p.ink, '--accent': p.accent,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
}
