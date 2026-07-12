// PushRun 알림 핵심 로직(alerts-core.js)의 동작 테스트.
// 브라우저 없이 node --test 로 실행된다: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../outputs/pushrun-site/alerts-core.js");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-07-10T12:00:00+09:00");

function iso(ms) {
  return new Date(ms).toISOString();
}

function makeRace(overrides = {}) {
  return {
    id: "race-1",
    name: "테스트 마라톤",
    status: "scheduled",
    registrationOpenAt: iso(NOW + 3 * DAY),
    registrationCloseAt: iso(NOW + 10 * DAY),
    raceDate: iso(NOW + 30 * DAY),
    ...overrides
  };
}

function makeSubscription(race, now = NOW, offsets = [20, 10, 0]) {
  const target = core.getAlertTarget(race, now);
  return makeSubscriptionForTarget(race, target, now, offsets);
}

function makeSubscriptionForTarget(race, target, now = NOW, offsets = [20, 10, 0]) {
  return {
    enabled: true,
    raceId: race.id,
    targetType: target.type,
    targetKey: target.key,
    targetAt: target.at,
    targetLabel: target.label,
    offsets,
    scheduledAlerts: core.computeFireTimes(target.at, offsets, now).map((item) => ({
      ...item,
      raceId: race.id,
      targetType: target.type,
      targetKey: target.key,
      targetAt: target.at
    })),
    createdAt: iso(now)
  };
}

test("접수 시각이 바뀌면 fireAt 이 최신 데이터 기준으로 다시 계산된다", () => {
  const oldRace = makeRace();
  const stored = { [oldRace.id]: makeSubscription(oldRace) };
  // races.json 갱신으로 접수 시작이 3일 뒤 → 5일 뒤로 밀렸다.
  const newOpenAt = iso(NOW + 5 * DAY);
  const freshRace = makeRace({ registrationOpenAt: newOpenAt });

  const result = core.reconcileSubscriptions(stored, [freshRace], { now: NOW });

  assert.deepEqual(result.updated, [oldRace.id]);
  assert.deepEqual(result.dropped, []);
  const next = result.alerts[oldRace.id];
  assert.equal(next.targetAt, newOpenAt);
  assert.equal(next.scheduledAlerts.length, 3);
  for (const alert of next.scheduledAlerts) {
    assert.equal(
      alert.fireAt,
      iso(Date.parse(newOpenAt) - alert.offset * 60 * 1000),
      "fireAt 은 새 접수 시각 - offset 이어야 한다"
    );
  }
});

test("시각이 그대로면 kept 로 분류되고 내용이 유지된다", () => {
  const race = makeRace();
  const stored = { [race.id]: makeSubscription(race) };
  const result = core.reconcileSubscriptions(stored, [race], { now: NOW });
  assert.deepEqual(result.kept, [race.id]);
  assert.deepEqual(result.updated, []);
  assert.equal(result.alerts[race.id].scheduledAlerts.length, 3);
});

test("대회가 데이터에서 사라지면 고아 알림이 제거된다", () => {
  const race = makeRace();
  const stored = { [race.id]: makeSubscription(race) };
  const result = core.reconcileSubscriptions(stored, [makeRace({ id: "other-race" })], { now: NOW });
  assert.deepEqual(result.dropped, [race.id]);
  assert.equal(result.alerts[race.id], undefined);
});

test("발사 시각이 이미 지난(만료) 알림은 정리된다", () => {
  const race = makeRace();
  const stored = { [race.id]: makeSubscription(race) };
  // 접수 시작(3일 뒤)이 지나 대회가 접수중이 된 시점으로 시간을 돌린다.
  const later = NOW + 4 * DAY;
  const result = core.reconcileSubscriptions(stored, [race], { now: later });
  assert.deepEqual(result.expired, [race.id]);
  assert.equal(result.alerts[race.id], undefined);
});

test("status가 open이어도 마감 시각이 지났으면 접수중으로 보지 않는다", () => {
  const closedRace = makeRace({
    status: "open",
    registrationStatus: "open",
    registrationOpenAt: iso(NOW - 10 * DAY),
    registrationCloseAt: iso(NOW - DAY)
  });

  assert.equal(core.isAcceptingNow(closedRace, NOW), false);
  assert.equal(core.getAlertTarget(closedRace, NOW)?.type, "race_day");
});

test("지난 접수일에는 D+를 표시하지 않는다", () => {
  assert.equal(core.formatDday(iso(NOW - DAY), NOW), "");
  assert.equal(core.formatDday(iso(NOW), NOW), "D-Day");
  assert.equal(core.formatDday(iso(NOW + 2 * DAY), NOW), "D-2");
});

test("날짜만 확인된 접수에는 정확한 시각 알림을 만들지 않는다", () => {
  const dateOnlyRace = makeRace({ registrationOpenTimeConfirmed: false });
  assert.equal(core.getAlertTarget(dateOnlyRace, NOW), null);
});

test("종목별 접수 시각 중 가장 가까운 미래 일정을 알림 대상으로 고른다", () => {
  const race = makeRace({
    registrationOpenAt: iso(NOW + 2 * DAY),
    registrationWindows: [
      { label: "10K", opensAt: iso(NOW + 4 * DAY) },
      { label: "Full", opensAt: iso(NOW + 2 * DAY) }
    ]
  });
  const target = core.getAlertTarget(race, NOW);
  assert.equal(target.at, iso(NOW + 2 * DAY));
  assert.equal(target.label, "Full 접수 시작");
});

test("종목별 targetKey로 Full과 10K 접수 대상을 각각 선택한다", () => {
  const race = makeRace({
    registrationWindows: [
      { id: "full", label: "Full", opensAt: iso(NOW + 2 * DAY) },
      { id: "10k", label: "10K", opensAt: iso(NOW + 4 * DAY) }
    ]
  });
  const targets = core.getRegistrationTargets(race, NOW);
  assert.deepEqual(targets.map((target) => target.key), ["window:full", "window:10k"]);
  assert.equal(core.getAlertTarget(race, NOW, "window:10k").label, "10K 접수 시작");
});

test("같은 시각의 종목도 안정 ID로 각각 유지하고 시간 미확인 종목은 제외한다", () => {
  const sameAt = iso(NOW + 2 * DAY);
  const race = makeRace({
    registrationWindows: [
      { id: "full", label: "Full", opensAt: sameAt },
      { id: "10k", label: "10K", opensAt: sameAt },
      { id: "5k", label: "5K", opensAt: iso(NOW + DAY), timeConfirmed: false }
    ]
  });
  assert.deepEqual(core.getRegistrationTargets(race, NOW).map((target) => target.key), ["window:full", "window:10k"]);
});

test("한 대회의 Full과 10K 구독을 동시에 재조정한다", () => {
  const race = makeRace({
    registrationWindows: [
      { id: "full", label: "Full", opensAt: iso(NOW + 2 * DAY) },
      { id: "10k", label: "10K", opensAt: iso(NOW + 4 * DAY) }
    ]
  });
  const targets = core.getRegistrationTargets(race, NOW);
  const stored = Object.fromEntries(targets.map((target) => [
    core.subscriptionStorageKey(race.id, target),
    makeSubscriptionForTarget(race, target)
  ]));
  const result = core.reconcileSubscriptions(stored, [race], { now: NOW });
  assert.deepEqual(Object.keys(result.alerts).sort(), ["race-1::window:10k", "race-1::window:full"]);
  assert.equal(result.alerts["race-1::window:full"].targetLabel, "Full 접수 시작");
  assert.equal(result.alerts["race-1::window:10k"].targetLabel, "10K 접수 시작");
});

test("Full 접수가 지나면 Full 구독만 만료되고 10K 구독은 유지된다", () => {
  const race = makeRace({
    registrationOpenAt: iso(NOW + 2 * DAY),
    registrationWindows: [
      { id: "full", label: "Full", opensAt: iso(NOW + 2 * DAY) },
      { id: "10k", label: "10K", opensAt: iso(NOW + 4 * DAY) }
    ]
  });
  const targets = core.getRegistrationTargets(race, NOW);
  const stored = Object.fromEntries(targets.map((target) => [
    core.subscriptionStorageKey(race.id, target),
    makeSubscriptionForTarget(race, target)
  ]));
  const result = core.reconcileSubscriptions(stored, [race], { now: NOW + 3 * DAY });
  assert.ok(result.expired.includes("race-1::window:full"));
  assert.ok(result.alerts["race-1::window:10k"]);
  assert.equal(result.alerts["race-1::window:full"], undefined);
});

test("기존 raceId 구독은 일치하는 종목 key로 한 번만 승격된다", () => {
  const race = makeRace({
    registrationWindows: [
      { id: "full", label: "Full", opensAt: iso(NOW + 2 * DAY) },
      { id: "10k", label: "10K", opensAt: iso(NOW + 4 * DAY) }
    ]
  });
  const fullTarget = core.getAlertTarget(race, NOW, "window:full");
  const legacy = makeSubscriptionForTarget(race, fullTarget);
  delete legacy.targetKey;
  const first = core.reconcileSubscriptions({ [race.id]: legacy }, [race], { now: NOW });
  assert.deepEqual(Object.keys(first.alerts), ["race-1::window:full"]);
  const second = core.reconcileSubscriptions(first.alerts, [race], { now: NOW });
  assert.deepEqual(Object.keys(second.alerts), ["race-1::window:full"]);
  assert.deepEqual(second.kept, ["race-1::window:full"]);
});

test("알림 종류(targetType)가 더 이상 유효하지 않으면 만료 처리된다", () => {
  const race = makeRace();
  const stored = { [race.id]: makeSubscription(race) };
  assert.equal(stored[race.id].targetType, "registration_open");
  // 접수가 이미 끝났고 대회일만 남은 데이터: registration_open 구독은 만료돼야 한다.
  const fresh = makeRace({
    registrationOpenAt: iso(NOW - 10 * DAY),
    registrationCloseAt: iso(NOW - 1 * DAY),
    status: "scheduled"
  });
  const result = core.reconcileSubscriptions(stored, [fresh], { now: NOW });
  assert.deepEqual(result.expired, [race.id]);
});

test("pruneExpiredScheduledAlerts 는 지난 알림만 걸러낸다", () => {
  const alerts = [
    { offset: 20, fireAt: iso(NOW - HOUR) },
    { offset: 0, fireAt: iso(NOW + HOUR) }
  ];
  const kept = core.pruneExpiredScheduledAlerts(alerts, NOW);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].offset, 0);
});

test("24.8일(setTimeout 상한)을 넘는 알림은 재무장(needsRearm) 경로로 판정된다", () => {
  const farFireAt = iso(NOW + core.MAX_TIMER_DELAY + DAY);
  const timing = core.classifyTimerDelay(farFireAt, NOW);
  assert.equal(timing.isPast, false);
  assert.equal(timing.needsRearm, true);
  assert.equal(timing.effectiveDelay, core.MAX_TIMER_DELAY);

  const nearFireAt = iso(NOW + HOUR);
  const near = core.classifyTimerDelay(nearFireAt, NOW);
  assert.equal(near.needsRearm, false);
  assert.equal(near.delay, HOUR);

  const past = core.classifyTimerDelay(iso(NOW - HOUR), NOW);
  assert.equal(past.isPast, true);

  // 깨진 fireAt(NaN)은 즉시 발사 사고 대신 isPast 로 안전하게 버려진다.
  const broken = core.classifyTimerDelay("not-a-date", NOW);
  assert.equal(broken.isPast, true);
});

test("깨진 대회 항목이 섞여 있어도 예외를 던지지 않는다", () => {
  const race = makeRace();
  const stored = {
    [race.id]: makeSubscription(race),
    "weird-race": { enabled: true, raceId: "weird-race", offsets: [10] },
    "null-sub": null
  };
  const malformedRaces = [
    race,
    {}, // id 없음
    { id: "weird-race" }, // 날짜·상태 전부 없음
    { id: "no-dates", name: "값 없는 대회", status: "scheduled" }
  ];
  let result;
  assert.doesNotThrow(() => {
    result = core.reconcileSubscriptions(stored, malformedRaces, { now: NOW });
  });
  assert.deepEqual(result.kept, [race.id]);
  // 날짜가 전혀 없는 대회의 구독은 만료로 정리되고, null 구독은 버려진다.
  assert.ok(result.expired.includes("weird-race"));
  assert.ok(result.dropped.includes("null-sub"));
  assert.equal(core.getAlertTarget({}, NOW), null);
  assert.equal(core.getAlertTarget(null, NOW), null);
  assert.equal(core.isAcceptingNow(undefined, NOW), false);
});

test("computeFireTimes 는 지난 오프셋을 걸러내고 미래 것만 남긴다", () => {
  const targetAt = iso(NOW + 15 * 60 * 1000); // 15분 뒤 접수 시작
  const times = core.computeFireTimes(targetAt, [20, 10, 0], NOW);
  assert.deepEqual(times.map((item) => item.offset), [10, 0]);
});
