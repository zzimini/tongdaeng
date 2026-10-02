import * as cheerio from 'cheerio';
import { req as rawReq, csrfFrom, mkHeaders } from '@/lib/p33';

/**
 * rabbitholeescape.co.kr 예약 (완전 자동 · Laravel · 캡차 없음 · 가상계좌)
 *
 *   [1] GET  /reservation?branch&theme=&date        시간표 (theme 를 비우면 전 테마). 세션 쿠키 + csrf 토큰
 *                                                   열린 시간 버튼에만 .eveHiddenData {branch,theme,date,time}
 *   [2] POST /reservation/create  branch·theme·date·time·_token     시간 클릭 = 입력 화면
 *   [3] POST /reservation/payment (ajax, X-CSRF-TOKEN)               예약하기 버튼
 *        name · phone(010-1234-5678) · people · payment_method=21(가상계좌) · policy=on · branch·theme·date·time
 *        실패하면 { message } (422 등). 성공하면 화면이 /reservation/done 으로 이동 → 계좌 안내
 *        (payment_method 가 1 이면 /reservation 으로 가는데, 홍대점 입력 화면엔 21 하나뿐)
 *
 * 슬롯 번호가 없어서 시각 문자열로 바로 예약한다. 카카오 알림톡은 [3] 을 받은 서버가 보낸다.
 */

export const BASE = 'https://www.rabbitholeescape.co.kr';
export const LIST = `${BASE}/reservation`;
export const CREATE = `${BASE}/reservation/create`;
export const PAYMENT = `${BASE}/reservation/payment`;
export const DONE = `${BASE}/reservation/done`;

export { BRANCHES, branchOf, opensAt, nextOpening } from './rabbit-open.js';

async function req(sess, url, opt = {}) {
  const r = await rawReq(url, { ...opt, cookie: sess.cookie });
  sess.cookie = r.cookie;
  return r;
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const listUrl = (branch, date, theme = '') => `${LIST}?${new URLSearchParams({ branch, theme, date })}`;

/**
 * [1] → { serverDate, token, themes: [{ id, name, slots: [{ time, open }] }] }
 * 안 열린 날짜는 themes 가 비어 있다.
 */
export async function scan(sess, branch, date) {
  const r = await req(sess, listUrl(branch, date));
  const $ = cheerio.load(r.body);
  const ids = {};
  $('select[name=theme] option').each((_, o) => {
    const v = $(o).attr('value');
    if (v) ids[$(o).text().trim()] = v;
  });
  const themes = [];
  $('section.res-item').each((_, sec) => {
    const $s = $(sec);
    const name = $s.find('.res-item-info h2').first().text().trim();
    const slots = [];
    let id = ids[name] || '';
    $s.find('.res-times li').each((__, li) => {
      const $li = $(li);
      const time = /(\d{1,2}:\d{2})/.exec($li.find('span').first().text())?.[1]?.padStart(5, '0');
      if (!time) return;
      const data = $li.find('.eveHiddenData').text();
      if (data && !id) id = String(/"theme"\s*:\s*"?(\d+)/.exec(data)?.[1] || '');
      slots.push({ time, open: !!data });
    });
    if (name) themes.push({ id, name, slots });
  });
  return { serverDate: r.serverDate, ms: r.ms, code: r.code, token: csrfFrom(r.body), themes };
}

/** 그 테마·시각 → { ok } | { wait } | { bad } */
export function findSlot(sc, theme, time) {
  if (!sc.themes.length) return { wait: '아직 안 열린 날짜' };
  const t = sc.themes.find((x) => x.id === String(theme));
  if (!t) return { bad: `테마 ${theme} 가 없습니다 (${sc.themes.map((x) => `${x.id}:${x.name}`).join(', ')})` };
  const s = t.slots.find((x) => x.time === time);
  if (!s) return { bad: `${t.name} 에 ${time} 이 없습니다 (${t.slots.map((x) => x.time).join(', ')})` };
  if (!s.open) return { bad: `${t.name} ${time} 은 이미 마감입니다` };
  return { ok: true, name: t.name };
}

/** 010 뒤 8자리 · 11자리 다 받아서 010-1234-5678 */
export function fmtPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 8) d = `010${d}`;
  if (!/^010\d{8}$/.test(d)) return '';
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** [3] 에 보낼 값 */
export const fields = ({ branch, theme, date, time, name, phone, people }) => ({
  name,
  phone,
  people: String(people || 2),
  payment_method: '21',
  policy: 'on',
  branch: String(branch),
  theme: String(theme),
  date,
  time,
});

/**
 * [2] → [3] → 완료 화면. sess 에는 [1] 을 거친 세션 쿠키, token 은 그 세션의 csrf 토큰.
 */
export async function book(sess, token, who, t0 = Date.now()) {
  const steps = [];
  const slot = { branch: who.branch, theme: who.theme, date: who.date, time: who.time };

  // [2] 시간 클릭. 입력 화면의 토큰이 있으면 그걸로 갈아끼운다
  const c = await req(sess, CREATE, { post: { ...slot, _token: token }, referer: listUrl(who.branch, who.date) });
  steps.push({ step: '입력 화면', ms: c.ms, ok: c.code < 400 });
  if (c.code >= 400) {
    return { ok: false, stage: '입력 화면', msg: `HTTP ${c.code}`, raw: plain(c.body).slice(0, 400), steps, total_ms: Date.now() - t0 };
  }
  const tok = csrfFrom(c.body) || token;

  // [3] 예약하기
  const p = await req(sess, PAYMENT, {
    post: fields(who),
    referer: CREATE,
    headers: mkHeaders(tok, sess.cookie, true),
  });
  let j = null;
  try {
    j = JSON.parse(p.body);
  } catch {
    /* JSON 아님 */
  }
  const ok = p.code >= 200 && p.code < 300;
  steps.push({ step: '예약하기', ms: p.ms, ok });
  if (!ok) {
    const first = j?.errors ? Object.values(j.errors).flat()[0] : '';
    return {
      ok: false,
      stage: '예약하기',
      msg: j?.message || first || `HTTP ${p.code}`,
      code: p.code,
      json: j,
      raw: j ? undefined : plain(p.body).slice(0, 400),
      steps,
      total_ms: Date.now() - t0,
    };
  }

  // 완료 화면 (계좌 안내). 실패해도 예약은 된 상태
  const d = await req(sess, j?.redirect ? new URL(j.redirect, BASE).toString() : DONE, { referer: CREATE });
  steps.push({ step: '완료 화면', ms: d.ms, ok: d.code < 400 });
  const $ = cheerio.load(d.body);
  const done = plain($('#list').html() || d.body).slice(0, 800);

  return { ok: true, stage: '완료', msg: j?.message || '예약 완료', json: j, done, done_url: DONE, steps, total_ms: Date.now() - t0 };
}
