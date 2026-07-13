import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../outputs/pushrun-site/race-calendar-core.js");

function race(overrides = {}) {
  return {
    id: "race-1",
    name: "2026 제10회 서울마라톤",
    raceDate: "2026-11-01T08:00:00+09:00",
    registrationOpenAt: "2026-07-14T14:00:00+09:00",
    registrationCloseAt: "2026-07-31T18:00:00+09:00",
    ...overrides,
  };
}

test("대회명 정규화는 특정 2026년이 아니라 모든 20xx 연도를 일반화한다", () => {
  assert.equal(core.normalizeRaceName("2025 제10회 서울마라톤"), core.normalizeRaceName("2027 서울 Marathon"));
});

test("같은 이름이라도 대회 날짜가 다르면 identity가 다르다", () => {
  assert.notEqual(core.raceIdentity(race()), core.raceIdentity(race({ raceDate: "2027-11-01T08:00:00+09:00" })));
});

test("캘린더에 접수 시작·종목별 시작·마감·대회일을 모두 만든다", () => {
  const events = core.buildRaceCalendarEvents(race({
    registrationWindows: [{ id: "10k", label: "10K", opensAt: "2026-07-16T14:00:00+09:00" }],
  }));
  assert.deepEqual(events.map((event) => event.type), [
    "registration_open",
    "registration_open",
    "registration_close",
    "race_day",
  ]);
  assert.equal(core.eventsForDate([race()], "2026-07-31")[0].label, "접수 마감");
  assert.equal(core.racesForDate([race()], "2026-11-01")[0].id, "race-1");
});

test("월·연도 경계 날짜도 KST 키로 집계한다", () => {
  const counts = core.eventCountsByDate([race({ registrationOpenAt: "2026-12-31T23:30:00+09:00", registrationCloseAt: "2027-01-01T00:30:00+09:00" })]);
  assert.equal(counts.get("2026-12-31"), 1);
  assert.equal(counts.get("2027-01-01"), 1);
});

test("표시 시각과 날짜는 실행 환경 TZ와 무관하게 KST로 고정된다", () => {
  const instant = "2026-07-10T16:30:00Z";
  assert.equal(core.formatKstTime(instant), "01:30");
  assert.match(core.formatKstShortDate(instant), /^7\/11\(/);
  assert.equal(core.formatKstRegistrationPoint("2026-07-10T15:00:00Z"), "7/11(토)");
  assert.equal(core.formatKstRegistrationPoint(instant), "7/11(토) 01:30");
});

test("KST 월 이동과 월·연도 경계 캘린더를 안정적으로 계산한다", () => {
  assert.equal(core.currentKstMonth("2026-07-10T16:30:00Z"), "2026-07");
  assert.equal(core.shiftCalendarMonth("2026-12", 1), "2027-01");
  assert.deepEqual(core.calendarMonthInfo("2027-02"), {
    year: 2027,
    month: 2,
    firstWeekday: 1,
    daysInMonth: 28,
  });
  assert.equal(core.calendarDateKey(2027, 2, 3), "2027-02-03");
});

test("카드 카운트다운은 대상의 의미를 포함하고 KST 날짜 경계를 지킨다", () => {
  const now = Date.parse("2026-07-13T14:00:00+09:00");
  assert.equal(
    core.cardCountdown(race({ status: "open", registrationCloseAt: "2026-07-13T23:59:00+09:00" }), now).label,
    "오늘 마감"
  );
  assert.equal(
    core.cardCountdown(race({ status: "open", registrationCloseAt: "2026-07-15T00:30:00+09:00" }), now).label,
    "마감 D-2"
  );
  assert.equal(
    core.cardCountdown(race({ status: "scheduled", registrationOpenTimeConfirmed: true }), now).label,
    "접수 D-1"
  );
  assert.equal(
    core.cardCountdown(race({ status: "scheduled", registrationOpenAt: "2026-07-14T00:00:00+09:00", registrationOpenTimeConfirmed: false }), now).label,
    "접수일 D-1"
  );
  assert.equal(
    core.cardCountdown(race({ status: "open", registrationCloseAt: null }), now).label,
    "마감 확인 필요"
  );
});

test("접수 중 정렬은 72시간·7일·기타·날짜만·미확인 순서를 적용한다", () => {
  const now = Date.parse("2026-07-13T12:00:00+09:00");
  const items = [
    race({ id: "unknown", name: "미확인", status: "open", registrationCloseAt: null }),
    race({ id: "date-only", name: "날짜만", status: "open", registrationCloseAt: "2026-08-01T23:59:00+09:00" }),
    race({ id: "known", name: "기타", status: "open", registrationCloseAt: "2026-08-01T18:00:00+09:00" }),
    race({ id: "week", name: "일주일", status: "open", registrationCloseAt: "2026-07-18T18:00:00+09:00" }),
    race({ id: "urgent", name: "임박", status: "open", registrationCloseAt: "2026-07-14T18:00:00+09:00" }),
  ];
  assert.deepEqual(core.sortOpenRaces(items, now).map((item) => item.id), ["urgent", "week", "known", "date-only", "unknown"]);
});
