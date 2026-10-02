/**
 * 예약처 목록. 새 방탈출을 붙이면 여기에 항목만 추가하면 메인에 나타난다.
 *
 * status
 *   'ready'   연결됨      — 도구로 예약까지 끝남
 *   'partial' 부분 지원   — 일부 단계는 손으로 마무리해야 함
 *   'blocked' 미지원      — 구조상 자동화가 막힌 곳
 *   'planned' 준비 중     — 아직 안 붙임
 *
 * open  { h, m, label }  한국 시각 기준 오픈 시각. 없으면 카운트다운에서 제외.
 */
export const VENUES = [
  {
    slug: 'play33',
    name: '플레이33',
    branch: '건대점',
    href: '/play33',
    status: 'ready',
    open: { h: 8, m: 0, label: '매일 08:00' },
    stack: 'Laravel · CSRF 토큰',
    steps: ['슬롯 예열', '예약 전송'],
    note: '예열과 발사를 한 번에 쏘는 원샷까지 붙어 있습니다. 마감된 슬롯은 예열 단계에서 걸러집니다.',
  },
  {
    slug: 'oasis',
    name: '오아시스 뮤지엄',
    branch: '홍대',
    href: '/oasis',
    status: 'ready',
    open: { h: 0, m: 0, label: '자정 · 6일 후 날짜' },
    stack: 'PHP · PHPSESSID',
    steps: ['슬롯 선점', '예약 생성', '현금 확정'],
    note: '선점부터 현금 결제 확정까지 한 번에 끝납니다. 시각만 넣어두면 오픈 순간 슬롯 번호를 찾아 바로 발사합니다.',
  },
  {
    slug: 'doom',
    name: '둠이스케이프',
    branch: '1·2호점 · DTH · FEAR',
    href: '/doom',
    status: 'ready',
    open: { h: 23, m: 0, label: '23:00~24:00 · 지점별' },
    stack: 'PHP · 폼 POST · 캡차 없음',
    steps: ['시간표 조회', '예약 생성', '현장/무통장 확정'],
    note: '캡차도 결제도 없어 확정까지 한 번에 끝납니다. 오픈 대기는 서버 시계로 맞춰 열린 걸 본 순간 예약을 한 번만 보냅니다.',
  },
  {
    slug: 'rabbit',
    name: '토끼굴',
    branch: '홍대점',
    href: '/rabbit',
    status: 'ready',
    open: { h: 23, m: 0, label: '매일 23:00 · 7일 후 날짜' },
    stack: 'Laravel · CSRF 토큰 · 캡차 없음',
    steps: ['세션 예열', '입력 화면', '예약하기 (가상계좌)'],
    note: '시각만 고르면 슬롯 번호 없이 바로 예약됩니다. 오픈 대기는 세션을 미리 받아두고 열린 순간 예약을 한 번만 보냅니다. 입금은 알림톡 계좌로 직접.',
  },
  {
    slug: 'keyescape',
    name: '키이스케이프',
    branch: '전 지점',
    href: '/keyescape',
    status: 'partial',
    stack: 'PHP · JSON 조회 · 텔레그램/디스코드',
    steps: ['슬롯 감시', '취소표 알림', '직접 예약'],
    note: '고른 테마의 닫혀 있던 슬롯이 열리면 날짜와 시간을 텔레그램이나 디스코드로 보내줍니다. 예약은 따로 있는 예약 도우미 페이지에서 북마클릿으로 채우고 캡차만 직접 누릅니다.',
  },
];

export const STATUS = {
  ready: {
    label: '연결됨',
    chip: '작동',
    dot: 'bg-jade',
    text: 'text-jade',
    ring: 'ring-jade/30',
  },
  partial: {
    label: '부분 지원',
    chip: '일부 수동',
    dot: 'bg-brass',
    text: 'text-brass',
    ring: 'ring-brass/30',
  },
  blocked: {
    label: '미지원',
    chip: '막힘',
    dot: 'bg-rust',
    text: 'text-rust',
    ring: 'ring-rust/30',
  },
  planned: {
    label: '준비 중',
    chip: '대기',
    dot: 'bg-mute',
    text: 'text-mute',
    ring: 'ring-mute/20',
  },
};

export const ORDER = ['ready', 'partial', 'blocked', 'planned'];

/** 한국 시각 기준, 다음 hh:mm 까지 남은 밀리초 */
export function msUntilKST(h, m) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());

  const now = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)])
  );

  const cur = (now.hour % 24) * 3600 + now.minute * 60 + now.second;
  let diff = h * 3600 + m * 60 - cur;
  if (diff <= 0) diff += 86400;
  return diff * 1000;
}

/** 오픈 시각이 있는 곳 중 가장 먼저 열리는 곳 */
export function nextUp(venues = VENUES) {
  const withOpen = venues.filter((v) => v.open && v.status !== 'planned');
  if (!withOpen.length) return null;
  return withOpen
    .map((v) => ({ venue: v, ms: msUntilKST(v.open.h, v.open.m) }))
    .sort((a, b) => a.ms - b.ms)[0];
}