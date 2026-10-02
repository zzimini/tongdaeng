import { branchOf, scan, findSlot, fmtPhone, fields, book } from '@/lib/rabbit';
import { cleanCookie } from '@/lib/p33';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(data, status = 200) {
  return Response.json(data, { status });
}

/**
 * 읽기 전용: 시간표 (오픈 대기 조회도 이걸로)
 *   GET ?branch=1&date=2026-10-08
 */
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const branch = q.get('branch') || '';
  const date = q.get('date') || '';
  if (!branchOf(branch) || !DATE.test(date)) return json({ ok: false, msg: 'branch / date 형식이 틀렸습니다' }, 400);
  try {
    const t0 = Date.now();
    const { token, ...sc } = await scan({ cookie: '' }, branch, date);
    const open = sc.themes.reduce((n, t) => n + t.slots.filter((s) => s.open).length, 0);
    console.log(
      `[rabbit] ${new Date().toTimeString().slice(0, 8)} ${date} ` +
        `${sc.themes.length ? `열린 슬롯 ${open}` : '안 열림'} · ${Date.now() - t0}ms`
    );
    return json({ ok: true, date, ...sc });
  } catch (e) {
    return json({ ok: false, msg: String(e?.message || e) }, 502);
  }
}

/**
 * 실제 예약 (관리자 키 필요)
 *   act=warm  시간표를 한 번 열어 세션 쿠키(jar)와 csrf 토큰을 받아둠 (오픈 대기 전 예열)
 *   act=dry   시간표에서 그 슬롯을 확인하고 보낼 값만 돌려줌 (예약 안 됨)
 *   act=book  { branch, theme, date, time } 예약. jar + token 을 주면 시간표 조회를 건너뛴다
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

  const branch = String(b.branch || '');
  const date = String(b.date || '');
  const theme = String(b.theme || '');
  const time = String(b.time || '');
  if (!branchOf(branch) || !DATE.test(date)) return json({ ok: false, msg: '지점 · 날짜를 확인하세요' }, 400);

  const t0 = Date.now();
  const sess = { cookie: cleanCookie(b.jar || '') };
  try {
    if (b.act === 'warm') {
      const sc = await scan(sess, branch, date);
      return json({ ok: !!sc.token, jar: sess.cookie, token: sc.token, ms: sc.ms, msg: sc.token ? '예열 완료' : '토큰 없음' });
    }

    const name = String(b.name || '').trim();
    const phone = fmtPhone(b.phone);
    if (!/^\d+$/.test(theme) || !/^\d{2}:\d{2}$/.test(time)) return json({ ok: false, msg: '테마 · 시간을 확인하세요' }, 400);
    if (!name || !phone) return json({ ok: false, msg: '예약자 이름과 연락처(010 포함 11자리)를 넣으세요' }, 400);
    const who = { branch, theme, date, time, name, phone, people: String(b.people || '2') };

    let token = String(b.token || '');
    if (!token || !sess.cookie || b.act === 'dry') {
      const sc = await scan(sess, branch, date);
      const f = findSlot(sc, theme, time);
      if (!f.ok) return json({ ok: false, stage: f.wait ? '대기' : '마감', msg: f.wait || f.bad, total_ms: Date.now() - t0 });
      token = sc.token;
      if (b.act === 'dry') {
        return json({ ok: true, dry: true, theme_name: f.name, fields: fields(who), msg: '연습: 보낼 값만 만들고 제출하지 않았습니다' });
      }
    }
    if (b.act !== 'book') return json({ ok: false, msg: `알 수 없는 act: ${b.act}` }, 400);

    const res = await book(sess, token, who, t0);
    console.log(`[rabbit] ${new Date().toTimeString().slice(0, 8)} 예약 ${date} 테마${theme} ${time} → ${res.stage} ${res.msg} · ${res.total_ms}ms`);
    return json(res);
  } catch (e) {
    return json({ ok: false, msg: '서버 오류', error: String(e?.message || e), total_ms: Date.now() - t0 }, 500);
  }
}
