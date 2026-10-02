'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BRANCHES, branch, addDays, nextOpening, opensAt } from '@/lib/doom-open';

const box =
  'w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm text-bone placeholder:text-edge ' +
  'focus:border-brass/60 focus:outline-none';
const lbl = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute';
const card = 'rounded-xl border border-edge bg-slab p-5 sm:p-6';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const h2 = 'mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute';

const ME_KEY = 'tongdaeng_doom_me';
const ADMIN_KEY = 'tongdaeng_admin_key';

const POLL_FROM = 1_000; // 오픈 몇 ms 전부터 조회 (서버 시계 기준)
const POLL_EVERY = 300; // 조회는 응답을 기다리지 않고 이 간격으로 겹쳐 보낸다 (읽기 전용이라 괜찮음)
const IN_FLIGHT = 4;
const POLL_UNTIL = 90_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => {
  const d = new Date();
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (ymd) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d} (${DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()]})`;
};
const fmtAt = (ms) =>
  new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function left(ms) {
  if (ms <= 0) return '0초';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h && `${h}시간`, (h || m) && `${m}분`, `${s % 60}초`].filter(Boolean).join(' ');
}

/** 조회 결과에서 그 테마·시각 → { num } | { wait } | { bad } (lib/doom.js findSlot 과 같은 판정) */
function pick(j, theme, time) {
  if (!j?.themes) return { wait: j?.msg || '응답 없음' };
  const t = j.themes.find((x) => x.name === theme);
  if (!t) return { bad: `테마 "${theme}" 가 없습니다` };
  if (!t.slots.length) return { wait: t.closed || '시간표 없음' };
  const s = t.slots.find((x) => x.time === time);
  if (!s) return { bad: `${theme} 에 ${time} 이 없습니다` };
  if (!s.open) return { bad: `${theme} ${time} 은 이미 마감입니다` };
  return { num: s.num };
}

export default function Doom() {
  const [adminKey, setAdminKey] = useState('');
  const [me, setMe] = useState({ name: '', phone: '', person: '2' });

  const [zizum, setZizum] = useState('4');
  const [date, setDate] = useState('');
  const [themes, setThemes] = useState([]); // [{ name, times }] 가장 최근 열린 날짜 기준
  const [theme, setTheme] = useState('');
  const [time, setTime] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(null); // PC - 서버 (ms)
  const [state, setState] = useState(null);
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(null); // 완료 응답

  useEffect(() => {
    try {
      const k = window.localStorage.getItem(ADMIN_KEY);
      if (k) setAdminKey(k);
      const saved = JSON.parse(window.localStorage.getItem(ME_KEY) || 'null');
      if (saved) setMe((p) => ({ ...p, ...saved }));
    } catch {
      /* 저장소 막힘 */
    }
  }, []);
  useEffect(() => {
    try {
      if (adminKey) window.localStorage.setItem(ADMIN_KEY, adminKey);
      window.localStorage.setItem(ME_KEY, JSON.stringify(me));
    } catch {
      /* 저장소 막힘 */
    }
  }, [adminKey, me]);

  // 지점이 바뀌면: 다음에 열릴 날짜, 그리고 이미 열린 마지막 날짜로 테마·시간 목록
  useEffect(() => {
    let live = true;
    const next = nextOpening(zizum);
    setDate(next);
    setThemes([]);
    setTheme('');
    setTime('');
    setLoadErr('');
    fetch(`/api/doom?zizum=${zizum}&date=${addDays(next, -1)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j.ok) return setLoadErr(j.msg || '시간표 조회 실패');
        const list = j.themes.filter((t) => t.slots.length).map((t) => ({ name: t.name, times: t.slots.map((s) => s.time) }));
        setThemes(list);
        setTheme(list[0]?.name || '');
        setTime(list[0]?.times[0] || '');
      })
      .catch((e) => live && setLoadErr(String(e)));
    return () => {
      live = false;
    };
  }, [zizum]);

  const times = themes.find((t) => t.name === theme)?.times || [];
  const openMs = date ? opensAt(zizum, date) : NaN;
  const phoneOk = /^(010)?\d{8}$/.test(me.phone.replace(/\D/g, ''));
  const ready = adminKey && me.name.trim() && phoneOk && date && theme && time && !Number.isNaN(openMs);

  const say = (tone, msg) => {
    setState({ tone, msg });
    setLog((l) => [...l.slice(-199), { at: stamp(), tone, msg }]);
  };

  async function post(body) {
    const r = await fetch('/api/doom', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ zizum, date, theme, time, name: me.name.trim(), phone: me.phone, person: me.person, ...body }),
    });
    try {
      return await r.json();
    } catch {
      return { ok: false, msg: `JSON 아님 — HTTP ${r.status}` };
    }
  }

  function report(j, who) {
    if (j.ok) {
      setDone(j);
      say('good', `${who} · 예약 완료 · ${(j.total_ms / 1000).toFixed(2)}초 (${j.steps?.map((s) => `${s.step} ${s.ms}ms`).join(' → ')})`);
    } else {
      say('bad', `${who} · ${j.stage || '실패'} · ${j.msg || j.error || '알 수 없음'}`);
    }
  }

  async function dry() {
    setBusy(true);
    say('wait', '연습 · 입력 폼 읽는 중');
    const j = await post({ act: 'dry' });
    setBusy(false);
    if (j.ok) say('good', `연습 · 슬롯 #${j.num} · 보낼 값: ${Object.entries(j.fields).filter(([k]) => !/^price\d/.test(k)).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    else say('bad', `연습 · ${j.stage || ''} ${j.msg}`);
  }

  async function bookNow() {
    if (!window.confirm(`${fmtDate(date)} ${theme} ${time} 을 실제로 예약합니다`)) return;
    setBusy(true);
    say('wait', '지금 예약 · 보내는 중');
    report(await post({ act: 'book' }), '지금 예약');
    setBusy(false);
  }

  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [armed]);

  // 오픈 대기: 조회(GET, 읽기 전용)는 겹쳐 보내고, 열린 걸 처음 본 순간 예약(POST)은 딱 한 번만 보낸다
  useEffect(() => {
    if (!armed) return;
    let stop = false;
    let lo = -Infinity;
    let hi = Infinity;
    let off = 0; // 서버 - PC
    const clock = () => Date.now() + off;
    const target = openMs;
    const end = (tone, msg) => {
      say(tone, msg);
      setArmed(false);
    };

    // 서버 시각 D 는 [보냄, 받음] 사이 어느 순간의 [D, D+1초) 라서 여러 번 재 범위를 좁힌다
    const ask = async () => {
      const t0 = Date.now();
      let j = null;
      try {
        j = await (await fetch(`/api/doom?zizum=${zizum}&date=${date}`)).json();
      } catch {
        return null;
      }
      const t1 = Date.now();
      if (j?.serverDate) {
        const a = j.serverDate - t1;
        const b = j.serverDate + 1000 - t0;
        [lo, hi] = Math.max(lo, a) <= Math.min(hi, b) ? [Math.max(lo, a), Math.min(hi, b)] : [a, b];
        off = (lo + hi) / 2;
        setSkew(-off);
      }
      return j;
    };
    const calibrate = async (n) => {
      for (let i = 0; i < n && !stop; i++) {
        await ask();
        await sleep(170);
      }
    };

    (async () => {
      say('wait', '서버 시계 맞추는 중');
      await calibrate(6);
      if (stop) return;
      say('wait', `서버 시계 맞춤 · PC 가 ${(Math.abs(off) / 1000).toFixed(2)}초 ${off < 0 ? '빠름' : '느림'} · 목표 ${fmtAt(target)}`);
      const deadline = Math.max(target, clock()) + POLL_UNTIL;
      let recal = false;
      let tries = 0;
      let inFlight = 0;
      let fired = false;
      let last = '';

      const handle = async (n, j) => {
        if (stop || fired) return;
        const r = pick(j, theme, time);
        if (r.num) {
          fired = true;
          say('good', `조회 ${n}회 · 열림 #${r.num} · 예약 보내는 중`);
          const res = await post({ act: 'book', num: r.num });
          report(res, '오픈 대기');
          setArmed(false);
          return;
        }
        if (r.bad) {
          fired = true;
          end('bad', `조회 ${n}회 · ${r.bad}`);
          return;
        }
        if (r.wait !== last) {
          last = r.wait;
          say('wait', `조회 ${n}회 · ${r.wait}`);
        } else {
          setState({ tone: 'wait', msg: `조회 ${n}회 · ${r.wait}` });
        }
      };

      while (!stop && !fired) {
        const rest = target - clock();
        if (rest > POLL_FROM) {
          if (!recal && rest < 15_000) {
            recal = true;
            await calibrate(4);
            continue;
          }
          if (last !== '대기') {
            last = '대기';
            say('wait', '오픈 대기 중');
          }
          await sleep(Math.min(rest - POLL_FROM, 250));
          continue;
        }
        if (clock() > deadline) {
          end('bad', `${POLL_UNTIL / 1000}초 동안 조회했지만 열리지 않았습니다. 오픈 시각을 확인하세요.`);
          return;
        }
        if (inFlight < IN_FLIGHT) {
          const n = ++tries;
          inFlight++;
          ask().then((j) => {
            inFlight--;
            handle(n, j);
          });
        }
        await sleep(POLL_EVERY);
      }
    })();

    return () => {
      stop = true;
    };
  }, [armed]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = { wait: 'text-brass', good: 'text-jade', bad: 'text-rust' };
  const setMeField = (k) => (e) => setMe((p) => ({ ...p, [k]: e.target.value }));
  const lock = armed || busy;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <Link href="/" className="font-mono text-xs text-mute transition hover:text-brass">
        ← Tongdaeng
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-bone">둠이스케이프</h1>
      <p className="mt-1 font-mono text-xs text-mute">완전 자동 예약 · 캡차 없음 · 현장/무통장 결제라 실제 결제 없이 확정까지</p>

      <div className="mt-10 space-y-4">
        <section className={card}>
          <h2 className={h2}>1 · 예약자 (이 브라우저에만 저장)</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto]">
            <div>
              <label className={lbl}>예약자</label>
              <input className={box} value={me.name} onChange={setMeField('name')} placeholder="이름" disabled={lock} />
            </div>
            <div>
              <label className={lbl}>연락처 (010 뒤 8자리)</label>
              <input
                className={box}
                value={me.phone}
                onChange={setMeField('phone')}
                placeholder="1234-5678"
                inputMode="numeric"
                disabled={lock}
              />
            </div>
            <div>
              <label className={lbl}>인원</label>
              <select className={box} value={me.person} onChange={setMeField('person')} disabled={lock}>
                {['2', '3', '4'].map((n) => (
                  <option key={n} value={n}>
                    {n}명
                  </option>
                ))}
              </select>
            </div>
          </div>
          {me.phone && !phoneOk && <p className="mt-2 font-mono text-xs text-rust">010 뒤 8자리를 넣으세요</p>}
          <div className="mt-4">
            <label className={lbl}>관리자 키</label>
            <input
              className={box}
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_KEY"
              disabled={lock}
            />
          </div>
        </section>

        <section className={card}>
          <h2 className={h2}>2 · 지점 · 날짜 · 테마 · 시간</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl}>지점</label>
              <select className={box} value={zizum} onChange={(e) => setZizum(e.target.value)} disabled={lock}>
                {BRANCHES.map((b) => (
                  <option key={b.zizum} value={b.zizum}>
                    {b.name} · {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>날짜</label>
              <input className={box} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={lock} />
            </div>
            <div>
              <label className={lbl}>테마</label>
              <select
                className={box}
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  setTime(themes.find((t) => t.name === e.target.value)?.times[0] || '');
                }}
                disabled={lock}
              >
                {!themes.length && <option value="">{loadErr ? '조회 실패' : '불러오는 중…'}</option>}
                {themes.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>시간</label>
              <select className={box} value={time} onChange={(e) => setTime(e.target.value)} disabled={lock}>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loadErr && <p className="mt-3 font-mono text-xs text-rust">{loadErr}</p>}
          {date && !Number.isNaN(openMs) && (
            <p className="mt-4 text-sm text-mute">
              <span className="text-bone">{fmtDate(date)}</span> 은{' '}
              <span className="text-bone">{fmtAt(openMs)}</span> 에 열립니다 ({branch(zizum)?.name})
              {openMs <= now && ' · 이미 열린 날짜라 대기를 누르면 바로 조회합니다'}
            </p>
          )}
        </section>

        <section className={card}>
          <h2 className={h2}>3 · 예약</h2>
          <div className="flex flex-wrap items-center gap-3">
            {armed ? (
              <button onClick={() => setArmed(false)} className={`${btn} bg-rust text-ink hover:bg-rust/90`}>
                대기 취소
              </button>
            ) : (
              <button
                onClick={() => {
                  setDone(null);
                  setState(null);
                  setLog([]);
                  setNow(Date.now());
                  setArmed(true);
                }}
                disabled={!ready || busy}
                className={`${btn} bg-brass text-ink hover:bg-brass/90`}
              >
                대기 시작
              </button>
            )}
            <button onClick={bookNow} disabled={!ready || lock} className={`${btn} bg-jade text-ink hover:bg-jade/90`}>
              지금 예약
            </button>
            <button onClick={dry} disabled={!ready || lock} className={`${btn} bg-edge text-bone hover:bg-edge/70`}>
              연습 (제출 안 함)
            </button>
            {armed && openMs > now - (skew || 0) && (
              <span className="font-mono text-2xl tabular-nums text-bone">{left(openMs - now + (skew || 0))}</span>
            )}
          </div>
          {state && <p className={`mt-3 font-mono text-xs ${tone[state.tone]}`}>{state.msg}</p>}
          {skew !== null && Math.abs(skew) >= 300 && (
            <p className="mt-2 font-mono text-xs text-mute">
              이 PC 시계가 서버보다 {(Math.abs(skew) / 1000).toFixed(1)}초 {skew > 0 ? '빠릅니다' : '느립니다'} · 서버
              시계 기준으로 셉니다
            </p>
          )}

          {done && (
            <div className="mt-4 rounded-lg border border-jade/40 bg-jade/5 p-4 text-sm">
              <p className="text-jade">예약 완료 · 예약번호 {done.ck_code}</p>
              <a href={done.end_url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-xs text-brass hover:underline">
                둠이스케이프 완료 화면 열기 →
              </a>
            </div>
          )}

          {log.length > 0 && (
            <ol className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-edge p-3 font-mono text-[11px] leading-relaxed">
              {log.map((x, i) => (
                <li key={i} className={tone[x.tone]}>
                  <span className="mr-2 text-mute">{x.at}</span>
                  {x.msg}
                </li>
              ))}
            </ol>
          )}

          <p className="mt-5 font-mono text-[11px] leading-relaxed text-edge">
            대기 시작: 서버 시계로 오픈 {POLL_FROM / 1000}초 전부터 {POLL_EVERY / 1000}초 간격으로 시간표를 겹쳐 조회하고, 그
            시간이 열린 걸 처음 본 순간 예약을 딱 한 번 보냅니다 (입력 → 예약 생성 → 결제 화면 → 확정). 지금 예약: 이미 열린
            날짜를 바로 예약합니다. 연습: 입력 폼까지만 읽고 보낼 값을 보여줍니다. 대기 중엔 이 탭을 앞에 띄워두세요.
          </p>
        </section>
      </div>
    </main>
  );
}
