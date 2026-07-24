import {
  LIST, req, csrfFrom, cleanCookie, doWarm, doFire,
} from '@/lib/p33';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function json(data, status = 200) {
  return Response.json(data, { status });
}

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

  const act = b.act || '';
  const source = b.source === 'manual' ? 'manual' : 'server';
  const mToken = (b.token || '').trim();
  const mCookie = cleanCookie(b.cookie || '');
  const ajax = !!b.ajax;

  const slot = {
    branch: b.branch ?? '',
    theme: b.theme ?? '',
    date: b.date ?? '',
    time: b.time ?? '',
  };
  const input = {
    name: b.name ?? '',
    phone: b.phone ?? '',
    people: b.people ?? '',
  };

  let manual = {};
  if (b.manualJson) {
    try {
      const m = JSON.parse(b.manualJson);
      if (m && typeof m === 'object') manual = m;
    } catch {
      return json({ ok: false, msg: '수동 덮어쓰기 JSON 이 올바르지 않습니다' });
    }
  }

  const target = (b.actionOverride || '').trim();

  try {
    if (act === 'ping') {
      return json({ ok: true, stage: 'ping', now: new Date().toISOString() });
    }

    if (act === 'check') {
      if (!mCookie) return json({ ok: false, msg: '쿠키를 입력하세요' });
      const r = await req(LIST, { cookie: mCookie });
      const server = csrfFrom(r.body);
      const match = !!server && server === mToken;
      return json({
        ok: match,
        code: r.code,
        tokenYou: mToken,
        tokenServer: server,
        cookieFresh: r.cookie,
        msg: match ? '짝 맞음 — 발사 가능' : '짝 안 맞음 — 새 세트로 교체하세요',
      });
    }

    if (source === 'manual' && (act === 'warm' || act === 'blitz')) {
      if (!mToken || !mCookie) {
        return json({ ok: false, msg: '수동 모드에서는 토큰과 쿠키를 둘 다 입력해야 합니다' });
      }
    }

    if (act === 'warm') {
      const w = await doWarm({ source, slot, token: mToken, cookie: mCookie, ajax });
      if (w.err) return json(w.err);
      return json({
        ok: true, stage: '예열', source,
        code: w.code, ms: w.ms,
        action: w.form.action, actionRaw: w.form.actionRaw,
        formId: w.form.formId, method: w.form.method,
        fields: w.form.fields,
        state: { form: w.form, token: w.token, cookie: w.cookie, source },
      });
    }

    if (act === 'fire') {
      const st = b.state;
      if (!st || !st.form) return json({ ok: false, msg: '먼저 예열하세요' });
      const res = await doFire({
        form: st.form,
        token: source === 'manual' ? mToken : st.token,
        cookie: source === 'manual' ? mCookie : st.cookie,
        source, input, manual, target, ajax,
        dry: !!b.dry,
      });
      return json({ ...res, stage: '발사', source });
    }

    if (act === 'blitz') {
      const t0 = Date.now();
      const w = await doWarm({ source, slot, token: mToken, cookie: mCookie, ajax });
      if (w.err) return json({ ...w.err, stage: '예열' });

      const res = await doFire({
        form: w.form, token: w.token, cookie: w.cookie,
        source, input, manual, target, ajax,
        dry: !!b.dry,
      });

      return json({
        ...res,
        stage: '예열+발사',
        source,
        warmMs: w.ms,
        totalMs: Date.now() - t0,
        fields: w.form.fields,
        state: { form: w.form, token: w.token, cookie: w.cookie, source },
      });
    }

    return json({ ok: false, msg: `알 수 없는 act: ${act}` });
  } catch (e) {
    return json({ ok: false, msg: '서버 오류', error: String(e?.message || e) }, 500);
  }
}