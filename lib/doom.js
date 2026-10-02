import * as cheerio from 'cheerio';
import { req as rawReq } from '@/lib/p33';
import { addDays } from './doom-open.js';

/**
 * doomescape.com 예약 (완전 자동 · 캡차 없음 · 결제 없음)
 *
 * 흐름 (전부 페이지 이동이라 개발자도구 Fetch/XHR 에는 안 보인다):
 *   [1] GET  layout/res/home.php?go=rev.make&rev_days&s_zizum      테마별 시간표. 열린 시간만 theme_time_num 링크
 *   [2] GET  layout/res/home.php?go=rev.make.input&rev_days&theme_time_num   입력 폼 (가격 등 hidden)
 *       POST core/res/rev.act.php    name · mobile1~3 · person · ck_agree + hidden   → 예약 생성, num 을 받음
 *   [3] GET  layout/res/home.php?go=rev.kcp&num                     결제 화면 (현장/무통장이면 실제 결제 없음)
 *       POST core/res/rev.make.mutong.php   결제 화면 폼 그대로       → 확정
 *   [4]      layout/res/home.php?go=rev.make.end&num&ck_code        완료
 *
 * 2단계 POST 응답과 3단계 폼은 실제 예약으로만 볼 수 있어서, 응답에서 num · ck_code 를
 * 주소/스크립트 어디에 있든 찾도록 느슨하게 파싱한다. 실패하면 원문 일부를 같이 돌려준다.
 */

export const BASE = 'https://doomescape.com';
export const HOME = `${BASE}/layout/res/home.php`;
export const ACT = `${BASE}/core/res/rev.act.php`;
export const MUTONG = `${BASE}/core/res/rev.make.mutong.php`;

export { BRANCHES, branch, addDays, kstMs, kstToday, opensAt, nextOpening } from './doom-open.js';

/* ─────────── HTTP ─────────── */

async function req(sess, url, opt = {}) {
  const r = await rawReq(url, { ...opt, cookie: sess.cookie });
  sess.cookie = r.cookie;
  return r;
}

const plain = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** 페이지의 alert('...') 문구들 */
const alerts = (html) => [...html.matchAll(/alert\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);

const makeUrl = (zizum, date) => `${HOME}?${new URLSearchParams({ rev_days: date, s_zizum: zizum, go: 'rev.make' })}`;
const inputUrl = (date, num) =>
  `${HOME}?${new URLSearchParams({ go: 'rev.make.input', rev_days: date, theme_time_num: num })}`;
const kcpUrl = (num) => `${HOME}?${new URLSearchParams({ go: 'rev.kcp', num })}`;
export const endUrl = (num, ck) => `${HOME}?${new URLSearchParams({ go: 'rev.make.end', num, ck_code: ck })}`;

/** form[name=register] 를 브라우저가 보낼 값 그대로 */
function formFields(html, name = 'register') {
  const $ = cheerio.load(html);
  const form = $(`form[name=${name}]`).first();
  const out = {};
  form.find('input,select,textarea').each((_, el) => {
    const $el = $(el);
    const n = $el.attr('name');
    if (!n || $el.attr('disabled') !== undefined) return;
    const tag = el.tagName.toLowerCase();
    const type = ($el.attr('type') || '').toLowerCase();
    if (tag === 'select') {
      const opt = $el.find('option[selected]').first();
      out[n] = (opt.length ? opt : $el.find('option').first()).attr('value') ?? '';
    } else if (type === 'radio' || type === 'checkbox') {
      if ($el.attr('checked') !== undefined) out[n] = $el.attr('value') ?? 'on';
    } else if (tag === 'textarea') {
      out[n] = $el.text();
    } else {
      out[n] = $el.attr('value') ?? '';
    }
  });
  return { found: form.length > 0, action: form.attr('action') || '', fields: out };
}

/* ─────────── [1] 시간표 ─────────── */

/**
 * → { serverDate, themes: [{ name, closed, slots: [{ time, num, open }] }] }
 * 아직 안 열린 날짜는 테마마다 closed 문구("…예약가능일이 아닙니다")만 있고 시간이 없다.
 */
export async function scan(sess, zizum, date) {
  const r = await req(sess, makeUrl(zizum, date));
  const $ = cheerio.load(r.body);
  const themes = [];
  $('.tm_box').each((_, box) => {
    const $b = $(box);
    const name = $b.find('.tit .name').first().text().trim();
    if (!name) return;
    const closed = $b.find('.reserve_info').text().trim();
    const slots = [];
    $b.find('.time li').each((__, li) => {
      const $li = $(li);
      const time = /(\d{1,2}:\d{2})/.exec($li.find('.num').text())?.[1]?.padStart(5, '0');
      if (!time) return;
      const num = /theme_time_num=(\d+)/.exec($li.find('a').attr('href') || '')?.[1] || '';
      slots.push({ time, num, open: !!num });
    });
    themes.push({ name, closed, slots });
  });
  return { serverDate: r.serverDate, ms: r.ms, code: r.code, themes };
}

/** 그 테마·시각의 슬롯 → { slot } | { wait: 문구 } | { bad: 문구 } */
export function findSlot(sc, theme, time) {
  const t = sc.themes.find((x) => x.name === theme);
  if (!t) return { bad: `테마 "${theme}" 가 없습니다 (${sc.themes.map((x) => x.name).join(', ') || '빈 페이지'})` };
  if (!t.slots.length) return { wait: t.closed || '시간표 없음' };
  const s = t.slots.find((x) => x.time === time);
  if (!s) return { bad: `${theme} 에 ${time} 이 없습니다 (${t.slots.map((x) => x.time).join(', ')})` };
  if (!s.open) return { bad: `${theme} ${time} 은 이미 마감입니다` };
  return { slot: s };
}

/* ─────────── [2] 예약 정보 ─────────── */

/** 입력 폼 + 우리 값 → rev.act.php 로 보낼 필드 (보내지는 않음) */
export async function prepare(sess, { date, num, name, phone, person }) {
  const r = await req(sess, inputUrl(date, num), { referer: makeUrl('', date) });
  const f = formFields(r.body);
  if (!f.found) {
    return { ok: false, msg: alerts(r.body)[0] || '입력 폼을 못 찾았습니다', raw: plain(r.body).slice(0, 600), ms: r.ms };
  }
  const p = String(person || 2);
  const fields = {
    ...f.fields,
    name,
    mobile1: '010',
    mobile2: phone.mobile2,
    mobile3: phone.mobile3,
    person: p,
    ck_agree: 'on', // value 없는 라디오 "동의함" 을 브라우저는 on 으로 보낸다
  };
  // fun_person_update(): 인원에 맞는 price{n} 을 price 로
  if (f.fields[`price${p}`] && f.fields[`price${p}`] !== '0') fields.price = f.fields[`price${p}`];
  delete fields.undefined;
  return { ok: true, url: inputUrl(date, num), fields, ms: r.ms };
}

/** rev.act.php 제출 → num (결제 화면 번호) */
export async function make(sess, prep) {
  const r = await req(sess, ACT, { post: prep.fields, referer: prep.url });
  const hay = `${r.url} ${r.body}`;
  const num = /go=rev\.kcp(?:&|&amp;)num=(\d+)/.exec(hay)?.[1] || /[?&](?:amp;)?num=(\d+)/.exec(hay)?.[1] || '';
  return { ok: !!num, num, alerts: alerts(r.body), final_url: r.url, raw: plain(r.body).slice(0, 600), ms: r.ms };
}

/* ─────────── [3] 확정 ─────────── */

/** 결제 화면 폼 그대로 rev.make.mutong.php 로 → ck_code */
export async function confirm(sess, num) {
  const page = await req(sess, kcpUrl(num), { referer: ACT });
  const f = formFields(page.body);
  if (!f.found) {
    return {
      ok: false,
      msg: alerts(page.body)[0] || '결제 화면 폼을 못 찾았습니다',
      raw: plain(page.body).slice(0, 600),
      ms: page.ms,
    };
  }
  const pay = f.fields.payment || '';
  if (pay !== 'A' && pay !== 'D') {
    // 카드면 실제 결제창(KCP)이라 여기서 멈춘다
    return { ok: false, msg: `결제방식이 현장/무통장이 아닙니다 (payment=${pay || '없음'})`, fields: f.fields, ms: page.ms };
  }
  const r = await req(sess, MUTONG, { post: f.fields, referer: kcpUrl(num) });
  const hay = `${r.url} ${r.body}`;
  const ck = /ck_code=(\d+)/.exec(hay)?.[1] || '';

  // 브라우저처럼 응답 속 스크립트 이동·iframe 을 따라가고 완료 화면까지 연다.
  // 확정 문자가 이 과정(완료 화면 등)에서 나갈 수 있어서, 확정 POST 만 하고 끝내면 문자가 안 온다.
  const followed = await follow(sess, r.body, r.url);
  const end = ck ? endUrl(num, ck) : '';
  if (end && !followed.some((x) => x.url === end)) {
    const e = await req(sess, end, { referer: r.url });
    followed.push({ url: end, code: e.code, ms: e.ms });
  }

  return {
    ok: !!ck,
    ck_code: ck,
    end_url: end,
    payment: pay,
    sent: f.fields,
    alerts: alerts(r.body),
    final_url: r.url,
    followed,
    scripts: scripts(r.body),
    raw: plain(r.body).slice(0, 600),
    ms: page.ms + r.ms + followed.reduce((n, x) => n + x.ms, 0),
  };
}

/** 인라인 스크립트 내용 (확정 응답이 뭘 하는지 기록용) */
const scripts = (html) =>
  [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((x) => x.slice(0, 300))
    .slice(0, 8);

/** 응답 HTML 이 브라우저에서 불러올 같은 사이트 주소들(iframe · location 이동)을 차례로 GET */
async function follow(sess, html, base) {
  const urls = [];
  const add = (u) => {
    try {
      const abs = new URL(u.replace(/&amp;/g, '&'), base);
      if (abs.host !== new URL(BASE).host) return;
      if (/\.(js|css|png|jpe?g|gif|svg|ico|woff2?)$/i.test(abs.pathname)) return;
      if (!urls.includes(abs.toString())) urls.push(abs.toString());
    } catch {
      /* 이상한 주소 */
    }
  };
  for (const m of html.matchAll(/<iframe[^>]+src=['"]?([^'" >]+)/gi)) add(m[1]);
  for (const m of html.matchAll(/\.src\s*=\s*['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of html.matchAll(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of html.matchAll(/location\.replace\(\s*['"]([^'"]+)['"]/g)) add(m[1]);

  const out = [];
  for (const u of urls.slice(0, 5)) {
    const x = await req(sess, u, { referer: base });
    out.push({ url: u, code: x.code, ms: x.ms });
  }
  return out;
}

/** 번호를 아는 슬롯을 [2] → [3] 까지 */
export async function book(sess, who, t0 = Date.now()) {
  const steps = [];
  const prep = await prepare(sess, who);
  steps.push({ step: '입력 폼', ms: prep.ms, ok: prep.ok });
  if (!prep.ok) return { ok: false, stage: '입력 폼', msg: prep.msg, raw: prep.raw, steps, total_ms: Date.now() - t0 };

  const mk = await make(sess, prep);
  steps.push({ step: '예약 생성', ms: mk.ms, ok: mk.ok });
  if (!mk.ok) {
    return {
      ok: false,
      stage: '예약 생성',
      msg: mk.alerts[0] || '응답에서 예약 번호(num)를 못 찾았습니다',
      make: mk,
      steps,
      total_ms: Date.now() - t0,
    };
  }

  const cf = await confirm(sess, mk.num);
  steps.push({ step: '확정', ms: cf.ms, ok: cf.ok });
  return {
    ok: cf.ok,
    stage: cf.ok ? '완료' : '확정',
    msg: cf.ok ? '예약 완료' : cf.msg || cf.alerts?.[0] || '응답에서 ck_code 를 못 찾았습니다',
    num: mk.num,
    kcp_url: kcpUrl(mk.num),
    ...cf,
    steps,
    total_ms: Date.now() - t0,
  };
}
