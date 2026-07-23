// 외부 HTML의 작은 표현 차이로 잘못된 대회가 게시되지 않게 정규화 규칙을 고정한다.
import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMarathonGoDetailUrls,
  mergeMarathonGoDiscoveries,
  parseDateRange,
  parseMarathonGoDetail,
  raceIdentity,
  statusFromRegistrationPeriod,
} from "./race-data-core.mjs";

const detailHtml = `
  <html><head><script type="application/ld+json">[{"@type":"Article","name":"사우나런 in 올림픽공원 | 마라톤GO","description":"사우나런 in 올림픽공원 | 2026-07-31 상시 집결 | 서울 | 올림픽 공원 인근 | 사우나런 | 10km,5km | https://saunarun.com/apply"}]</script></head>
  <body><button>공유하기</button><span>10km</span><span>5km</span><span>서울</span><span>-</span><span>올림픽 공원 인근</span><span>2026-07-31</span><span>상시 집결</span><strong>접수 기간</strong><span>2026.06.12 ~ 2026.07.31</span></body></html>`;

test("마라톤GO 상세 URL만 카탈로그에서 추출한다", () => {
  assert.deepEqual(extractMarathonGoDetailUrls('<a href="/raceDetail/domestic/a">A</a><a href="/raceSchedule/domestic">B</a>'), ["https://marathongo.co.kr/raceDetail/domestic/a"]);
});

test("회차 표기의 공백 차이는 같은 대회로 식별한다", () => {
  assert.equal(
    raceIdentity({ name: "제 16회 스마일 런 페스티벌", date: "2026-09-13" }),
    raceIdentity({ name: "제16회 스마일 런 페스티벌", date: "2026-09-13" }),
  );
});

test("공개 상세의 날짜 단위 접수 기간은 시각 미확정 상태로 정규화한다", () => {
  const race = parseMarathonGoDetail(detailHtml, "https://marathongo.co.kr/raceDetail/domestic/sauna", "2026-07-24T00:00:00.000Z");
  assert.equal(race.name, "사우나런 in 올림픽공원");
  assert.equal(race.registrationOpenAt, "2026-06-12T00:00:00+09:00");
  assert.equal(race.registrationCloseAt, "2026-07-31T23:59:00+09:00");
  assert.equal(race.registrationOpenTimeConfirmed, false);
  assert.deepEqual(race.distances, ["10K", "5K"]);
  assert.equal(race.registrationUrl, "https://saunarun.com/apply");
});

test("뒤집힌 날짜 범위와 마감 상태를 안전하게 처리한다", () => {
  assert.equal(parseDateRange("2026.07.31 ~ 2026.06.12"), null);
  assert.equal(statusFromRegistrationPeriod("2026-07-01T00:00:00+09:00", "2026-07-23T23:59:00+09:00", Date.parse("2026-07-24T00:00:00+09:00")), "closed");
});

test("기존 직접 신청 링크는 보존하면서 공개 일정의 변경 값만 병합한다", () => {
  const current = { version: "test", featuredRaces: [], scheduleFeed: [{ name: "사우나런 in 올림픽공원", date: "2026-07-31", region: "서울", venue: "이전 장소", time: "미확인", distances: ["5K"], registrationUrl: "https://official.example/apply", registrationOpenAt: "2026-06-01T00:00:00+09:00", registrationCloseAt: "2026-07-30T23:59:00+09:00", status: "open", sourceName: "마라톤GO" }] };
  const discovery = parseMarathonGoDetail(detailHtml, "https://marathongo.co.kr/raceDetail/domestic/sauna", "2026-07-24T00:00:00.000Z");
  const merged = mergeMarathonGoDiscoveries(current, [discovery], { now: Date.parse("2026-07-24T00:00:00+09:00"), checkedAt: "2026-07-24T00:00:00.000Z" });
  const race = merged.data.scheduleFeed[0];
  assert.equal(race.registrationUrl, "https://official.example/apply");
  assert.equal(race.venue, "올림픽 공원 인근");
  assert.equal(race.status, "open");
});

test("이미 확인한 공식 접수 시각은 포털의 날짜 단위 값으로 덮지 않는다", () => {
  const current = {
    version: "test",
    featuredRaces: [],
    scheduleFeed: [{ name: "사우나런 in 올림픽공원", date: "2026-07-31", region: "서울", venue: "공식 장소", time: "09:00", distances: ["10K"], registrationOpenAt: "2026-06-12T14:00:00+09:00", registrationCloseAt: "2026-07-31T18:00:00+09:00", registrationOpenTimeConfirmed: true, status: "open", sourceName: "공식 · 마라톤GO" }],
  };
  const discovery = parseMarathonGoDetail(detailHtml, "https://marathongo.co.kr/raceDetail/domestic/sauna", "2026-07-24T00:00:00.000Z");
  const merged = mergeMarathonGoDiscoveries(current, [discovery], { now: Date.parse("2026-07-24T00:00:00+09:00"), checkedAt: "2026-07-24T00:00:00.000Z" });
  assert.equal(merged.data.scheduleFeed[0].registrationOpenAt, "2026-06-12T14:00:00+09:00");
  assert.equal(merged.data.scheduleFeed[0].venue, "공식 장소");
});

test("마라톤온라인 정본은 같은 대회의 포털 데이터로 덮지 않고 중복도 만들지 않는다", () => {
  const current = {
    version: "test",
    featuredRaces: [],
    scheduleFeed: [{ name: "사우나런 in 올림픽공원", date: "2026-07-31", region: "서울", venue: "마라톤온라인 장소", time: "상시", distances: ["10K"], registrationOpenAt: "2026-06-12T00:00:00+09:00", registrationCloseAt: "2026-07-31T23:59:00+09:00", status: "open", sourceName: "마라톤온라인", sourceDetailUrl: "https://www.roadrun.co.kr/schedule/view.php?no=1" }],
  };
  const discovery = parseMarathonGoDetail(detailHtml, "https://marathongo.co.kr/raceDetail/domestic/sauna", "2026-07-24T00:00:00.000Z");
  const merged = mergeMarathonGoDiscoveries(current, [discovery], { now: Date.parse("2026-07-24T00:00:00+09:00"), checkedAt: "2026-07-24T00:00:00.000Z" });
  assert.equal(merged.data.scheduleFeed.length, 1);
  assert.equal(merged.data.scheduleFeed[0].venue, "마라톤온라인 장소");
});

test("지난 대회와 지난 일정은 자동 게시 대상에서 제외한다", () => {
  const current = {
    version: "test",
    featuredRaces: [{ name: "지난 대회", raceDate: "2026-07-23", registrationOpenAt: "2026-07-01T00:00:00+09:00", registrationCloseAt: "2026-07-02T23:59:00+09:00", status: "closed" }],
    scheduleFeed: [],
  };
  const merged = mergeMarathonGoDiscoveries(current, [], { now: Date.parse("2026-07-24T00:00:00+09:00"), checkedAt: "2026-07-24T00:00:00.000Z" });
  assert.equal(merged.data.featuredRaces.length, 0);
});
