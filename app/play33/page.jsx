'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Countdown from '../_components/Countdown';

const CONFIRM_BEFORE_FIRE = true; // 오픈 당일엔 false 로 두면 확인창 없이 즉시 전송

const box =
  'w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm text-bone placeholder:text-edge ' +
  'focus:border-brass/60 focus:outline-none';
const lbl = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute';
const card = 'rounded-xl border border-edge bg-slab p-5 sm:p-6';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed';

function Field({ label, value, onChange, ...rest }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input className={box} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

export default function Play33() {
  const [adminKey, setAdminKey] = useState('');
  const [source, setSource] = useState('server');
  const [token, setToken] = useState('');
  const [cookie, setCookie] = useState('');
  const [ajax, setAjax] = useState(true);

  const [slot, setSlot] = useState({ branch: '1', theme: '16', date: '', time: '' });
  const [user, setUser] = useState({ name: '', phone: '', people: '2' });
  const [actionOverride, setActionOverride] = useState('https://play33.kr/reservation');
  const [manualJson, setManualJson] = useState('');

  const [fields, setFields] = useState(null);
  const [stat, setStat] = useState('');
  const [ok, setOk] = useState(null);
  const [out, setOut] = useState('요청을 보내면 여기에 응답이 나옵니다.');
  const stateRef = useRef(null);

  useEffect(() => {
    const k = window.localStorage.getItem('tongdaeng_admin_key');
    if (k) setAdminKey(k);
  }, []);
  useEffect(() => {
    if (adminKey) window.localStorage.setItem('tongdaeng_admin_key', adminKey);
  }, [adminKey]);

  async function call(body) {
    const r = await fetch('/api/p33', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    });
    try {
      return await r.json();
    } catch {
      return { ok: false, msg: `응답을 읽지 못했습니다 — HTTP ${r.status}` };
    }
  }

  const base = (extra) => ({
    source,
    token: token.trim(),
    cookie: cookie.trim(),
    ajax,
    ...slot,
    ...user,
    manualJson,
    actionOverride: actionOverride.trim(),
    ...extra,
  });

  function show(d) {
    setOut(JSON.stringify(d, null, 2));
    setOk(!!d.ok);
    setStat(
      [
        d.stage && `[${d.stage}]`,
        d.code,
        (d.totalMs ?? d.ms) != null && `${d.totalMs ?? d.ms}ms`,
        d.warning,
        d.apiMessage,
        !d.ok && d.msg,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  async function ping() {
    setStat('람다 깨우는 중…');
    show(await call({ act: 'ping' }));
  }

  async function check() {
    setStat('세션 점검 중…');
    const d = await call(base({ act: 'check' }));
    setOut(JSON.stringify(d, null, 2));
    if (d.ok) {
      setOk(true);
      setStat('토큰과 쿠키가 같은 세션입니다');
      return;
    }
    if (d.tokenServer && d.cookieFresh) {
      setToken(d.tokenServer);
      setCookie(d.cookieFresh);
      setOk(false);
      setStat('짝이 안 맞아 새 세트로 바꿨습니다. 다시 점검하세요');
    } else {
      setOk(false);
      setStat(d.msg || '짝이 맞지 않습니다');
    }
  }

  async function warm() {
    setStat('예열 중…');
    const d = await call(base({ act: 'warm' }));
    setOut(JSON.stringify(d, null, 2));
    setOk(!!d.ok);
    if (d.ok) {
      stateRef.current = d.state;
      setFields(d.fields);
      if (source === 'server') {
        setToken(d.state.token || '');
        setCookie(d.state.cookie || '');
      }
      setStat(`예열 완료 · ${d.source} · ${d.ms}ms`);
    } else setStat(d.msg || '예열 실패');
  }

  async function fire(dry) {
    if (!stateRef.current) {
      setOk(false);
      setStat('예열을 먼저 하세요');
      return;
    }
    if (!dry && CONFIRM_BEFORE_FIRE && !confirm('실제 예약을 전송합니다. 진행할까요?')) return;
    setStat(dry ? '드라이런 중…' : '전송 중…');
    show(await call(base({ act: 'fire', dry: dry ? 1 : 0, state: stateRef.current })));
  }

  async function blitz(dry) {
    if (!dry && CONFIRM_BEFORE_FIRE && !confirm('예열 후 곧바로 전송합니다. 진행할까요?')) return;
    setStat(dry ? '원샷 드라이런 중…' : '예열하고 전송 중…');
    const d = await call(base({ act: 'blitz', dry: dry ? 1 : 0 }));
    show(d);
    if (d.fields) setFields(d.fields);
    if (d.state) stateRef.current = d.state;
  }

  useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') blitz(false);
      else if (e.ctrlKey && e.key === 'Enter') fire(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Link href="/" className="font-mono text-xs text-mute transition hover:text-brass">
            ← Tongdaeng
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-bone">플레이33</h1>
          <p className="mt-1 font-mono text-xs text-mute">건대점 · 매일 08:00 오픈</p>
        </div>
        <div className="text-right">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
            오픈까지
          </p>
          <Countdown h={8} m={0} compact />
        </div>
      </div>

      <div className="mt-10 space-y-4">
        {/* 인증 / 세션 */}
        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            인증 · 세션
          </h2>

          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div>
              <label className={lbl}>관리자 키</label>
              <input
                type="password"
                className={box}
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="ADMIN_KEY"
              />
            </div>
            <div>
              <label className={lbl}>세션 소스</label>
              <select
                className={box}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="server">서버가 새 세션을 만듭니다</option>
                <option value="manual">브라우저에서 복사한 세션을 씁니다</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className={lbl}>CSRF 토큰</label>
            <code className="mb-2 block select-all rounded-lg bg-ink px-3 py-2 font-mono text-[11px] text-jade">
              {`document.querySelector('meta[name="csrf-token"]').content`}
            </code>
            <input
              className={box}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="서버 모드면 비워두세요"
            />
          </div>

          <div className="mt-4">
            <label className={lbl}>쿠키 · 33_session 필수</label>
            <textarea
              rows={3}
              className={`${box} font-mono text-xs`}
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="XSRF-TOKEN=...; 33_session=..."
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={check}>
              세션 점검
            </button>
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={ping}>
              람다 깨우기
            </button>
            <label className="flex items-center gap-2 font-mono text-xs text-mute">
              <input
                type="checkbox"
                checked={ajax}
                onChange={(e) => setAjax(e.target.checked)}
                className="accent-brass"
              />
              AJAX 헤더
            </label>
          </div>
        </section>

        {/* 슬롯 / 예약자 */}
        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            슬롯 · 예약자
          </h2>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="branch" value={slot.branch} onChange={(v) => setSlot({ ...slot, branch: v })} />
            <Field label="theme" value={slot.theme} onChange={(v) => setSlot({ ...slot, theme: v })} />
            <Field label="date" value={slot.date} onChange={(v) => setSlot({ ...slot, date: v })} placeholder="2026-07-29" />
            <Field label="time" value={slot.time} onChange={(v) => setSlot({ ...slot, time: v })} placeholder="17:05" />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="성명" value={user.name} onChange={(v) => setUser({ ...user, name: v })} />
            <Field label="전화번호 · 하이픈 포함" value={user.phone} onChange={(v) => setUser({ ...user, phone: v })} placeholder="010-0000-0000" />
            <Field label="인원수" value={user.people} onChange={(v) => setUser({ ...user, people: v })} />
          </div>

          <div className="mt-4">
            <Field label="전송 URL" value={actionOverride} onChange={setActionOverride} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={warm}>
              1. 예열
            </button>
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={() => fire(true)}>
              2. 드라이런
            </button>
            <button
              className={`${btn} bg-rust text-bone hover:bg-rust/85 disabled:bg-edge disabled:text-mute`}
              onClick={() => fire(false)}
              disabled={!fields}
            >
              3. 예약 발사
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
            <button
              className={`${btn} bg-brass px-6 py-3 text-base text-ink hover:bg-brass/90`}
              onClick={() => blitz(false)}
            >
              ⚡ 예열하고 바로 발사
            </button>
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={() => blitz(true)}>
              원샷 드라이런
            </button>
          </div>

          {stat && (
            <p
              className={`mt-4 font-mono text-xs ${
                ok === null ? 'text-mute' : ok ? 'text-jade' : 'text-rust'
              }`}
            >
              {ok === null ? '' : ok ? '● ' : '● '}
              {stat}
            </p>
          )}

          <p className="mt-4 font-mono text-[11px] text-edge">
            발사 Ctrl+Enter · 원샷 Ctrl+Shift+Enter · 예열 상태는 브라우저에 있으니 새로고침하면 사라집니다
          </p>
        </section>

        {/* 감지된 폼 */}
        {fields && (
          <section className={card}>
            <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
              감지된 폼
            </h2>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="text-left text-mute">
                    <th className="border-b border-edge px-1 pb-2 font-medium">name</th>
                    <th className="border-b border-edge px-1 pb-2 font-medium">type</th>
                    <th className="border-b border-edge px-1 pb-2 font-medium">label</th>
                    <th className="border-b border-edge px-1 pb-2 font-medium">value</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={i} className="align-top">
                      <td className="border-b border-edge/60 px-1 py-2 text-brass">{f.name}</td>
                      <td className="border-b border-edge/60 px-1 py-2 text-mute">{f.type}</td>
                      <td className="border-b border-edge/60 px-1 py-2 text-mute">
                        {`${f.placeholder} ${f.label}`.trim().slice(0, 40)}
                      </td>
                      <td className="border-b border-edge/60 px-1 py-2 text-bone">
                        {f.options.length
                          ? f.options.map((o) => `${o.value}:${o.text}`).join(' | ')
                          : f.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5">
              <label className={lbl}>필드 덮어쓰기 · JSON</label>
              <textarea
                rows={2}
                className={`${box} font-mono text-xs`}
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                placeholder={'{"name":"홍길동"}'}
              />
            </div>
          </section>
        )}

        {/* 응답 */}
        <section className={card}>
          <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-mute">응답</h2>
          <pre className="max-h-96 overflow-auto rounded-lg bg-ink p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-bone/80">
            {out}
          </pre>
        </section>
      </div>
    </main>
  );
}
