import * as cheerio from 'cheerio';

export const BASE = 'https://play33.kr';
export const LIST = `${BASE}/reservation`;
export const CREATE = `${BASE}/reservation/create`;
export const STORE = `${BASE}/reservation`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/* ─────────── 쿠키 ─────────── */

/** "a=1; b=2" + Set-Cookie 배열 → 병합된 "a=1; b=2" */
export function mergeCookies(current, setCookieList = []) {
  const jar = new Map();
  for (const part of (current || '').split(';')) {
    const p = part.trim();
    if (!p || !p.includes('=')) continue;
    jar.set(p.slice(0, p.indexOf('=')), p);
  }
  for (const sc of setCookieList) {
    const pair = sc.split(';')[0].trim();
    if (!pair.includes('=')) continue;
    jar.set(pair.slice(0, pair.indexOf('=')), pair);
  }
  return [...jar.values()].join('; ');
}

/** 붙여넣은 쿠키 정리: Set-Cookie 속성 제거 */
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
    out.push(p);
  }
  return out.join('; ');
}

export function xsrfFromCookie(cookie) {
  const m = /XSRF-TOKEN=([^;]+)/i.exec(cookie || '');
  return m ? decodeURIComponent(m[1].trim()) : '';
}

export function csrfFrom(html) {
  let m = /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)/i.exec(html);
  if (m) return m[1];
  m = /name=["']_token["'][^>]+value=["']([^"']+)/i.exec(html);
  return m ? m[1] : '';
}

/* ─────────── HTTP ─────────── */

/**
 * cURL 의 COOKIEJAR + FOLLOWLOCATION 을 흉내낸다.
 * 리다이렉트를 직접 따라가며 Set-Cookie 를 누적해야 세션이 유지된다.
 */
export async function req(url, opt = {}) {
  const t0 = Date.now();
  let cookie = opt.cookie || '';
  let target = url;
  let method = opt.post ? 'POST' : 'GET';
  let body = opt.post ? new URLSearchParams(opt.post).toString() : undefined;
  let res;
  let hops = 0;

  for (;;) {
    const headers = {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ko-KR,ko;q=0.9',
      ...(opt.headers || {}),
    };
    if (cookie) headers.cookie = cookie;
    if (opt.referer) headers.referer = opt.referer;
    if (method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';

    res = await fetch(target, { method, body, headers, redirect: 'manual' });

    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    cookie = mergeCookies(cookie, sc);

    const loc = res.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(res.status) && loc && hops < 5) {
      target = new URL(loc, target).toString();
      if (res.status === 303 || (res.status === 302 && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      hops++;
      continue;
    }
    break;
  }

  const text = await res.text();
  // serverDate: 상대 서버 시각 (Date 헤더, 초 단위). 오픈 대기 때 PC 시계 대신 쓴다
  const serverDate = Date.parse(res.headers.get('date') || '') || null;
  return { code: res.status, body: text, url: target, ms: Date.now() - t0, cookie, serverDate };
}

export function mkHeaders(token, cookie, ajax) {
  const h = {};
  if (token) h['x-csrf-token'] = token;
  const x = xsrfFromCookie(cookie);
  if (x) h['x-xsrf-token'] = x;
  if (ajax) {
    h['x-requested-with'] = 'XMLHttpRequest';
    h.accept = 'application/json, text/plain, */*';
  }
  return h;
}

/* ─────────── 폼 파싱 ─────────── */

export function parseForm(html, currentUrl) {
  const $ = cheerio.load(html);
  let best = null;
  let bestScore = -1;

  $('form').each((_, form) => {
    const fields = [];

    $(form).find('input,select,textarea').each((__, el) => {
      const $el = $(el);
      const name = $el.attr('name');
      if (!name || $el.attr('disabled') !== undefined) return;

      const tag = (el.tagName || el.name || '').toLowerCase();
      const type = ($el.attr('type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
      const label = ($el.parent().text() || '').replace(/\s+/g, ' ').trim().slice(0, 80);

      const item = {
        tag,
        type,
        name,
        value: $el.attr('value') || '',
        checked: $el.attr('checked') !== undefined,
        placeholder: $el.attr('placeholder') || '',
        label,
        options: [],
      };

      if (tag === 'select') {
        item.value = '';
        $el.find('option').each((___, op) => {
          const $o = $(op);
          const v = $o.attr('value') || '';
          item.options.push({ value: v, text: $o.text().trim() });
          if ($o.attr('selected') !== undefined) item.value = v;
        });
      }
      if (tag === 'textarea') item.value = $el.text();

      fields.push(item);
    });

    if (fields.length > bestScore) {
      bestScore = fields.length;
      const actionRaw = $(form).attr('action') || '';
      let action = actionRaw || currentUrl;
      if (!action.startsWith('http')) action = `${BASE}/${action.replace(/^\/+/, '')}`;
      best = {
        action,
        actionRaw,
        formId: $(form).attr('id') || '',
        method: ($(form).attr('method') || 'POST').toUpperCase(),
        fields,
      };
    }
  });

  return best;
}

const NAME_RE = /이름|성명|성함|예약자|name|writer/i;
const PHONE_RE = /전화|연락처|휴대|핸드폰|하이픈|phone|tel|mobile|hp/i;
const PEOPLE_RE = /인원|명수|people|person|count|number|qty/i;

export function buildPayload(form, input, manual = {}) {
  const payload = {};
  const mapped = { name: '', phone: '', people: '', agree: [] };

  for (const f of form.fields) {
    const ctx = `${f.name} ${f.placeholder} ${f.label}`;

    if (f.type === 'checkbox') {
      payload[f.name] = f.value !== '' ? f.value : '1';
      mapped.agree.push(f.name);
      continue;
    }
    if (f.type === 'radio') {
      if (f.checked) payload[f.name] = f.value;
      continue;
    }

    let val = f.value;

    if (f.tag === 'select' && PEOPLE_RE.test(ctx)) {
      const want = String(input.people);
      const hit = f.options.find(
        (o) => o.value === want || new RegExp(`(^|\\D)${want}\\s*명`).test(o.text)
      );
      if (hit) {
        val = hit.value;
        mapped.people = f.name;
      }
    } else if (f.type !== 'hidden' && PHONE_RE.test(ctx)) {
      val = input.phone;
      mapped.phone = f.name;
    } else if (f.type !== 'hidden' && NAME_RE.test(ctx)) {
      val = input.name;
      mapped.name = f.name;
    }

    payload[f.name] = val;
  }

  for (const [k, v] of Object.entries(manual || {})) {
    if (k && v !== '' && v != null) payload[k] = v;
  }

  return { payload, mapped };
}

/* ─────────── 예열 / 발사 ─────────── */

export async function doWarm({ source, slot, token: mToken, cookie: mCookie, ajax }) {
  const listUrl = `${LIST}?${new URLSearchParams({
    branch: slot.branch,
    theme: slot.theme,
    date: slot.date,
  })}`;

  let token = '';
  let cookie = '';
  let ms = 0;

  if (source === 'manual') {
    token = mToken;
    cookie = mCookie;
  } else {
    const r1 = await req(listUrl);
    ms += r1.ms;
    cookie = r1.cookie;
    token = csrfFrom(r1.body);
    if (!token) {
      return {
        err: {
          ok: false,
          step: 'list',
          msg: 'CSRF 토큰을 못 찾음',
          code: r1.code,
          raw: r1.body.slice(0, 2000),
        },
      };
    }
  }

  const r2 = await req(CREATE, {
    post: { _token: token, ...slot },
    referer: listUrl,
    cookie,
    headers: mkHeaders(token, cookie, ajax),
  });
  ms += r2.ms;
  if (source !== 'manual') cookie = r2.cookie;

  const form = parseForm(r2.body, CREATE);
  if (!form || !form.fields.length) {
    return {
      err: {
        ok: false,
        step: 'create',
        msg: '폼을 못 찾음',
        code: r2.code,
        raw: r2.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000),
      },
    };
  }

  // 입력칸이 하나도 없으면 예약 폼이 아니라 목록 페이지가 돌아온 것 = 슬롯 마감/미오픈
  if (!form.fields.some((f) => f.type !== 'hidden')) {
    return {
      err: {
        ok: false,
        step: 'create',
        msg: '예약 폼이 아니라 목록 페이지 — 슬롯이 마감이거나 아직 안 열렸습니다',
        code: r2.code,
        fields: form.fields,
      },
    };
  }

  const t2 = csrfFrom(r2.body);
  if (t2) token = t2;

  return { form, token, cookie, code: r2.code, ms };
}

export async function doFire({ form, token, cookie, source, input, manual, target, ajax, dry }) {
  const { payload, mapped } = buildPayload(form, input, manual);
  payload._token = token;

  let url = target || form.action;
  if (!url.startsWith('http')) url = `${BASE}/${url.replace(/^\/+/, '')}`;

  const headers = mkHeaders(token, cookie, ajax);

  if (dry) {
    return { ok: true, dry: true, action: url, payload, mapped, sentHeaders: headers, cookieUsed: cookie };
  }

  const r = await req(url, { post: payload, referer: CREATE, cookie, headers });
  const text = r.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  let apiMsg = '';
  let apiFocus = '';
  try {
    const j = JSON.parse(r.body);
    if (j && typeof j === 'object') {
      apiMsg = j.message || '';
      apiFocus = j.focus || '';
    }
  } catch {
    /* JSON 아님 — 무시 */
  }

  const looksLikeForm = text.includes('예약 정보를 입력해주세요');
  const bad = looksLikeForm || !!apiFocus;

  return {
    ok: r.code >= 200 && r.code < 400 && !bad,
    warning: looksLikeForm
      ? '⚠ 응답이 예약 폼 페이지 — 저장 안 됨'
      : apiFocus
        ? `⚠ 거부된 필드: ${apiFocus}`
        : '',
    apiMessage: apiMsg,
    apiFocus,
    code: r.code,
    ms: r.ms,
    action: url,
    finalUrl: r.url,
    payload,
    mapped,
    sentHeaders: headers,
    raw: text.slice(0, 3000),
  };
}