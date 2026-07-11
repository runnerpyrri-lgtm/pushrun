// 러닝봄 알림 핵심 로직 (순수 함수 모음).
// 기존 설치 호환을 위해 브라우저 전역 이름 window.PushRunAlertsCore 는 유지한다.
// DOM·localStorage 를 건드리지 않으므로 node:test 로 그대로 검증할 수 있다.
(function (global) {
  "use strict";

  // setTimeout 의 최대 지연은 약 24.8일(2^31-1 ms). 이보다 먼 알림을 그냥 버리면 영영 안 울린다.
  const MAX_TIMER_DELAY = 2147483647;
  const DEFAULT_OFFSETS = [20, 10, 0];
  const DAY = 24 * 60 * 60 * 1000;
  const KST_OFFSET = 9 * 60 * 60 * 1000;

  function registrationWindowId(window) {
    if (window?.id) return String(window.id);
    const label = String(window?.label || "course").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "-").replace(/^-|-$/g, "");
    return `${label}-${String(window?.opensAt || "").slice(0, 16)}`;
  }

  function getNextRegistrationWindow(race, now) {
    const windows = Array.isArray(race?.registrationWindows) ? race.registrationWindows : [];
    return windows
      .filter((window) => window?.opensAt && window.timeConfirmed !== false && new Date(window.opensAt).getTime() > now)
      .sort((a, b) => new Date(a.opensAt).getTime() - new Date(b.opensAt).getTime())[0] || null;
  }

  function getRegistrationTargets(race, now) {
    if (!race || ["closed", "sold_out", "cancelled"].includes(race.status)) return [];
    const windows = Array.isArray(race.registrationWindows) ? race.registrationWindows : [];
    if (windows.length) {
      return windows
        .filter((window) => window?.opensAt && window.timeConfirmed !== false && new Date(window.opensAt).getTime() > now)
        .sort((a, b) => new Date(a.opensAt).getTime() - new Date(b.opensAt).getTime())
        .map((window) => {
          const windowId = registrationWindowId(window);
          const course = window.label ? `${window.label} ` : "";
          return {
            type: "registration_open",
            key: `window:${windowId}`,
            windowId,
            at: window.opensAt,
            label: `${course}접수 시작`,
            ticketLabel: `${course}접수`,
            shortLabel: `${course}시작 알림`,
            statusLabel: `${course}접수 시작 알림`
          };
        });
    }

    const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
    if (!opensAt || opensAt <= now || race.registrationOpenTimeConfirmed === false) return [];
    return [{
      type: "registration_open",
      key: "registration",
      at: race.registrationOpenAt,
      label: "접수 시작",
      ticketLabel: "접수",
      shortLabel: "시작 알림",
      statusLabel: "접수 시작 알림"
    }];
  }

  function getAlertTargets(race, now) {
    const registrationTargets = getRegistrationTargets(race, now);
    if (registrationTargets.length) return registrationTargets;
    if (!race || ["closed", "sold_out", "cancelled"].includes(race.status)) return [];
    const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
    if (opensAt && opensAt > now) return [];
    const raceAt = race.raceDate ? new Date(race.raceDate).getTime() : null;
    if (!isAcceptingNow(race, now) && raceAt && raceAt > now) {
      return [{
        type: "race_day",
        key: "race_day",
        at: race.raceDate,
        label: "대회일",
        ticketLabel: "대회",
        shortLabel: "대회 알림",
        statusLabel: "대회일 알림"
      }];
    }
    return [];
  }

  function subscriptionStorageKey(raceId, target) {
    return target?.key?.startsWith("window:") ? `${raceId}::${target.key}` : String(raceId);
  }

  // 한국 대회 기준 날짜로 D-day를 계산하고, 이미 지난 대상에는 D+를 노출하지 않는다.
  function formatDday(value, now, fallback = "일정 대기") {
    const targetAt = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(targetAt)) return fallback;
    const targetDay = Math.floor((targetAt + KST_OFFSET) / DAY);
    const today = Math.floor((now + KST_OFFSET) / DAY);
    const days = targetDay - today;
    if (days < 0) return "";
    return days === 0 ? "D-Day" : `D-${days}`;
  }

  // 지금 접수중인지(오픈 시각이 지났고 마감 전) 판단한다.
  function isAcceptingNow(race, now) {
    if (!race) return false;
    const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
    const closesAt = race.registrationCloseAt ? new Date(race.registrationCloseAt).getTime() : null;
    if (closesAt && now > closesAt) return false;
    if (opensAt && now < opensAt) return false;
    if (race.registrationStatus === "open") return true;
    return Boolean(opensAt && opensAt <= now && (!closesAt || now <= closesAt));
  }

  // 이 대회에서 지금 알림을 걸 수 있는 대상(접수 시작 or 대회일)을 계산한다.
  // 걸 수 있는 대상이 없으면 null (마감·매진·취소, 또는 모든 시각이 지난 경우).
  function getAlertTarget(race, now, targetKey) {
    const targets = getAlertTargets(race, now);
    if (targetKey) return targets.find((target) => target.key === targetKey) || null;
    return targets[0] || null;
  }

  // 대상 시각(targetAt)에서 offset(분) 전의 발사 시각을 ISO 문자열로 계산한다.
  function computeFireAt(targetAt, offsetMinutes) {
    return new Date(new Date(targetAt).getTime() - offsetMinutes * 60 * 1000).toISOString();
  }

  // 여러 offset 에 대한 발사 시각을 계산하고, 이미 지난 것은 걸러낸다.
  function computeFireTimes(targetAt, offsets, now) {
    return (Array.isArray(offsets) ? offsets : [])
      .map((offset) => ({ offset, fireAt: computeFireAt(targetAt, offset) }))
      .filter((item) => new Date(item.fireAt).getTime() > now);
  }

  // 저장된 scheduledAlerts 중 아직 발사 시각이 지나지 않은 것만 남긴다(만료 정리).
  function pruneExpiredScheduledAlerts(scheduledAlerts, now) {
    return (Array.isArray(scheduledAlerts) ? scheduledAlerts : []).filter(
      (alert) => alert && new Date(alert.fireAt).getTime() > now
    );
  }

  // setTimeout 클램프 판정: 이미 지났으면 isPast, 24.8일 상한을 넘으면 needsRearm(재무장 필요).
  // fireAt 이 깨진 값(NaN)이면 즉시 발사되는 사고를 막기 위해 isPast 로 처리한다.
  function classifyTimerDelay(fireAt, now) {
    const delay = new Date(fireAt).getTime() - now;
    const isPast = !Number.isFinite(delay) || delay <= 0;
    const needsRearm = !isPast && delay > MAX_TIMER_DELAY;
    return {
      delay,
      isPast,
      needsRearm,
      effectiveDelay: isPast ? 0 : Math.min(delay, MAX_TIMER_DELAY)
    };
  }

  // 저장된 알림 구독을 "최신 대회 데이터" 기준으로 재구성한다 (핵심 신뢰 수정).
  // - 대회가 사라졌으면 → dropped (고아 제거)
  // - 알림 대상 시각이 이미 지났거나 알림 종류(targetType)가 더 이상 유효하지 않으면 → expired (즉시 제거)
  //   ※ UX 결정: 만료 알림은 유예 없이 리로드 시점에 바로 지운다. "켜져 있다"고 보이는데
  //     실제로는 안 울리는 상태가 가장 위험하므로, '내 알림'에는 진짜 울릴 알림만 남긴다.
  // - 대회 시각이 바뀌었으면 → fireAt 을 새 시각으로 다시 계산해 updated
  // - 그대로면 → kept
  // options.buildScheduledAlerts(race, offsets, target) 로 알림 문구 생성을 위임할 수 있다
  // (앱에서는 제목·본문까지 채우고, 테스트에서는 생략 가능).
  function reconcileSubscriptions(storedAlerts, races, options) {
    const opts = options || {};
    const now = typeof opts.now === "number" ? opts.now : Date.now();
    const buildScheduledAlerts = typeof opts.buildScheduledAlerts === "function" ? opts.buildScheduledAlerts : null;

    const racesById = new Map();
    (Array.isArray(races) ? races : []).forEach((race) => {
      if (race && race.id != null) racesById.set(race.id, race);
    });

    const result = { alerts: {}, kept: [], updated: [], dropped: [], expired: [] };
    const entries = Object.entries(storedAlerts || {}).sort((a, b) => Number(Boolean(b[1]?.targetKey)) - Number(Boolean(a[1]?.targetKey)));
    for (const [storedKey, subscription] of entries) {
      if (!subscription || typeof subscription !== "object") {
        result.dropped.push(storedKey);
        continue;
      }
      const raceId = subscription.raceId || storedKey;
      const race = racesById.get(raceId);
      if (!race) {
        result.dropped.push(storedKey); // 고아: 대회가 데이터에서 사라짐
        continue;
      }
      const availableTargets = getAlertTargets(race, now);
      const legacyMatch = !subscription.targetKey
        ? availableTargets.find((target) => target.type === subscription.targetType && target.at === subscription.targetAt)
        : null;
      const targetKey = subscription.targetKey || legacyMatch?.key || availableTargets[0]?.key;
      const target = getAlertTarget(race, now, targetKey);
      if (!target) {
        result.expired.push(storedKey); // 만료: 선택한 종목의 알림 시각이 더 이상 유효하지 않음
        continue;
      }
      if (subscription.targetType && subscription.targetType !== target.type) {
        result.expired.push(storedKey); // 원래 구독한 종류(예: 접수 시작)의 시각이 지나감
        continue;
      }

      const offsets =
        Array.isArray(subscription.offsets) && subscription.offsets.length
          ? subscription.offsets
          : DEFAULT_OFFSETS;
      const scheduledAlerts = buildScheduledAlerts
        ? buildScheduledAlerts(race, offsets, target) || []
        : computeFireTimes(target.at, offsets, now).map((item) => ({
            ...item,
            raceId: race.id,
            targetType: target.type,
            targetKey: target.key,
            targetAt: target.at,
            targetLabel: target.label
          }));
      if (!scheduledAlerts.length) {
        result.expired.push(storedKey); // 남은 미래 발사 시각이 하나도 없음
        continue;
      }

      const fireKey = (alerts) => alerts.map((alert) => `${alert.offset}@${alert.fireAt}`).join("|");
      const changed =
        subscription.targetAt !== target.at ||
        fireKey(subscription.scheduledAlerts || []) !== fireKey(scheduledAlerts);
      const nextKey = subscriptionStorageKey(raceId, target);
      if (result.alerts[nextKey]) {
        result.dropped.push(storedKey); // legacy와 신규 구독이 겹치면 targetKey가 있는 신규 구독을 유지
        continue;
      }
      result.alerts[nextKey] = {
        ...subscription,
        raceId,
        targetType: target.type,
        targetKey: target.key,
        targetAt: target.at,
        targetLabel: target.label,
        scheduledAlerts
      };
      (changed || nextKey !== storedKey ? result.updated : result.kept).push(nextKey);
    }
    return result;
  }

  const PushRunAlertsCore = {
    MAX_TIMER_DELAY,
    DEFAULT_OFFSETS,
    formatDday,
    getNextRegistrationWindow,
    getRegistrationTargets,
    getAlertTargets,
    subscriptionStorageKey,
    isAcceptingNow,
    getAlertTarget,
    computeFireAt,
    computeFireTimes,
    pruneExpiredScheduledAlerts,
    classifyTimerDelay,
    reconcileSubscriptions
  };

  if (global) global.PushRunAlertsCore = PushRunAlertsCore;
  if (typeof module !== "undefined") module.exports = PushRunAlertsCore;
})(typeof window !== "undefined" ? window : undefined);
