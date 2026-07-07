# PushRun 프로젝트 종합 설계 프롬프트

작성일: 2026-07-06  
초기 버전: v0.1.0  
목표: iOS App Store / Google Play 출시 가능한 러닝 대회 접수 알림 앱

---

## 1. 프로젝트 한 줄 정의

PushRun은 러너가 놓치기 쉬운 러닝 대회 접수 시작 시간을 찾아주고, 사용자가 버튼 한 번만 누르면 `정각`, `30분 전`, `10분 전` 같은 휴대폰 알림을 대회명과 함께 예약해주는 앱이다.

핵심 문장:

> "대회 접수 열리는 순간을 놓치지 않게, 러너의 폰에 미리 울리는 접수 알림."

---

## 2. 참고할 기존 구조

`runnerpyrri-lgtm/runningcall` 저장소의 큰 틀을 참고한다.

참고할 점:

- `README.md`, `CHANGELOG.md`, `docs/ROADMAP.md`, `docs/PROJECT_SPEC.md`, `docs/TODO.md`로 프로젝트 상태를 계속 기록한다.
- `docs/superpowers/specs`와 `docs/superpowers/plans`에 버전별 설계와 실행 계획을 남긴다.
- 핵심 로직은 `packages/core` 또는 `lib`에 순수 함수로 두고 테스트로 잠근다.
- 버전은 SemVer 흐름으로 관리한다. 예: `0.1.0 -> 0.2.0 -> 0.3.0`.
- 매 버전마다 `CHANGELOG.md`, `ROADMAP.md`, `package.json/app.json` 버전을 함께 올린다.

PushRun은 RunningCall과 앱 내용은 다르지만, "문서화된 버전 상승형 프로젝트"라는 체계를 그대로 가져간다.

---

## 3. 권장 기술 스택

### 앱

- Expo React Native
- Expo Router
- TypeScript
- NativeWind 또는 StyleSheet 기반 디자인 토큰
- `expo-notifications`
- `expo-linking`
- `expo-secure-store`
- `expo-updates`

이유:

- iOS와 Android 스토어 출시를 바로 목표로 하므로 PWA보다 Expo 앱이 유리하다.
- Expo Notifications로 로컬 알림과 푸시 알림을 함께 다룰 수 있다.
- EAS Build / EAS Submit으로 앱 빌드와 제출 흐름을 만들 수 있다.

### 백엔드

- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Supabase Edge Functions
- Supabase Cron
- Supabase Realtime 또는 Database Webhooks

역할:

- 대회 정보 저장
- 사용자 알림 구독 저장
- 디바이스 푸시 토큰 저장
- 접수 시간 변경/취소 감지
- 서버 푸시 발송
- 관리자 검수 큐 운영

### 관리자/웹

- Next.js 16 + React + TypeScript
- Vercel 배포
- Supabase Admin API 연동

관리자 기능:

- 대회 등록/수정
- 출처별 변경 내역 확인
- 취소/연기/접수시간 변경 검수
- 사용자 제보 승인

---

## 4. 저장소 구조

```txt
pushrun/
  apps/
    mobile/
      app/
      components/
      features/
      assets/
      app.json
      eas.json
      package.json
    admin/
      app/
      components/
      lib/
      package.json
  packages/
    core/
      src/
        alarm/
        races/
        sources/
        time/
      __tests__/
      package.json
  supabase/
    migrations/
    functions/
      collect-races/
      detect-race-changes/
      send-registration-push/
      handle-user-report/
  docs/
    PROJECT_SPEC.md
    ROADMAP.md
    TODO.md
    DEPLOY.md
    DEVELOPMENT_LOG.md
    superpowers/
      specs/
      plans/
  CHANGELOG.md
  README.md
  package.json
  pnpm-workspace.yaml
```

---

## 5. 핵심 사용자 흐름

### 5.1 첫 실행

1. 앱 소개: "접수 알림을 놓치지 않게 해드릴게요."
2. 알림 권한 요청 전, 왜 필요한지 먼저 설명한다.
3. 관심 지역 선택: 전국 / 서울 / 경기 / 부산 / 대구 / 제주 등
4. 관심 거리 선택: 5K / 10K / Half / Full / Trail / Kids / Relay
5. 홈으로 진입

### 5.2 홈

홈 화면 구성:

- 상단: "곧 열리는 접수"
- 가장 가까운 접수 카드 1개를 크게 표시
- `오늘`, `이번 주`, `이번 달`, `인기`, `마감 임박` 필터
- 내 알림이 켜진 대회 요약
- 검색창: 대회명, 지역, 주최사

대회 카드:

- 대회명
- 지역
- 개최일
- 접수 시작일/시간
- 접수 상태: 예정 / 접수중 / 마감 / 취소 / 연기 / 시간변경
- 신뢰도: 공식 확인 / 다중 출처 확인 / 제보 검수중
- CTA: `알림 켜기`

### 5.3 대회 상세

상세 화면 구성:

- 대회명과 상태 배지
- 접수 시작까지 남은 시간
- 접수 시작 시간
- 접수 사이트 버튼
- 알림 프리셋 선택
- 변경 이력
- 출처 링크
- 사용자 제보 버튼

기본 알림 프리셋:

- 접수 시작 정각
- 30분 전
- 10분 전

추가 선택:

- 1일 전
- 3시간 전
- 1시간 전
- 5분 전

알림 문구 예시:

- 제목: `[서울하프마라톤] 접수 30분 전`
- 내용: `오늘 20:00 접수 시작. 로그인/결제 정보를 미리 준비하세요.`
- 정각 제목: `[서울하프마라톤] 접수 시작!`
- 정각 내용: `지금 신청이 열렸어요. 바로 접수 페이지로 이동하세요.`

알림을 누르면 앱의 대회 상세로 이동하고, 상세에서 공식 접수 페이지로 바로 갈 수 있게 한다.

---

## 6. 데이터 수집 전략

대회 접수 날짜와 시간은 "정확성"이 앱의 생명이다. 그래서 단일 크롤링에 의존하지 않고, 단계형 데이터 파이프라인을 둔다.

### 6.1 출처 우선순위

1. 공식 대회 홈페이지
2. 공식 접수 플랫폼
3. 주최사 공지사항 / 인스타그램 / 네이버 카페 / 블로그
4. 국내 마라톤 일정 모음 사이트
5. 사용자 제보
6. 관리자 수동 입력

MVP에서는 "관리자 수동 입력 + 공식 페이지 링크 + 사용자 제보"부터 시작한다. 이후 출처별 수집기를 붙인다.

### 6.2 수집 대상 필드

```ts
type Race = {
  id: string;
  name: string;
  region: string;
  city?: string;
  venue?: string;
  raceDate?: string;
  distances: RaceDistance[];
  registrationOpenAt: string;
  registrationCloseAt?: string;
  registrationUrl: string;
  officialUrl?: string;
  organizer?: string;
  capacity?: number;
  priceMin?: number;
  priceMax?: number;
  status: "scheduled" | "open" | "closed" | "sold_out" | "cancelled" | "postponed" | "changed" | "unknown";
  sourceConfidence: "official" | "multi_source" | "single_source" | "user_reported" | "needs_review";
  lastVerifiedAt?: string;
};
```

### 6.3 수집 방식

MVP:

- Supabase Admin 화면에서 직접 등록
- 사용자 제보 폼
- 공식 URL 저장
- 관리자가 "확인 완료" 처리

v0.2.0:

- Supabase Cron으로 수집 함수 실행
- 출처별 adapter 구현
- HTML 원문 또는 주요 텍스트 checksum 저장
- 등록 시간/상태/접수 URL 변경 감지

v0.3.0:

- 공식/제휴 API가 있는 곳은 API 우선
- 없는 곳은 약관과 robots.txt를 확인한 뒤 최소 빈도로 수집
- 불안정한 HTML은 관리자 검수 큐로 보낸다

중요:

- 자동 수집 데이터는 바로 사용자에게 확정으로 보여주지 않는다.
- 변경 감지 후 `needs_review` 상태를 거쳐 관리자 승인 또는 다중 출처 확인 후 확정한다.
- 접수 알림은 사용자 신뢰가 핵심이므로, 애매한 데이터에는 "검수중"을 명확히 표시한다.

---

## 7. 취소/연기/변경 감지 전략

취소를 빨리 알아야 하는 이유:

- 이미 알림을 켠 사용자가 잘못된 시간에 움직이지 않게 해야 한다.
- 접수 시간이 바뀌면 기존 로컬 알림을 취소하고 새 시간으로 다시 예약해야 한다.

### 7.1 감지 키워드

한국어:

- 취소
- 연기
- 잠정 연기
- 일정 변경
- 접수일 변경
- 접수시간 변경
- 조기마감
- 마감
- 매진
- 접수 종료
- 참가 접수 중단

영어:

- cancelled
- postponed
- rescheduled
- registration changed
- sold out
- closed

### 7.2 감지 로직

```ts
type ChangeEvent = {
  id: string;
  raceId: string;
  sourceId: string;
  changeType: "registration_time" | "status" | "url" | "capacity" | "price" | "content";
  previousValue?: unknown;
  nextValue?: unknown;
  confidence: number;
  detectedAt: string;
  reviewStatus: "auto_confirmed" | "needs_review" | "approved" | "rejected";
};
```

변경 감지 규칙:

- 공식 페이지에서 명확한 취소/연기 키워드가 나오면 즉시 `needs_review` 또는 `auto_confirmed`.
- 접수 시간이 바뀌면 기존 알림 목록에 `reschedule_required` 표시.
- 공식 출처 + 기존 데이터와 다른 시간이면 관리자에게 긴급 검수 큐.
- 두 개 이상 출처가 같은 변경을 말하면 신뢰도 상승.
- 접수 시작 24시간 이내 대회는 더 자주 확인한다.

### 7.3 수집 주기

- 접수 시작 7일 전까지: 하루 2회
- 접수 시작 7일~24시간 전: 1시간마다
- 접수 시작 24시간 이내: 5~10분마다
- 접수 시작 1시간 이내: 1~3분마다, 단 출처 서버에 부담 주지 않도록 rate limit

### 7.4 사용자 알림 변경 처리

상태 변경 시:

- `cancelled`: `[대회명] 접수/대회 취소 공지 확인`
- `postponed`: `[대회명] 일정 연기 공지 확인`
- `registration_time changed`: `[대회명] 접수 시간이 변경됐어요`

앱 내부 처리:

1. 서버가 변경 이벤트 생성
2. 해당 대회 알림 구독 사용자 조회
3. 푸시 발송
4. 앱이 열리면 기존 로컬 예약 알림 취소
5. 새 시간 기준으로 다시 예약
6. 사용자에게 변경 이력 표시

---

## 8. 알림 시스템 설계

알림은 두 겹으로 설계한다.

### 8.1 로컬 알림

사용자가 `알림 켜기`를 누르는 순간 휴대폰 안에 직접 예약한다.

장점:

- 서버가 잠시 느려도 울릴 가능성이 높다.
- "정각/30분 전/10분 전"처럼 정확한 예약에 적합하다.

주의:

- Android에서 정확한 시간 알림은 OS 권한/정책의 영향을 받을 수 있다.
- iOS도 사용자가 알림을 꺼두면 울릴 수 없다.
- 앱은 권한 상태를 계속 확인하고, 권한이 꺼져 있으면 큰 안내를 보여준다.

### 8.2 서버 푸시

Supabase Edge Function이 Expo Push Service로 보낸다.

사용처:

- 대회 취소
- 접수 시간 변경
- 접수 URL 변경
- 조기 마감
- 로컬 예약 실패 보조 알림

### 8.3 예약 데이터

```ts
type AlertSubscription = {
  id: string;
  userId: string;
  raceId: string;
  offsetsMinutes: number[];
  localNotificationIds: string[];
  enabled: boolean;
  timezone: "Asia/Seoul";
  createdAt: string;
  updatedAt: string;
};
```

기본 offset:

```ts
const DEFAULT_ALERT_OFFSETS = [30, 10, 0];
```

알림 예약 함수:

```ts
export function buildRegistrationAlerts(race: Race, offsetsMinutes = DEFAULT_ALERT_OFFSETS) {
  return offsetsMinutes
    .map((offset) => ({
      offset,
      fireAt: subtractMinutes(race.registrationOpenAt, offset),
      title: offset === 0
        ? `[${race.name}] 접수 시작!`
        : `[${race.name}] 접수 ${offset}분 전`,
      body: offset === 0
        ? "지금 신청이 열렸어요. 바로 접수 페이지로 이동하세요."
        : `접수 시작 ${offset}분 전입니다. 로그인/결제 정보를 미리 준비하세요.`,
      data: {
        raceId: race.id,
        url: `/races/${race.id}`
      }
    }))
    .filter((alert) => alert.fireAt > new Date());
}
```

이 함수는 `packages/core`에 두고 테스트로 고정한다.

---

## 9. Supabase DB 설계

### 9.1 주요 테이블

```sql
races
  id uuid primary key
  name text not null
  region text
  city text
  venue text
  race_date timestamptz
  registration_open_at timestamptz not null
  registration_close_at timestamptz
  registration_url text not null
  official_url text
  organizer text
  status text not null
  source_confidence text not null
  last_verified_at timestamptz
  created_at timestamptz
  updated_at timestamptz

race_distances
  id uuid primary key
  race_id uuid references races(id)
  label text
  distance_km numeric

race_sources
  id uuid primary key
  race_id uuid references races(id)
  source_type text
  url text not null
  parser_key text
  last_checked_at timestamptz
  last_hash text
  enabled boolean

source_snapshots
  id uuid primary key
  source_id uuid references race_sources(id)
  content_hash text
  extracted_json jsonb
  captured_at timestamptz

change_events
  id uuid primary key
  race_id uuid references races(id)
  source_id uuid references race_sources(id)
  change_type text
  previous_value jsonb
  next_value jsonb
  confidence numeric
  review_status text
  detected_at timestamptz

profiles
  id uuid primary key references auth.users(id)
  nickname text
  default_region text
  created_at timestamptz

user_devices
  id uuid primary key
  user_id uuid references profiles(id)
  expo_push_token text
  platform text
  app_version text
  notification_permission text
  updated_at timestamptz

alert_subscriptions
  id uuid primary key
  user_id uuid references profiles(id)
  race_id uuid references races(id)
  offsets_minutes integer[]
  local_notification_ids text[]
  enabled boolean
  created_at timestamptz
  updated_at timestamptz

user_reports
  id uuid primary key
  user_id uuid references profiles(id)
  race_id uuid references races(id)
  report_type text
  message text
  evidence_url text
  review_status text
  created_at timestamptz
```

---

## 10. UI 디자인 방향

디자인 키워드:

- 출발선
- 레이스 번호표
- 스톱워치
- 맥박/파동
- 접수 마감의 긴장감
- 하지만 앱은 조급하지 않고 명확해야 한다.

컬러:

- Background: `#F7F8F3`
- Ink: `#101820`
- Volt Lime: `#C8FF2E`
- Coral Alert: `#FF5A3D`
- Mint Success: `#1ED6A3`
- Soft Line: `#E3E7DD`

화면 느낌:

- 큰 카운트다운 숫자
- 낮은 라운드의 깔끔한 카드
- 버튼은 선명하고 눌리는 감각
- "알림 켜짐" 상태가 즉시 눈에 보이게
- 대회 정보는 카드 안에 빽빽하지만 읽기 쉽게

하단 탭:

- 홈
- 탐색
- 내 알림
- 제보
- 설정

주요 컴포넌트:

- `RaceCard`
- `RegistrationCountdown`
- `AlertPresetPicker`
- `SourceConfidenceBadge`
- `RaceStatusPill`
- `ChangeHistoryList`
- `NotificationPermissionBanner`
- `MyAlertsTimeline`

---

## 11. 버전 로드맵

### v0.1.0 — MVP: 직접 등록 대회 + 로컬 알림

목표:

- 대회 목록/상세
- 알림 권한 요청
- 정각/30분/10분 전 로컬 알림 예약
- 알림 취소
- 내 알림 화면
- 핵심 알림 생성 로직 테스트

성공 기준:

- 사용자가 대회 하나를 선택하고 3개 알림을 예약할 수 있다.
- 앱 재실행 후에도 내 알림 상태가 유지된다.
- 권한 거부 상태 안내가 명확하다.

### v0.2.0 — 데이터 변경 감지

목표:

- Supabase 대회 DB
- 관리자 입력 화면
- 공식 URL 체크
- 변경 이벤트 생성
- 취소/연기/접수시간 변경 푸시

성공 기준:

- 등록 시간이 바뀌면 변경 이벤트가 생긴다.
- 사용자는 변경 알림을 받는다.
- 앱을 열면 기존 로컬 알림을 새 시간으로 다시 예약한다.

### v0.3.0 — 로그인/동기화

목표:

- Supabase Auth
- 여러 기기 알림 동기화
- 사용자 관심 지역/거리 저장
- 제보 기능

### v0.4.0 — 출처 수집기와 검수 큐

목표:

- 출처 adapter 구조
- checksum 기반 변경 감지
- 관리자 검수 큐
- 사용자 제보 승인/반려

### v0.5.0 — 앱스토어 준비

목표:

- EAS Build
- 내부 테스트 빌드
- 개인정보처리방침
- 이용약관
- 문의/계정삭제 페이지
- 스토어 스크린샷

### v0.6.0 — 추천/랭킹

목표:

- 인기 대회
- 마감 임박
- 지역별 추천
- 거리별 추천
- "내가 놓치면 아쉬울 대회"

### v1.0.0 — 정식 출시

목표:

- 안정적인 데이터 검수 체계
- 푸시/로컬 알림 신뢰성 검증
- iOS/Android 심사 제출
- 운영 문서 완성

---

## 12. 개발 시 반드시 지킬 원칙

1. 알림 시간 계산은 무조건 순수 함수로 만들고 테스트한다.
2. 모든 시간은 DB에는 UTC로 저장하고, 앱 표시는 `Asia/Seoul` 기준으로 한다.
3. 대회 접수 시간은 변경될 수 있다는 전제로 설계한다.
4. 공식 확인이 안 된 정보는 확정처럼 보이지 않게 한다.
5. 사용자가 알림을 켰을 때 즉시 예약 결과를 보여준다.
6. 앱이 알림 권한이 없는 상태를 숨기지 않는다.
7. 취소/연기 정보는 일반 추천보다 우선순위가 높다.
8. 사용자 제보는 바로 반영하지 않고 검수 큐를 거친다.
9. 매 버전마다 `CHANGELOG.md`, `ROADMAP.md`, `docs/superpowers`를 갱신한다.
10. 앱스토어 제출을 고려해 개인정보 수집 목적을 최소화한다.

---

## 13. 첫 구현 프롬프트

아래 프롬프트를 다음 개발 턴에서 그대로 사용한다.

```txt
PushRun v0.1.0을 구현해줘.

목표:
러닝 대회 접수 시작 시간을 놓치지 않도록 사용자가 대회 상세에서 "알림 켜기"를 누르면 휴대폰 로컬 알림을 정각, 30분 전, 10분 전에 예약하는 Expo React Native 앱을 만든다.

참고:
- runnerpyrri-lgtm/runningcall 저장소의 버전 관리/문서화 구조를 참고한다.
- 앱 내용은 완전히 다르다. PushRun은 러닝 대회 접수 알림 앱이다.
- 초기 버전은 v0.1.0으로 시작한다.

기술:
- pnpm workspace
- apps/mobile: Expo + Expo Router + TypeScript
- packages/core: 알림 시간 계산, 대회 상태, 날짜 유틸 순수 함수
- 테스트: Vitest
- 알림: expo-notifications
- 디자인: 세련된 러닝/레이스 감성. 배경은 밝고, Volt Lime/Coral/Mint 포인트를 쓴다.

구현할 것:
1. 프로젝트 구조 생성
2. README.md, CHANGELOG.md, docs/PROJECT_SPEC.md, docs/ROADMAP.md, docs/TODO.md, docs/DEPLOY.md 생성
3. docs/superpowers/specs/2026-07-06-v0.1.0-mvp-design.md 생성
4. docs/superpowers/plans/2026-07-06-v0.1.0-mvp.md 생성
5. apps/mobile 앱 생성
6. 샘플 대회 데이터 8개 생성
7. 홈 화면: 곧 열리는 접수, 검색, 필터, 대회 카드
8. 대회 상세 화면: 접수 카운트다운, 접수 URL, 알림 프리셋, 알림 켜기/끄기
9. 내 알림 화면: 켜진 알림 목록, 남은 시간, 취소 버튼
10. 설정 화면: 알림 권한 상태, 테스트 알림 버튼
11. packages/core에 buildRegistrationAlerts 함수 구현
12. 정각/30분/10분 전 알림 문구 생성 테스트
13. 과거 시간이면 예약하지 않는 테스트
14. 앱 재실행 후 구독 상태 유지
15. package/app 버전 0.1.0 지정

알림 기본값:
- 20분 전
- 10분 전
- 정각

알림 제목:
- "[대회명] 접수 20분 전"
- "[대회명] 접수 10분 전"
- "[대회명] 접수 시작!"

알림 본문:
- "오늘 HH:mm 접수 시작. 로그인/결제 정보를 미리 준비하세요."
- "지금 신청이 열렸어요. 바로 접수 페이지로 이동하세요."

성공 기준:
- pnpm test 통과
- pnpm typecheck 통과
- Expo 앱 첫 화면이 모바일 기준으로 깨지지 않음
- 알림 권한 안내가 있음
- 알림 켜기 버튼을 누르면 3개 예약이 생성됨
- 알림 끄기 버튼으로 예약을 취소할 수 있음
- README에 실행법과 v0.1.0 범위가 적혀 있음
```

---

## 14. v0.2.0 이후 구현 프롬프트

```txt
PushRun v0.2.0을 구현해줘.

목표:
Supabase를 붙여서 대회 접수 정보 변경/취소/연기를 빠르게 감지하고, 이미 알림을 켠 사용자에게 변경 푸시를 보내는 구조를 만든다.

구현:
1. Supabase migrations 생성
2. races, race_sources, source_snapshots, change_events, profiles, user_devices, alert_subscriptions 테이블 생성
3. RLS 정책 작성
4. supabase/functions/detect-race-changes 구현
5. supabase/functions/send-registration-push 구현
6. Supabase Cron으로 detect-race-changes 주기 실행 문서화
7. 앱에서 Expo Push Token 등록
8. 대회 시간이 변경되면 앱이 기존 로컬 알림을 취소하고 재예약하는 로직 작성
9. 취소/연기/시간변경 알림 카피 추가
10. 변경 이벤트 테스트와 알림 재예약 테스트 작성

성공 기준:
- 변경 이벤트가 생성된다.
- 사용자는 변경 푸시를 받는다.
- 앱을 열면 변경된 접수 시간 기준으로 로컬 알림이 재예약된다.
- 관리자 검수 전 데이터는 needs_review로 표시된다.
```
