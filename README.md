# Tongdaeng

방탈출 예약 자동화. Next.js 15 (App Router) + Tailwind v4, Vercel 배포용.

```
app/
  page.jsx              메인 — 예약처 목록 + 다음 오픈 카운트다운
  play33/page.jsx       플레이33 예약 도구
  api/p33/route.js      플레이33 API
  _components/Countdown.jsx
lib/
  venues.js             예약처 레지스트리 ← 새 방탈출은 여기에 추가
  p33.js                플레이33 요청/파싱 로직
```

## 실행

```bash
npm install
cp .env.example .env.local     # ADMIN_KEY 값을 바꿀 것
npm run dev
```

## 배포

GitHub 에 올리고 Vercel Import. **Settings → Environment Variables 에 `ADMIN_KEY` 추가**
(Production / Preview / Development 전부 체크). 이거 없으면 API 가 500 을 냅니다.

## 새 예약처 추가

`lib/venues.js` 에 항목만 넣으면 메인 목록과 카운트다운에 바로 반영됩니다.

```js
{
  slug: 'somewhere',
  name: '어디어디',
  branch: '강남',
  href: '/somewhere',            // 도구가 없으면 null
  status: 'planned',             // ready | partial | blocked | planned
  open: { h: 12, m: 0, label: '매일 12:00' },
  stack: 'PHP · 세션',
  steps: ['슬롯 조회', '예약 전송'],
  note: '한 줄 설명.',
}
```

`status` 가 곧 섹션입니다. `ready` 는 예약까지 끝나는 곳, `partial` 은 일부를 손으로
마무리해야 하는 곳, `blocked` 는 구조상 막힌 곳입니다. `steps` 의 마지막 항목은
`partial` 일 때 붉게 표시되어 "여기서 사람이 개입한다"를 드러냅니다.

## 알아둘 것

**세션이 없습니다.** 서버리스는 요청마다 인스턴스가 달라 PHP 의 `$_SESSION` 이 성립하지
않습니다. 예열 결과(폼 구조 · 토큰 · 쿠키)를 응답의 `state` 로 돌려주고 발사할 때
브라우저가 되돌려 보내는 구조입니다. 그래서 **예열과 발사 사이에 새로고침하면 예열이
날아갑니다.**

**콜드스타트.** Vercel 람다는 한동안 호출이 없으면 잠들고 첫 요청에 1~2초가 더 붙습니다.
오픈 1~2분 전에 `람다 깨우기` 를 눌러두세요.

**확인창 끄기.** `app/play33/page.jsx` 최상단 `CONFIRM_BEFORE_FIRE = false`.

**무료 플랜.** Hobby 로 충분하지만 약관상 상업적 사용은 금지입니다. 개인용으로만 쓰세요.
