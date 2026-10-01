/**
 * keyescape.com 예약 도우미 (반자동 · 캡차는 사람이 누른다)
 *
 *   [1] reservation1.php  달력 · 시간 선택        → 건너뜀: 아래 필드로 reservation2.php 에 바로 POST
 *   [2] reservation2.php  인원 · 이름 · 연락처 · reCAPTCHA · 무통장 · 동의
 *                         → 북마클릿이 캡차 빼고 전부 채움. 캡차 체크와 예약하기는 사람이
 *   [3] reservation3.php?num=<예약 일련번호>&ck_code=<예약번호>
 *
 * 2단계 제출은 run_proc.php t=ins_rev 에 g-recaptcha-response 를 실어 보낸다.
 * 캡차를 우회하거나 대신 푸는 코드는 넣지 않는다.
 * 요금(rev_price)은 인원 선택 시 페이지가 서버 값으로 채우므로 여기서 계산하지 않는다.
 *
 * 취소표 알림봇(scripts/keyescape-watch.mjs)과는 연결하지 않는다.
 */

import { BASE } from './keyescape.js';

export const STEP2 = `${BASE}/reservation2.php`;

/** reservation1.php 의 #form 이 reservation2.php 로 보내는 필드 그대로 */
export function step2Fields(t, date, slot) {
  return {
    zizumNum: t.zizum,
    themeNum: t.theme,
    themeInfoNum: t.info,
    revDays: date,
    themeTimeNum: slot.num,
    revTimes: slot.time,
    themeName: t.name,
  };
}

/**
 * 연락처 → mobile2 / mobile3. 앞자리는 페이지에 010 고정(readonly).
 * '01012345678' · '010-1234-5678' · '12345678' · '1234-5678' 다 받는다.
 */
export function splitPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('010')) d = d.slice(3);
  if (d.length !== 8) return null;
  return { mobile2: d.slice(0, 4), mobile3: d.slice(4) };
}

/** reservation2.php 에서 실행할 채우기 스크립트 (ES5, 사이트 jQuery 사용) */
export function fillScript({ name, phone, person = 2 }) {
  const p = splitPhone(phone);
  if (!p) throw new Error('연락처는 010 뒤 8자리를 넣으세요');
  const c = JSON.stringify({ p: String(person), n: String(name || ''), a: p.mobile2, b: p.mobile3 });

  return `(function(c){
var f=document.getElementById('form');
if(!f||!f.person||!f.mobile2){alert('키이스케이프 예약 2단계 화면(reservation2.php)에서 눌러주세요');return;}
var $=window.jQuery;
function fire(el){if($)$(el).trigger('change');else el.dispatchEvent(new Event('change',{bubbles:true}));}
var ok=[].some.call(f.person.options,function(o){return o.value===c.p;});
if(ok){f.person.value=c.p;fire(f.person);}else{alert(c.p+'명 선택지가 없습니다. 인원을 직접 고르세요');}
f.name.value=c.n;
f.mobile2.value=c.a;
f.mobile3.value=c.b;
if(f.payment){f.payment.value='D';fire(f.payment);}
['agree_1','agree_2','agree_3','agree_all'].forEach(function(k){if(f[k])f[k].checked=true;});
var cap=document.getElementById('captcha');
if(cap)cap.scrollIntoView({block:'center'});
})(${c});`;
}

export function bookmarklet(opts) {
  return `javascript:${encodeURIComponent(fillScript(opts))}`;
}
