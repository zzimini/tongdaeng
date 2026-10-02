import { BRANCHES, branch, scan, findSlot, prepare, book } from '@/lib/doom';
import { splitPhone } from '@/lib/keyescape-book';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(data, status = 200) {
  return Response.json(data, { status });
}

/**
 * 읽기 전용: 시간표 (오픈 대기 조회도 이걸로)
 *   GET ?zizum=4&date=2026-10-06
 */
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const zizum = q.get('zizum') || '';
  const date = q.get('date') || '';
  if (!branch(zizum) || !DATE.test(date)) {
    return json({ ok: false, msg: 'zizum / date 형식이 틀렸습니다', branches: BRANCHES }, 400);
  }
  try {
    const t0 = Date.now();
    const sc = await scan({ cookie: '' }, zizum, date);
    const open = sc.themes.reduce((n, t) => n + t.slots.filter((s) => s.open).length, 0);
    console.log(
      `[doom] ${new Date().toTimeString().slice(0, 8)} zizum=${zizum} ${date} ` +
        `${sc.themes.some((t) => t.slots.length) ? `열린 슬롯 ${open}` : sc.themes[0]?.closed || '빈 페이지'} · ${Date.now() - t0}ms`
    );
    return json({ ok: true, date, ...sc });
  } catch (e) {
    return json({ ok: false, msg: String(e?.message || e) }, 502);
  }
}

/**
 * 실제 예약 (관리자 키 필요)
 *   act=dry   그 슬롯의 입력 폼까지 읽고 보낼 필드만 돌려줌 (예약 안 됨)
 *   act=book  { zizum, date, theme, time } 을 조회해서 열려 있으면 바로 예약 → 확정
 *             num 을 같이 주면 (오픈 대기에서 이미 찾은 경우) 조회를 건너뛴다
 */
export async function POST(request) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return json({ ok: false, msg: 'ADMIN_KEY 환경변수가 설정되지 않았습니다' }, 500);
  if (request.headers.get('x-admin-key') !== expected) {
    return json({ ok: false, msg: '인증 실패 — 관리자 키를 확인하세요' }, 401);
  }

  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, msg: '잘못된 요청 본문' }, 400);
  }

  const zizum = String(b.zizum || '');
  const date = String(b.date || '');
  const theme = String(b.theme || '');
  const time = String(b.time || '');
  const name = String(b.name || '').trim();
  const phone = splitPhone(b.phone);
  const person = String(b.person || '2');
  if (!branch(zizum) || !DATE.test(date) || !theme || !/^\d{2}:\d{2}$/.test(time)) {
    return json({ ok: false, msg: '지점 · 날짜 · 테마 · 시간을 확인하세요' }, 400);
  }
  if (!name || !phone) return json({ ok: false, msg: '예약자 이름과 연락처(010 뒤 8자리)를 넣으세요' }, 400);

  const t0 = Date.now();
  const sess = { cookie: '' };
  try {
    let num = /^\d+$/.test(String(b.num || '')) ? String(b.num) : '';
    if (!num) {
      const sc = await scan(sess, zizum, date);
      const f = findSlot(sc, theme, time);
      if (!f.slot) return json({ ok: false, stage: f.wait ? '대기' : '마감', msg: f.wait || f.bad, total_ms: Date.now() - t0 });
      num = f.slot.num;
    }
    const who = { date, num, name, phone, person };

    if (b.act === 'dry') {
      const prep = await prepare(sess, who);
      return json({ ...prep, dry: true, num, msg: prep.ok ? '연습: 보낼 필드만 만들고 제출하지 않았습니다' : prep.msg });
    }
    if (b.act !== 'book') return json({ ok: false, msg: `알 수 없는 act: ${b.act}` }, 400);

    const res = await book(sess, who, t0);
    console.log(`[doom] ${new Date().toTimeString().slice(0, 8)} 예약 ${zizum} ${date} ${theme} ${time} → ${res.stage} ${res.msg} · ${res.total_ms}ms`);
    return json(res);
  } catch (e) {
    return json({ ok: false, msg: '서버 오류', error: String(e?.message || e), total_ms: Date.now() - t0 }, 500);
  }
}
