/**
 * "매일 open 시각(KST)에 오늘 + lead 일이 새로 열린다" 규칙 계산. 둠이스케이프 · 토끼굴이 같이 쓴다.
 * 화면(클라이언트)도 쓰므로 서버 전용 모듈을 넣지 말 것.
 *
 * rule = { open: 'HH:MM', lead }  →  date 는 (date - lead) 일의 open 에 열린다.
 * 24:00 오픈은 다음 날 00:00 이라 lead 를 하루 줄여 00:00 으로 적는다.
 */

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
export const ruleOpensAt = (rule, date) => (rule ? kstMs(addDays(date, -rule.lead), rule.open) : NaN);

/** 지금 기준 다음에 열릴 날짜 */
export function ruleNextOpening(rule, now = Date.now()) {
  if (!rule) return '';
  // 오늘 + lead 가 아직 안 열렸으면 그게 다음, 열렸으면 하루 뒤
  let d = addDays(kstToday(now), rule.lead);
  if (rule.open === '00:00') d = addDays(d, 1); // 오늘 00:00 은 이미 지났다
  return ruleOpensAt(rule, d) > now ? d : addDays(d, 1);
}
