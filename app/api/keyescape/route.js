import { themes, resolve, scan, day, reserveUrl } from '@/lib/keyescape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 읽기 전용 프록시 (브라우저는 CORS 때문에 keyescape 를 직접 못 부른다)
 *   GET ?zizum=18          → 테마 목록
 *   GET ?zizum=18&info=34  → 예약 가능 창 전체 슬롯
 *   GET ?zizum=18&theme=57&date=2026-10-08 → 그 날짜만 (오픈 대기용, 테마 목록 조회 생략)
 */
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const zizum = q.get('zizum') || '';
  const info = q.get('info') || '';
  const theme = q.get('theme') || '';
  const date = q.get('date') || '';
  if (
    !/^\d{1,4}$/.test(zizum) ||
    (info && !/^\d{1,5}$/.test(info)) ||
    (theme && !/^\d{1,5}$/.test(theme)) ||
    (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
  ) {
    return Response.json({ ok: false, msg: 'zizum / info / theme / date 형식이 틀렸습니다' }, { status: 400 });
  }

  try {
    if (theme && date) {
      const t0 = Date.now();
      const d = await day(zizum, theme, date);
      // 오픈 대기 때 무슨 응답이 왔는지 터미널에 남긴다
      const open = d.slots?.filter((x) => x.open).length;
      console.log(
        `[keyescape] ${new Date().toTimeString().slice(0, 8)} zizum=${zizum} theme=${theme} ${date} ` +
          `${d.slots ? `슬롯 ${d.slots.length}개 (열림 ${open})` : d.msg} · ${Date.now() - t0}ms`
      );
      return Response.json({ ok: true, date, ...d });
    }

    if (!info) return Response.json({ ok: true, themes: await themes(zizum) });

    const t = await resolve({ zizum, info });
    const { today, dates } = await scan(t);
    return Response.json({ ok: true, theme: t, url: reserveUrl(t), today, dates });
  } catch (e) {
    return Response.json({ ok: false, msg: String(e?.message || e) }, { status: 502 });
  }
}
