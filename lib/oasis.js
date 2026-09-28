import * as cheerio from 'cheerio';
import { req as rawReq } from '@/lib/p33';

/**
 * oasismuseum.com 예약 (완전 자동 · 현금)
 *
 * 흐름:
 *   [1] POST /ticket/reserveInfo  {date, sd_n}         선점
 *   [2] POST /ticket/payment      f_* 필드             예약 생성 + f_tc, 결제화면 HTML
 *   [3] POST /ticket/order_result 결제화면 hidden 전체 현금 확정 (f_payment=0)
 *
 * 오픈 대기 발사(blitz):
 *   슬롯번호는 날짜마다/조회마다 달라진다. 그래서 번호 대신 "시각"만 지정해두면,
 *   서버가 오픈 순간 조회해서 그 시각의 번호를 찾아 곧바로 1→2→3 을 실행한다.
 *   자정에 열리는 날짜는 미리 조회가 불가능하므로 이 방식이 필요하다.
 */

export const BASE = 'https://oasismuseum.com';
export const TICKET = `${BASE}/ticket`;
export const PAYMENT = `${BASE}/ticket/payment`;
export const RESERVE = `${BASE}/ticket/reserveInfo`;
export const RESULT = `${BASE}/ticket/order_result`;
export const SCHEDULE = `${BASE}/ticket/getSchedule`;
export const SEARCH = `${BASE}/ticket/search`;

const XHR = { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/plain, */*' };

/* ─────────── HTTP ─────────── */

/**
 * sess = { cookie } — 요청마다 Set-Cookie 를 누적한다 (PHP 의 COOKIEJAR 역할).
 * 서버 모드에서는 이 쿠키를 클라이언트가 들고 있다가 다음 요청에 돌려준다.
 */
async function req(sess, url, opt = {}) {
  const r = await rawReq(url, { ...opt, cookie: sess.cookie });
  sess.cookie = r.cookie;
  return r;
}

export function cleanCookie(raw) {
  const s = (raw || '').replace(/\s+/g, ' ').trim().replace(/^['"]|['"]$/g, '');
  if (!s) return '';
  const drop = new Set([
    'expires', 'max-age', 'path', 'domain', 'secure',
    'httponly', 'samesite', 'partitioned', 'priority',
  ]);
  const out = [];
  for (const part of s.split(';')) {
    const p = part.trim().replace(/^['"]|['"]$/g, '');
    if (!p || !p.includes('=')) continue;
    const name = p.slice(0, p.indexOf('=')).trim().toLowerCase();
    if (drop.has(name)) continue;
    if (name.startsWith('_ga') || name.startsWith('_gid') || name.startsWith('_gat')) continue;
    out.push(p);
  }
  return out.join('; ');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function hidden(html, name) {
  const n = esc(name);
  let m = new RegExp(`name=["']${n}["'][^>]*value=["']([^"']*)["']`, 'i').exec(html);
  if (m) return m[1];
  m = new RegExp(`value=["']([^"']*)["'][^>]*name=["']${n}["']`, 'i').exec(html);
  return m ? m[1] : '';
}

export function allHidden(html) {
  const out = {};
  for (const [tag] of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
    const name = /name=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    const val = /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    if (name !== '') out[name] = decodeEntities(val);
  }
  return out;
}

/* ─────────── 슬롯 스캔 ─────────── */

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const byTime = (a, b) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return ah * 60 + am - (bh * 60 + bm);
};
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort(byTime).map((k) => [k, o[k]]));

/** 페이지에서 "HH:MM" 텍스트를 찾고, 주변 속성에서 슬롯 번호(sd_n)를 뽑는다 */
export function scanSlots(html) {
  const $ = cheerio.load(html);
  const slots = {};
  const context = {};

  $('*').each((_, el) => {
    const t = norm($(el).text());
    const m = /^(\d{1,2}:\d{2})$/.exec(t);
    if (!m) return;

    // 같은 텍스트를 가진 자식이 있으면 가장 안쪽 요소에서만 처리
    let inner = false;
    $(el).find('*').each((__, c) => {
      if (norm($(c).text()) === t) {
        inner = true;
        return false;
      }
    });
    if (inner) return;

    const time = m[1];
    const attrs = {};
    let cur = el;
    for (let i = 0; i <= 3 && cur && cur.type === 'tag'; i++) {
      for (const [k, v] of Object.entries(cur.attribs || {})) attrs[`${cur.name}.${k}`] = v;
      cur = cur.parent;
    }

    let pick = '';
    for (const [k, v] of Object.entries(attrs)) {
      if (!/^\d{1,7}$/.test(v.trim())) continue;
      if (/sd_?n|data-n$|data-sd|data-id|data-idx|\.value$|data-seq|data-no/i.test(k)) {
        pick = v.trim();
        break;
      }
    }
    if (pick === '') {
      for (const [k, v] of Object.entries(attrs)) {
        if (!/onclick|href/i.test(k)) continue;
        const mm = /(\d{2,7})/.exec(v);
        if (mm) {
          pick = mm[1];
          break;
        }
      }
    }

    if (pick !== '') slots[time] = pick;
    else if (Object.keys(context).length < 12) {
      const node = el.parent || el;
      context[time] = norm($.html(node)).slice(0, 400);
    }
  });

  return [sortKeys(slots), sortKeys(context)];
}

/* ─────────── 단계별 요청 ─────────── */

const ticketUrl = (date, tm) => `${TICKET}?${new URLSearchParams({ date, id: tm })}`;

export async function fetchTicketPage(sess, tm, date) {
  const url = ticketUrl(date, tm);
  const r = await req(sess, url);
  return { ...r, url };
}

/** getSchedule = 이미 찬 슬롯 번호 목록 */
export async function schedule(sess, tm, date) {
  const r = await req(sess, SCHEDULE, {
    post: { tm, date },
    referer: ticketUrl(date, tm),
    headers: XHR,
  });
  const body = r.body.replace(/^\)\]\}'\s*/, '');
  let j = null;
  try {
    j = JSON.parse(body);
  } catch {
    /* JSON 아님 */
  }
  return {
    code: r.code,
    ms: r.ms,
    available: Array.isArray(j) || (j && typeof j === 'object') ? j : null,
    raw: r.body.trim().slice(0, 800),
  };
}

/** 이미 찬 번호 목록을 문자열 배열로 */
export function takenList(sch) {
  if (!sch.available) return null;
  return Object.values(sch.available).map(String);
}

export async function reserve(sess, date, sdN, tm) {
  const r = await req(sess, RESERVE, {
    post: { date, sd_n: sdN },
    referer: ticketUrl(date, tm),
    headers: XHR,
  });
  let j = null;
  try {
    j = JSON.parse(r.body);
  } catch {
    /* JSON 아님 */
  }
  return {
    code: r.code,
    ms: r.ms,
    json: j && typeof j === 'object' ? j : null,
    raw: plain(r.body).slice(0, 1200),
    ok: r.code >= 200 && r.code < 400,
  };
}

export async function payment(sess, payload) {
  const r = await req(sess, PAYMENT, {
    post: payload,
    referer: ticketUrl(payload.f_date, payload.f_tm),
  });

  const html = r.body;
  const text = plain(html);

  let tc = hidden(html, 'f_tc');
  if (tc === '') tc = /ticket\/payment\?id=(\d+)/.exec(html)?.[1] ?? '';

  const rejected = text.includes('정상적인 접근이 아닙니다');
  const mismatch = text.includes('일치하지 않');

  return {
    code: r.code,
    ms: r.ms,
    final_url: r.url,
    f_tc: tc,
    good_mny: hidden(html, 'good_mny'),
    buyr_name: hidden(html, 'buyr_name'),
    f_discount: hidden(html, 'f_discount'),
    ok: tc !== '' && !mismatch,
    rejected,
    mismatch,
    html,
    text: text.slice(0, 1000),
  };
}

export async function orderResult(sess, payHtml, overrides) {
  const fields = allHidden(payHtml);
  fields.f_payment = '0';
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== '' && v != null) fields[k] = v;
  }
  const r = await req(sess, RESULT, { post: fields, referer: PAYMENT });
  const text = plain(r.body);

  const bad = text.includes('정상적인 접근') || text.includes('일치하지 않');

  return {
    code: r.code,
    ms: r.ms,
    final_url: r.url,
    sent_count: Object.keys(fields).length,
    ok: r.code >= 200 && r.code < 400 && !bad,
    raw: text.slice(0, 1500),
  };
}

const omitHtml = ({ html, ...rest }) => rest;

/** 선점 → 예약 → 확정 을 한 번에 (payload 는 f_sd_n 이 채워진 상태여야 함) */
export async function full(sess, payload, t0) {
  const pre = await reserve(sess, payload.f_date, payload.f_sd_n, payload.f_tm);
  const pay = await payment(sess, payload);

  if (!pay.ok) {
    return {
      ok: false,
      stage: '예약 실패',
      msg: pay.mismatch
        ? '가격 불일치 — 총액 확인'
        : pay.rejected
          ? '서버 거부 — 선점 실패/마감'
          : 'f_tc 없음',
      sd_n: payload.f_sd_n,
      reserveInfo: pre,
      payment: omitHtml(pay),
      payload,
      total_ms: Date.now() - t0,
    };
  }

  const confirm = await orderResult(sess, pay.html, {
    f_tc: pay.f_tc,
    f_name: payload.f_name,
    f_tel: payload.f_tel,
    f_person: payload.f_person,
  });

  return {
    ok: pay.ok && confirm.ok,
    f_tc: pay.f_tc,
    sd_n: payload.f_sd_n,
    reserveInfo: pre,
    payment: omitHtml(pay),
    order_result: confirm,
    payload,
    confirm_url: SEARCH,
    total_ms: Date.now() - t0,
  };
}
