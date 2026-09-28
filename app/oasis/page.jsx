'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Countdown from '../_components/Countdown';

const THEMES = [
  ['1', '업사이드 다운'],
  ['5', '미씽 삭스'],
  ['6', '배드 타임'],
  ['8', '하이 맥스'],
  ['15', '4 SUM 1'],
];

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

const LABELS = {
  f_date: '날짜',
  f_sd_time: '시각',
  f_sd_n: '슬롯 번호',
  f_name: '이름',
  f_tel: '전화',
};

const REQUIRED = {
  dry: ['f_date'],
  reserve: ['f_date', 'f_sd_n'],
  payment: ['f_date', 'f_sd_n', 'f_sd_time', 'f_name', 'f_tel'],
  oneshot: ['f_date', 'f_sd_n', 'f_sd_time', 'f_name', 'f_tel'],
  blitz: ['f_date', 'f_sd_time', 'f_name', 'f_tel'],
};

export default function Oasis() {
  const [adminKey, setAdminKey] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [cookie, setCookie] = useState('');
  const jarRef = useRef(''); // 서버 모드 세션 쿠키

  const [f, setF] = useState({
    f_tm: '6',
    f_date: '',
    f_sd_time: '',
    f_sd_n: '',
    f_name: '',
    f_tel: '',
    f_person: '3',
    unit: '30000',
    price_override: '',
    f_agree: 'on',
  });
  const [manual, setManual] = useState('');

  const [slots, setSlots] = useState(null); // { slots, taken }
  const [stat, setStat] = useState('');
  const [ok, setOk] = useState(null);
  const [out, setOut] = useState('요청을 보내면 여기에 응답이 나옵니다.');

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const k = window.localStorage.getItem('tongdaeng_admin_key');
    if (k) setAdminKey(k);
  }, []);
  useEffect(() => {
    if (adminKey) window.localStorage.setItem('tongdaeng_admin_key', adminKey);
  }, [adminKey]);

  const override = parseInt(f.price_override, 10);
  const price =
    override > 0 ? override : (parseInt(f.f_person, 10) || 0) * (parseInt(f.unit, 10) || 0);

  async function call(extra) {
    const r = await fetch('/api/oasis', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        use_manual: useManual ? 1 : '',
        cookie: cookie.trim(),
        jar: jarRef.current,
        ...f,
        f_date: f.f_date.trim(),
        f_sd_time: f.f_sd_time.trim(),
        f_sd_n: f.f_sd_n.trim(),
        price_override: f.price_override.trim(),
        manual_json: manual,
        ...extra,
      }),
    });
    let d;
    try {
      d = await r.json();
    } catch {
      d = { ok: false, msg: `JSON 아님 — HTTP ${r.status}` };
    }
    if (d.jar) jarRef.current = d.jar;
    return d;
  }

  function need(keys) {
    const miss = keys.filter((k) => !String(f[k]).trim());
    if (miss.length) {
      setOk(false);
      setStat('빈 칸: ' + miss.map((k) => LABELS[k] || k).join(', '));
      return false;
    }
    return true;
  }

  async function scan() {
    if (!need(['f_date'])) return;
    setOk(null);
    setStat('조회 중…');
    const d = await call({ act: 'scan' });
    setOut(JSON.stringify(d, null, 2));

    if (d.slots && Object.keys(d.slots).length) {
      setSlots({ slots: d.slots, taken: (d.taken || []).map(String) });
      const openN = d.open ? Object.keys(d.open).length : 0;
      setOk(true);
      setStat(`전체 ${Object.keys(d.slots).length}개 / 예약 가능 ${openN}개`);
    } else {
      setSlots(null);
      setOk(false);
      setStat(d.msg || '자동 추출 실패');
    }
  }

  function pickSlot(time, n) {
    const hh = parseInt(time.split(':')[0], 10);
    setF((p) => ({
      ...p,
      f_sd_time: time,
      f_sd_n: String(n),
      price_override: hh < 12 ? '90000' : '96000',
    }));
  }

  async function run(act) {
    if (!need(REQUIRED[act])) return;

    if (
      act !== 'dry' &&
      !confirm(
        act === 'blitz' || act === 'oneshot'
          ? '실제 예약을 확정까지 진행합니다. 계속할까요?'
          : '요청을 전송합니다. 계속할까요?'
      )
    )
      return;

    setOk(null);
    setStat('전송 중…');
    const d = await call({ act });
    setOut(JSON.stringify(d, null, 2));
    setOk(!!d.ok);
    setStat(
      [
        d.stage && `[${d.stage}]`,
        d.f_tc && `예약번호 ${d.f_tc}`,
        (d.total_ms ?? d.ms) != null && `${d.total_ms ?? d.ms}ms`,
        d.msg,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey && e.key === 'Enter') run('blitz');
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
          <h1 className="mt-2 text-2xl font-semibold text-bone">오아시스 뮤지엄</h1>
          <p className="mt-1 font-mono text-xs text-mute">
            홍대 · 선점 → 예약 → 현금 확정까지 자동 · 자정 오픈 (6일 후 날짜)
          </p>
        </div>
        <div className="text-right">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
            오픈까지
          </p>
          <Countdown h={0} m={0} compact />
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
                value={useManual ? 'manual' : 'server'}
                onChange={(e) => setUseManual(e.target.value === 'manual')}
              >
                <option value="server">서버가 새 세션을 만듭니다</option>
                <option value="manual">브라우저에서 복사한 세션을 씁니다</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className={lbl}>쿠키 · PHPSESSID</label>
            <code className="mb-2 block select-all rounded-lg bg-ink px-3 py-2 font-mono text-[11px] text-jade">
              document.cookie
            </code>
            <textarea
              rows={2}
              className={`${box} font-mono text-xs`}
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="PHPSESSID=... · 서버 모드면 비워두세요"
            />
          </div>
        </section>

        {/* 슬롯 */}
        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">슬롯</h2>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className={lbl}>f_tm · 테마</label>
              <select className={box} value={f.f_tm} onChange={(e) => set('f_tm')(e.target.value)}>
                {THEMES.map(([id, name]) => (
                  <option key={id} value={id}>
                    {id} · {name}
                  </option>
                ))}
              </select>
            </div>
            <Field label="f_date" value={f.f_date} onChange={set('f_date')} placeholder="2026-08-04" />
            <Field label="f_sd_time · 원하는 시각" value={f.f_sd_time} onChange={set('f_sd_time')} placeholder="10:00" />
            <Field label="f_sd_n · 조회 시 자동" value={f.f_sd_n} onChange={set('f_sd_n')} placeholder="비워두면 blitz 가 채움" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={scan}>
              슬롯 조회
            </button>
            {slots &&
              Object.entries(slots.slots).map(([time, n]) => {
                const isOpen = !slots.taken.includes(String(n));
                const on = f.f_sd_time === time && f.f_sd_n === String(n);
                return (
                  <button
                    key={time}
                    onClick={() => pickSlot(time, n)}
                    className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                      isOpen ? 'bg-jade/20 text-jade hover:bg-jade/30' : 'bg-ink text-mute hover:text-bone'
                    } ${on ? 'ring-2 ring-rust ring-offset-1 ring-offset-slab' : ''}`}
                  >
                    {time} ({n})
                  </button>
                );
              })}
          </div>

          <p className="mt-4 font-mono text-[11px] text-edge">
            초록색이 예약 가능. 누르면 시각 · 번호 · 금액이 채워집니다. 오픈 대기 발사는 번호 없이
            시각만 있으면 됩니다.
          </p>
        </section>

        {/* 예약자 / 금액 */}
        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            예약자 · 금액
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="f_name · 이름" value={f.f_name} onChange={set('f_name')} />
            <Field label="f_tel · 하이픈 포함" value={f.f_tel} onChange={set('f_tel')} placeholder="010-0000-0000" />
            <Field label="f_person · 인원 3~" value={f.f_person} onChange={set('f_person')} />
            <Field label="1인 요금 · 예비" value={f.unit} onChange={set('unit')} />
            <Field
              label="총액 · 12시 전 90000 / 후 96000"
              value={f.price_override}
              onChange={set('price_override')}
              placeholder="자동 채워짐"
            />
            <div>
              <label className={lbl}>f_agree</label>
              <select className={box} value={f.f_agree} onChange={(e) => set('f_agree')(e.target.value)}>
                <option value="on">on</option>
                <option value="1">1</option>
                <option value="Y">Y</option>
              </select>
            </div>
          </div>

          <p className="mt-4 font-mono text-sm font-semibold text-bone">
            f_price = {(price || 0).toLocaleString()}원
          </p>
          <p className="mt-1 font-mono text-[11px] text-edge">
            할인 · 최종금액은 확정 단계에서 서버 값을 그대로 씁니다
          </p>

          <div className="mt-4">
            <label className={lbl}>필드 추가 / 덮어쓰기 · JSON</label>
            <textarea
              rows={2}
              className={`${box} font-mono text-xs`}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={'{"f_email":"a@b.com"}'}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className={`${btn} bg-brass px-6 py-3 text-base text-ink hover:bg-brass/90`}
              onClick={() => run('blitz')}
            >
              ⚡ 오픈 대기 발사 · 시각 지정
            </button>
            <button
              className={`${btn} bg-rust px-6 py-3 text-base text-bone hover:bg-rust/85`}
              onClick={() => run('oneshot')}
            >
              ⚡ 예약 발사 · 번호 지정
            </button>
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={() => run('dry')}>
              드라이런
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={() => run('reserve')}>
              선점만
            </button>
            <button className={`${btn} bg-edge text-bone hover:bg-edge/70`} onClick={() => run('payment')}>
              예약만 · 확정 안 함
            </button>
          </div>

          {stat && (
            <p
              className={`mt-4 font-mono text-xs ${
                ok === null ? 'text-mute' : ok ? 'text-jade' : 'text-rust'
              }`}
            >
              {ok === null ? '' : '● '}
              {stat}
            </p>
          )}

          <p className="mt-4 font-mono text-[11px] text-edge">
            자정 오픈: 날짜 · 시각 · 이름 · 전화 · 총액 채우고 정각에 오픈 대기 발사. 슬롯이
            없으면 &quot;대기&quot; → 다시 누르기. Ctrl+Enter = 오픈 대기 발사
          </p>
        </section>

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
