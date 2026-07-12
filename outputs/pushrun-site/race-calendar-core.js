(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RunningBomRaceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KST_DATE_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const KST_DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const KST_WEEKDAY = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  });

  function kstParts(value) {
    const parts = KST_PARTS.formatToParts(new Date(value));
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
    };
  }

  function formatKstDateTime(value) {
    return KST_DATE_TIME.format(new Date(value));
  }

  function formatKstWeekday(value) {
    return KST_WEEKDAY.format(new Date(value));
  }

  function formatKstShortDate(value) {
    const date = kstParts(value);
    return `${date.month}/${date.day}(${formatKstWeekday(value)})`;
  }

  function formatKstRegistrationDate(value, now = Date.now()) {
    const date = kstParts(value);
    const yearPrefix = date.year === kstParts(now).year ? "" : `${String(date.year).slice(2)}.`;
    return `${yearPrefix}${date.month}/${date.day}(${formatKstWeekday(value)})`;
  }

  function formatKstTime(value) {
    const date = kstParts(value);
    return `${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;
  }

  function isKstPlainDateTime(value) {
    const date = kstParts(value);
    return (date.hour === 0 && date.minute === 0) || (date.hour === 23 && date.minute === 59);
  }

  function formatKstRegistrationPoint(value, now = Date.now()) {
    const label = formatKstRegistrationDate(value, now);
    return isKstPlainDateTime(value) ? label : `${label} ${formatKstTime(value)}`;
  }

  function currentKstMonth(value = Date.now()) {
    return KST_DATE_KEY.format(new Date(value)).slice(0, 7);
  }

  function shiftCalendarMonth(monthKey, step) {
    const match = String(monthKey).match(/^(\d{4})-(\d{2})$/);
    if (!match) return currentKstMonth();
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + step, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function calendarMonthInfo(monthKey) {
    const match = String(monthKey).match(/^(\d{4})-(\d{2})$/);
    const fallback = currentKstMonth().match(/^(\d{4})-(\d{2})$/);
    const year = Number((match || fallback)[1]);
    const month = Number((match || fallback)[2]);
    return {
      year,
      month,
      firstWeekday: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
      daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    };
  }

  function calendarDateKey(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function normalizeRaceName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/제\d+회/g, "")
      .replace(/\b20\d{2}\b/g, "")
      .replace(/marathon|race|trail|run/g, "")
      .replace(/마라톤대회|마라톤|트레일런|트레일|레이스/g, "")
      .replace(/[^0-9a-z가-힣]/g, "");
  }

  function raceIdentity(race) {
    return `${normalizeRaceName(race.name)}|${String(race.raceDate || race.date || "").slice(0, 10)}`;
  }

  function buildRaceCalendarEvents(race) {
    const events = [];
    const seen = new Set();
    const add = (type, at, label, targetKey) => {
      if (!at || Number.isNaN(Date.parse(at))) return;
      const key = `${type}|${at}|${targetKey || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      events.push({ raceId: race.id, type, at, label, targetKey });
    };

    add("registration_open", race.registrationOpenAt, "접수 시작", "registration");
    for (const window of race.registrationWindows || []) {
      add("registration_open", window.opensAt, `${window.label} 접수 시작`, `window:${window.id || window.label}`);
    }
    add("registration_close", race.registrationCloseAt, "접수 마감");
    add("race_day", race.raceDate || race.date, "대회일");
    return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  function eventsForDate(races, dateKey) {
    return races.flatMap(buildRaceCalendarEvents).filter((event) => KST_DATE_KEY.format(new Date(event.at)) === dateKey);
  }

  function racesForDate(races, dateKey) {
    const ids = new Set(eventsForDate(races, dateKey).map((event) => event.raceId));
    return races.filter((race) => ids.has(race.id));
  }

  function eventCountsByDate(races) {
    const counts = new Map();
    for (const event of races.flatMap(buildRaceCalendarEvents)) {
      const key = KST_DATE_KEY.format(new Date(event.at));
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  return {
    normalizeRaceName,
    raceIdentity,
    buildRaceCalendarEvents,
    eventsForDate,
    racesForDate,
    eventCountsByDate,
    kstParts,
    formatKstDateTime,
    formatKstShortDate,
    formatKstRegistrationDate,
    formatKstRegistrationPoint,
    formatKstTime,
    isKstPlainDateTime,
    currentKstMonth,
    shiftCalendarMonth,
    calendarMonthInfo,
    calendarDateKey,
  };
});
