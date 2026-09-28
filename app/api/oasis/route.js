import {
  RESERVE, PAYMENT, RESULT,
  cleanCookie, scanSlots, fetchTicketPage, schedule, takenList,
  reserve, payment, full,
} from '@/lib/oasis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  const useManual = !!b.use_manual;

  // 서버 모드: PHP 의 쿠키 파일 대신 클라이언트가 jar 를 들고 다닌다
  const sess = { cookie: useManual ? cleanCookie(b.cookie || '') : cleanCookie(b.jar || '') };
  if (useManual && !sess.cookie) {
    return json({ ok: false, msg: '브라우저 세션 모드인데 쿠키가 비었습니다' });
  }
  // 응답마다 갱신된 서버 쿠키를 돌려준다
  const reply = (data, status) => json(useManual ? data : { ...data, jar: sess.cookie }, status);

  const tm = String(b.f_tm ?? '');
  const date = String(b.f_date ?? '').trim();
  const sdn = String(b.f_sd_n ?? '').trim();
  const wantTime = String(b.f_sd_time ?? '').trim();

  if (date === '') return reply({ ok: false, msg: 'f_date 가 비어 있습니다' });

  try {
    /* ── 슬롯 조회 ── */
    if (act === 'scan') {
      const r = await fetchTicketPage(sess, tm, date);

      let slots = {};
      let context = {};
      let err = '';
      try {
        [slots, context] = scanSlots(r.body);
      } catch (e) {
        err = `${e?.name}: ${e?.message}`;
      }

      const sch = await schedule(sess, tm, date);
      const taken = takenList(sch);
      const open = {};
      if (taken !== null) {
        for (const [time, n] of Object.entries(slots)) {
          if (!taken.includes(String(n))) open[time] = n;
        }
      }

      const found = Object.keys(slots).length > 0;
      return reply({
        ok: found,
        code: r.code, ms: r.ms, url: r.url,
        html_len: r.body.length, scan_error: err,
        slots, taken, open,
        schedule_raw: sch.raw, context,
        msg: found ? '조회 완료' : '자동 추출 실패',
      });
    }

    /* payment payload */
    const person = parseInt(b.f_person, 10) || 0;
    const unit = parseInt(b.unit, 10) || 0;

    const payload = {
      f_tm: tm,
      f_sd_n: sdn,
      f_sd_time: wantTime,
      f_date: date,
      f_price: String(person * unit),
      f_discount: '0',
      f_name: b.f_name ?? '',
      f_tel: b.f_tel ?? '',
      f_person: String(person),
      f_agree: b.f_agree ?? '',
    };
    if (String(b.price_override ?? '').trim()) payload.f_price = String(b.price_override).trim();
    if (b.manual_json) {
      try {
        const m = JSON.parse(b.manual_json);
        if (m && typeof m === 'object') Object.assign(payload, m);
      } catch {
        return reply({ ok: false, msg: '필드 추가/덮어쓰기 JSON 이 올바르지 않습니다' });
      }
    }

    /* ── 드라이런 ── */
    if (act === 'dry') {
      return reply({
        ok: true, dry: true,
        order: ['1. reserveInfo', '2. payment', '3. order_result (현금 확정)'],
        blitz_note: 'blitz 는 f_sd_n 대신 f_sd_time 으로 오픈 순간 조회해서 번호를 찾습니다',
        reserveInfo: { url: RESERVE, payload: { date, sd_n: sdn || '(blitz: 자동)' } },
        payment: { url: PAYMENT, payload },
        order_result: { url: RESULT, note: 'payment 화면 hidden 전체 + f_payment=0' },
        session: useManual ? '브라우저 쿠키' : '서버 쿠키자',
      });
    }

    /* ── 선점만 ── */
    if (act === 'reserve') {
      if (sdn === '') return reply({ ok: false, msg: 'f_sd_n 이 비어 있습니다' });
      const r = await reserve(sess, date, sdn, tm);
      return reply({ ...r, stage: '선점 (reserveInfo)' });
    }

    /* ── 예약만 (확정 안 함) ── */
    if (act === 'payment') {
      if (sdn === '') return reply({ ok: false, msg: 'f_sd_n 이 비어 있습니다' });
      const { html, ...r } = await payment(sess, payload);
      return reply({ ...r, stage: '예약 (payment)', payload });
    }

    /* ── 원샷: 번호를 이미 아는 경우 (선점→예약→확정) ── */
    if (act === 'oneshot') {
      if (sdn === '') return reply({ ok: false, msg: 'f_sd_n 이 비어 있습니다' });
      const res = await full(sess, payload, Date.now());
      return reply({ ...res, stage: res.ok ? '원샷+확정' : res.stage || '실패' });
    }

    /* ── 오픈 대기 발사: 시각으로 지정, 서버가 번호를 찾아 발사 ── */
    if (act === 'blitz') {
      if (wantTime === '') return reply({ ok: false, msg: 'f_sd_time(원하는 시각)을 넣으세요' });
      const t0 = Date.now();

      // 1. 조회 → 그 시각의 번호
      const r = await fetchTicketPage(sess, tm, date);
      const [slots, ctx] = scanSlots(r.body);

      // getSchedule 로도 받아서, 페이지 스캔이 실패해도 원문을 볼 수 있게
      const sch0 = await schedule(sess, tm, date);

      if (!(wantTime in slots)) {
        return reply({
          ok: false, stage: '대기',
          msg: `아직 ${wantTime} 슬롯 번호를 못 잡았습니다 — 다시 누르세요`,
          want: wantTime,
          found_times: Object.keys(slots),
          scan_context: ctx,
          page_code: r.code,
          page_len: r.body.length,
          schedule_raw: sch0.raw,
          total_ms: Date.now() - t0,
        });
      }

      const foundN = String(slots[wantTime]);

      // 2. 예약 가능 여부 확인 (getSchedule = 이미 찬 번호 목록)
      const sch = await schedule(sess, tm, date);
      const taken = takenList(sch) || [];
      if (taken.includes(foundN)) {
        return reply({
          ok: false, stage: '마감',
          msg: `${wantTime} 은 이미 찼습니다 (#${foundN})`,
          total_ms: Date.now() - t0,
        });
      }

      // 3. 번호 채우고 선점→예약→확정
      payload.f_sd_n = foundN;
      const res = await full(sess, payload, t0);
      return reply({ ...res, stage: res.ok ? '오픈발사+확정' : res.stage || '실패' });
    }

    return reply({ ok: false, msg: `알 수 없는 act: ${act}` });
  } catch (e) {
    return reply({ ok: false, msg: '서버 오류', error: String(e?.message || e) }, 500);
  }
}
