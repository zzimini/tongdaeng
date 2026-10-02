/**
 * 둠이스케이프 지점 · 오픈 시각. 화면(클라이언트)도 쓰므로 cheerio 같은 서버 전용 모듈을 넣지 말 것.
 */

/**
 * open 시각(KST)에 오늘 + lead 일이 새로 열린다. 그래서 date 는 (date - lead) 일의 open 에 열린다.
 * 1호점 24:00 오픈은 다음 날 00:00 이라 lead 를 하루 줄여 00:00 으로 적는다.
 * 2026-10-02 에 실제 열린 마지막 날짜로 맞춰 봄: 1·2호점 10/16, DTH 10/8, FEAR 10/6.
 */
export const BRANCHES = [
  { zizum: '1', name: '1호점', open: '00:00', lead: 14, label: '24:00 오픈' },
  { zizum: '2', name: '2호점', open: '23:00', lead: 15, label: '23:00 오픈' },
  { zizum: '3', name: 'DTH점(부평)', open: '23:30', lead: 7, label: '23:30 오픈' },
  { zizum: '4', name: 'FEAR점(수원)', open: '23:45', lead: 5, label: '23:45 오픈' },
];

export const branch = (zizum) => BRANCHES.find((b) => b.zizum === String(zizum));

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' + 'HH:MM' (KST) → epoch ms */
export const kstMs = (ymd, hm) => Date.parse(`${ymd}T${hm}:00+09:00`);

/** 한국 기준 오늘 */
export const kstToday = (ms = Date.now()) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** date 가 열리는 순간 (epoch ms) */
export function opensAt(zizum, date) {
  const b = branch(zizum);
  return b ? kstMs(addDays(date, -b.lead), b.open) : NaN;
}

/** 지금 기준 다음에 열릴 날짜 */
export function nextOpening(zizum, now = Date.now()) {
  const b = branch(zizum);
  if (!b) return '';
  // 오늘 + lead 가 아직 안 열렸으면 그게 다음, 열렸으면 하루 뒤
  let d = addDays(kstToday(now), b.lead);
  if (b.open === '00:00') d = addDays(d, 1); // 오늘 00:00 은 이미 지났다
  return opensAt(zizum, d) > now ? d : addDays(d, 1);
}
