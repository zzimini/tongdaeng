/**
 * 키이스케이프 취소표 알림봇
 *
 *   npm run keyescape -- "<reservation1.php URL>" ["<URL>" ...] [옵션]
 *
 * 옵션
 *   --every 60          조회 간격(초). 최소 20. 기본 60
 *   --date 2026-10-03   이 날짜만 알림 (여러 번 줄 수 있음)
 *   --after 18:00       이 시각 이후 슬롯만 알림
 *   --before 21:00      이 시각 이전 슬롯만 알림
 *   --test              알림 채널에 테스트 메시지만 보내고 종료
 *
 * 알림 채널은 .env.local 에서 읽는다 (둘 중 하나 이상)
 *   TELEGRAM_BOT_TOKEN=...   TELEGRAM_CHAT_ID=...
 *   DISCORD_WEBHOOK_URL=...
 *
 * 이미 열려 있던 자리는 시작 메시지에 한 번만 보여주고,
 * 그 뒤로는 "닫혀 있다가 열린" 슬롯만 알린다. 새로 열린 날짜는 취소표가 아니라서 조용히 넘긴다.
 */

import {
  parseUrl, resolve, scan, newlyOpen, openSlots, notify, channels, fmtDate, reserveUrl,
} from '../lib/keyescape.js';

/* ─────────── 인자 ─────────── */

const argv = process.argv.slice(2);
const opt = { every: 60, dates: [], after: '', before: '', test: false, urls: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--every') opt.every = Math.max(20, Number(argv[++i]) || 60);
  else if (a === '--date') opt.dates.push(argv[++i]);
  else if (a === '--after') opt.after = argv[++i].padStart(5, '0');
  else if (a === '--before') opt.before = argv[++i].padStart(5, '0');
  else if (a === '--test') opt.test = true;
  else if (a.startsWith('http')) opt.urls.push(a);
  else {
    console.error(`알 수 없는 인자: ${a}`);
    process.exit(1);
  }
}

const log = (...a) =>
  console.log(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul' }), ...a);

if (channels().length === 0) {
  console.error(
    '알림 채널이 없습니다. .env.local 에 TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 또는 DISCORD_WEBHOOK_URL 을 넣으세요.'
  );
  process.exit(1);
}

async function send(text) {
  const errs = await notify(text);
  for (const e of errs) log('알림 실패:', e);
  return errs.length === 0;
}

if (opt.test) {
  const ok = await send('🔔 통댕 키이스케이프 알림 테스트');
  log(ok ? `테스트 전송 완료 (${channels().join(', ')})` : '테스트 전송 실패');
  process.exit(ok ? 0 : 1);
}

if (opt.urls.length === 0) {
  console.error('감시할 예약 페이지 URL 을 넣으세요.\n  npm run keyescape -- "https://www.keyescape.com/reservation1.php?zizum_num=18&theme_num=57&theme_info_num=34"');
  process.exit(1);
}

/* ─────────── 필터 ─────────── */

const wanted = (s) =>
  (opt.dates.length === 0 || opt.dates.includes(s.date)) &&
  (!opt.after || s.time >= opt.after) &&
  (!opt.before || s.time <= opt.before);

const label = (t) => `${t.branch} · ${t.name}`;
const line = (s) => `${fmtDate(s.date)} ${s.time}`;

/* ─────────── 시작 ─────────── */

const targets = [];
for (const u of opt.urls) {
  const t = await resolve(parseUrl(u));
  t.dates = (await scan(t)).dates;
  t.fails = 0;
  targets.push(t);
  log(`감시 시작: ${label(t)} (${Object.keys(t.dates).length}일)`);
}

{
  const parts = targets.map((t) => {
    const open = openSlots(t.dates).filter(wanted);
    return open.length
      ? `${label(t)}\n지금 열린 자리: ${open.map(line).join(', ')}\n${reserveUrl(t)}`
      : `${label(t)}\n지금 열린 자리 없음`;
  });
  const filters = [
    opt.dates.length && `날짜 ${opt.dates.join(', ')}`,
    opt.after && `${opt.after} 이후`,
    opt.before && `${opt.before} 이전`,
  ].filter(Boolean);
  await send(
    `👀 키이스케이프 취소표 감시 시작 (${opt.every}초 간격${filters.length ? ' · ' + filters.join(' · ') : ''})\n\n` +
      parts.join('\n\n')
  );
}

/* ─────────── 루프 ─────────── */

const FAIL_ALERT = 5;
let stop = false;
let wake = () => {};
process.on('SIGINT', () => {
  if (stop) process.exit(0);
  stop = true;
  wake();
  log('종료합니다…');
});

async function tick(t) {
  try {
    const { dates } = await scan(t);
    const fresh = newlyOpen(t.dates, dates).filter(wanted);
    t.dates = dates;

    if (t.fails >= FAIL_ALERT) await send(`✅ ${label(t)} 조회 복구`);
    t.fails = 0;

    if (fresh.length) {
      log(`취소표! ${label(t)} ${fresh.map(line).join(', ')}`);
      await send(
        `🔓 키이스케이프 취소표\n${label(t)}\n\n${fresh.map((s) => `• ${line(s)}`).join('\n')}\n\n${reserveUrl(t)}`
      );
    } else {
      log(`${label(t)} 변화 없음 (열린 자리 ${openSlots(dates).length})`);
    }
  } catch (e) {
    t.fails++;
    log(`${label(t)} 조회 실패 ${t.fails}회: ${e.message}`);
    if (t.fails === FAIL_ALERT) await send(`⚠️ ${label(t)} 조회가 ${FAIL_ALERT}번 연속 실패했습니다: ${e.message}`);
  }
}

const sleep = (ms) =>
  new Promise((r) => {
    const id = setTimeout(r, ms);
    wake = () => (clearTimeout(id), r());
  });

while (!stop) {
  // 간격을 ±20% 흔들어서 매번 같은 초에 두드리지 않게
  await sleep(opt.every * 1000 * (0.8 + Math.random() * 0.4));
  for (const t of targets) {
    if (stop) break;
    await tick(t);
  }
}

await send('🛑 키이스케이프 취소표 감시 종료');
