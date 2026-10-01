import { themes, resolve, scan, reserveUrl } from '@/lib/keyescape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 읽기 전용 프록시 (브라우저는 CORS 때문에 keyescape 를 직접 못 부른다)
 *   GET ?zizum=18          → 테마 목록
 *   GET ?zizum=18&info=34  → 예약 가능 창 전체 슬롯
 */
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const zizum = q.get('zizum') || '';
  const info = q.get('info') || '';
  if (!/^\d{1,4}$/.test(zizum) || (info && !/^\d{1,5}$/.test(info))) {
    return Response.json({ ok: false, msg: 'zizum / info 는 숫자여야 합니다' }, { status: 400 });
  }

  try {
    if (!info) return Response.json({ ok: true, themes: await themes(zizum) });

    const t = await resolve({ zizum, info });
    const { today, dates } = await scan(t);
    return Response.json({ ok: true, theme: t, url: reserveUrl(t), today, dates });
  } catch (e) {
    return Response.json({ ok: false, msg: String(e?.message || e) }, { status: 502 });
  }
}
