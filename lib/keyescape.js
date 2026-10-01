/**
 * keyescape.com 취소표 감시
 *
 * 전부 POST /controller/run_proc.php (쿠키·세션 불필요, JSON 응답)
 *   t=get_theme_info_list  zizum_num             지점의 테마 목록 (info_num, theme_num, doing)
 *   t=get_theme_date       num=info_num          테마 정보 + calendarData.today (서버 기준 오늘)
 *   t=get_theme_time       date, zizumNum, themeNum  그 날짜의 슬롯 [{num, hh, mm, enable:'Y'|'N'}]
 *
 * 예약 가능 창 = 서버 today ~ today + (doing - 1).
 * 창 밖 날짜는 status:false "예약 가능 한 날짜가 아닙니다." 로 온다.
 *
 * 이 파일은 Next 와 scripts/keyescape-watch.mjs 가 같이 쓴다. '@/' 별칭을 쓰지 말 것.
 */

export const BASE = 'https://www.keyescape.com';
export const PROC = `${BASE}/controller/run_proc.php`;

export const BRANCHES = [
  ['26', '에버랜드'],
  ['23', '후즈데어'],
  ['22', 'STATION'],
  ['19', 'LOG_IN 1'],
  ['20', 'LOG_IN 2'],
  ['18', '메모리컴퍼니'],
  ['16', '우주라이크'],
  ['14', '더오름'],
  ['3', '강남점'],
  ['10', '홍대점'],
  ['9', '부산점'],
  ['7', '전주점'],
  ['25', '무비무드'],
  ['29', '무비무드 전주'],
];

export const branchName = (zizum) =>
  BRANCHES.find(([n]) => n === String(zizum))?.[1] ?? `지점 ${zizum}`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function proc(params) {
  const r = await fetch(PROC, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: `${BASE}/reservation1.php`,
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ─────────── 조회 ─────────── */

/** 지점의 테마 목록 → [{ info, theme, name, doing }] */
export async function themes(zizum) {
  const j = await proc({ t: 'get_theme_info_list', zizum_num: zizum });
  if (!j.status) throw new Error(j.msg || '테마 목록 조회 실패');
  return j.data.map((t) => ({
    info: String(t.info_num),
    theme: String(t.theme_num),
    name: t.info_name,
    doing: Number(t.doing) || 1,
  }));
}

/** 서버 기준 오늘 (YYYY-MM-DD) */
export async function serverToday(info) {
  const j = await proc({ t: 'get_theme_date', num: info });
  if (!j.status) throw new Error(j.msg || '테마 정보 조회 실패');
  return j.calendarData.today;
}

/**
 * 한 날짜 조회 원본. 창 밖이면 slots:null 과 서버 메시지.
 * 오픈 당일 오픈 전에는 msg 가 "예약가능시간이 아닙니다. 예약오픈시간 : 20:00" 이라 openAt 을 뽑는다.
 * themeTimeNum(num) 은 날짜마다 다르다 (요일별로 재사용). 미리 짐작하지 말고 열린 뒤 조회할 것.
 */
export async function day(zizum, theme, date) {
  const j = await proc({ t: 'get_theme_time', date, zizumNum: zizum, themeNum: theme });
  if (!j.status || !Array.isArray(j.data)) {
    const msg = j.msg || '';
    return { slots: null, msg, openAt: /(\d{1,2}:\d{2})/.exec(msg)?.[1]?.padStart(5, '0') ?? null };
  }
  return {
    slots: j.data.map((s) => ({
      num: String(s.num),
      time: `${s.hh}:${s.mm}`,
      open: s.enable === 'Y',
    })),
    msg: '',
    openAt: null,
  };
}

/** 한 날짜의 슬롯. 창 밖이면 null */
export async function slots(zizum, theme, date) {
  return (await day(zizum, theme, date)).slots;
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 예약 가능 창 전체 → { today, dates: { 'YYYY-MM-DD': [slot] } } */
export async function scan(t) {
  const today = await serverToday(t.info);
  const dates = {};
  for (let i = 0; i < t.doing; i++) {
    const d = addDays(today, i);
    const s = await slots(t.zizum, t.theme, d);
    if (s) dates[d] = s;
  }
  return { today, dates };
}

/* ─────────── 대상 테마 ─────────── */

export const reserveUrl = (t) =>
  `${BASE}/reservation1.php?${new URLSearchParams({
    zizum_num: t.zizum,
    theme_num: t.theme,
    theme_info_num: t.info,
  })}`;

/** reservation1.php URL 에서 zizum / theme / info 를 뽑는다 */
export function parseUrl(url) {
  const q = new URL(url).searchParams;
  const zizum = q.get('zizum_num');
  const info = q.get('theme_info_num');
  if (!zizum || !info) throw new Error(`zizum_num 과 theme_info_num 이 필요합니다: ${url}`);
  return { zizum, info, theme: q.get('theme_num') || '' };
}

/** {zizum, info} → 이름·themeNum·doing 이 채워진 대상 */
export async function resolve({ zizum, info }) {
  const t = (await themes(zizum)).find((x) => x.info === String(info));
  if (!t) throw new Error(`${branchName(zizum)} 에 theme_info_num=${info} 테마가 없습니다`);
  return { zizum: String(zizum), branch: branchName(zizum), ...t };
}

/* ─────────── 변화 감지 ─────────── */

/**
 * prev / next = { 'YYYY-MM-DD': [slot] }
 * 이전에도 보였던 날짜에서 N → Y 로 바뀐 슬롯만 돌려준다.
 * 처음 보이는 날짜(새로 열린 날)는 취소표가 아니므로 제외한다.
 */
export function newlyOpen(prev, next) {
  const out = [];
  for (const [date, list] of Object.entries(next)) {
    const before = prev[date];
    if (!before) continue;
    const wasOpen = new Set(before.filter((s) => s.open).map((s) => s.num));
    for (const s of list) if (s.open && !wasOpen.has(s.num)) out.push({ date, ...s });
  }
  return out;
}

export function openSlots(dates) {
  return Object.entries(dates).flatMap(([date, list]) =>
    list.filter((s) => s.open).map((s) => ({ date, ...s }))
  );
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d} (${dow})`;
}

/* ─────────── 알림 ─────────── */

/**
 * env 에 있는 것 전부로 보낸다.
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   DISCORD_WEBHOOK_URL
 */
export function channels(env = process.env) {
  const out = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push('telegram');
  if (env.DISCORD_WEBHOOK_URL) out.push('discord');
  return out;
}

export async function notify(text, env = process.env) {
  const jobs = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`telegram ${r.status} ${await r.text()}`);
      })
    );
  }
  if (env.DISCORD_WEBHOOK_URL) {
    jobs.push(
      fetch(env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text.slice(0, 2000) }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`discord ${r.status} ${await r.text()}`);
      })
    );
  }
  const res = await Promise.allSettled(jobs);
  return res.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason));
}
