const ALERT_STORAGE_KEY = "pushrun:alert-subscriptions:v3";
const SYNC_STORAGE_KEY = "pushrun:last-sync:v1";
const PERMISSION_GUIDE_KEY = "pushrun:permission-guide-seen:v1";
const APP_VERSION = "0.17.11";
const ASSET_VERSION = "20260719-01";
const BUILD_SHA = "__BUILD_SHA__";
const PWA_CACHE_VERSION = "pushrun-v0.17.11";
const {
  normalizeRaceName,
  raceIdentity,
  racesForDate: calendarRacesForDate,
  eventCountsByDate,
  formatKstDateTime: formatDateTime,
  formatKstShortDate: formatShortDate,
  formatKstRegistrationDate: formatRegistrationDate,
  formatKstRegistrationPoint: formatRegistrationPoint,
  formatKstTime: formatRegistrationTime,
  isKstPlainDateTime,
  currentKstMonth,
  shiftCalendarMonth,
  calendarMonthInfo,
  calendarDateKey,
  cardCountdown,
  openRacePriority,
  sortOpenRaces,
  raceMapLink
} = globalThis.RunningBomRaceCore;
const DEFAULT_OFFSETS = [20, 10, 0];
const INITIAL_RACE_LIMIT = 20;
const CLOSING_SOON_LIMIT = 4;
const RACE_DATA_URL = `./races.json?v=${ASSET_VERSION}`;
const MARATHON_ONLINE_LIST_URL = "http://www.roadrun.co.kr/schedule/list.php";
const KST_DATE_KEY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

const state = {
  selectedRaceId: null,
  modalRaceId: null,
  modalTargetKeys: [],
  distanceFilter: "all",
  regionFilter: "all",
  query: "",
  draftDistanceFilter: "all",
  draftRegionFilter: "all",
  draftQuery: "",
  activeCategory: "all",
  sort: "date",
  includeClosed: false,
  expandedRaceId: null,
  selectedCalendarDate: null,
  calendarMonth: null,
  races: [],
  dataVersion: "",
  alerts: loadJson(ALERT_STORAGE_KEY, {}),
  timers: [],
  rearmScheduled: false,
  lastFocusedElement: null,
  loadStatus: "loading",
  mobileFiltersExpanded: false,
  dataRevision: 0,
  searchComposing: false,
  visibleRaceCount: INITIAL_RACE_LIMIT
};

let sortedRacesSource = null;
let sortedRacesCache = [];
let sortedRacesRevision = -1;
let sortedRacesMinute = -1;
let regionOptionsKey = "";
let searchApplyTimer = null;
const raceTimeCache = new WeakMap();

function trackFamilyEvent(eventName, surface = "home") {
  window.RobomFamilyAnalytics?.track(eventName, { surface });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function saveText(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

async function loadRaceData() {
  const response = await fetch(RACE_DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("race-data-load-failed");
  const data = await response.json();
  state.races = mergeRaces(
    (data.featuredRaces || []).map(normalizeFeaturedRace),
    parseScheduleFeed(data.scheduleFeed || [])
  );
  state.dataVersion = data.version || "";
  state.dataRevision += 1;
}

function parseScheduleFeed(feed) {
  return feed.map((entry) => {
    const now = Date.now();
    const opensAt = entry.registrationOpenAt ? new Date(entry.registrationOpenAt).getTime() : null;
    const closesAt = entry.registrationCloseAt ? new Date(entry.registrationCloseAt).getTime() : null;
    const isBeforeClose = !closesAt || now <= closesAt;
    const isOpen = isBeforeClose && (entry.status === "open" || Boolean(opensAt && opensAt <= now));
    const hasUpcomingOpen = Boolean(opensAt && opensAt > now);
    const openTimeConfirmed = entry.registrationOpenTimeConfirmed === true;
    // 방어: venue/time/distances 가 빠진 항목 1개 때문에 앱 전체가 하얗게 죽지 않게 한다.
    // (validate-static.mjs 가 배포 전에 FAIL 시키지만, 런타임에서도 한 번 더 방어한다.)
    const venue = entry.venue || "";
    const distances = Array.isArray(entry.distances) ? entry.distances : [];
    return {
      // ★ 내용 기반 안정 ID. 예전엔 배열 index(`schedule-${index}-...`)라 피드가
      // 재정렬·삽입되면 ID가 바뀌어 localStorage 에 저장된 알림이 전부 고아가 됐다.
      // raceIdentity 와 동일한 정규화(이름+날짜)로 뽑아 피드가 바뀌어도 알림이 유지되게 한다.
      id: `schedule-${normalizeRaceName(entry.name)}-${entry.date}`,
      name: entry.name,
      region: entry.region,
      city: venue.split(" ")[0] || entry.region || "",
      venue,
      raceDate: `${entry.date}T${normalizeRaceTime(entry.time)}+09:00`,
      registrationOpenAt: entry.registrationOpenAt || null,
      registrationCloseAt: entry.registrationCloseAt || null,
      registrationOpenTimeConfirmed: openTimeConfirmed,
      registrationPeriodLabel: entry.registrationPeriodLabel || null,
      registrationUrl: entry.registrationUrl || entry.sourceDetailUrl || MARATHON_ONLINE_LIST_URL,
      sourceDetailUrl: entry.sourceDetailUrl || null,
      linkVerifiedFrom: entry.linkVerifiedFrom || "마라톤온라인 목록",
      distances,
      courseLabel: entry.courseLabel || distances.join(","),
      organizer: entry.organizer || null,
      status: isOpen ? "open" : hasUpcomingOpen ? "scheduled" : entry.status,
      registrationStatus: isOpen ? "open" : hasUpcomingOpen ? "scheduled" : entry.status || "unknown",
      sourceStatus: isOpen ? "접수 중" : hasUpcomingOpen ? "접수 예정" : statusLabel(entry.status),
      alertCapabilities: [
        ...(hasUpcomingOpen && openTimeConfirmed ? ["registration_time"] : []),
        ...(isOpen ? ["open_now"] : []),
        "race_day"
      ],
      capacity: null,
      popularity: 50,
      sourceName: entry.sourceName || "마라톤온라인",
      note: `${entry.time} 출발. 접수기간은 마라톤온라인 상세 페이지 기준입니다.`,
      registrationLabel: entry.registrationPeriodLabel || (isOpen ? "접수 중" : entry.status === "closed" ? "접수 마감" : "접수 일정 준비 중")
    };
  });
}

function normalizeFeaturedRace(race) {
  const now = Date.now();
  const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
  const closesAt = race.registrationCloseAt ? new Date(race.registrationCloseAt).getTime() : null;
  const isBeforeClose = !closesAt || now <= closesAt;
  const isAccepting = isBeforeClose && (race.status === "open" || Boolean(opensAt && opensAt <= now));
  const hasUpcomingOpen = opensAt && opensAt > now && !["closed", "sold_out", "cancelled"].includes(race.status);
  const openTimeConfirmed = hasConfirmedRegistrationOpenTime(race);
  return {
    ...race,
    registrationOpenTimeConfirmed: openTimeConfirmed,
    courseLabel: race.courseLabel || (Array.isArray(race.distances) ? race.distances : []).join(","),
    registrationStatus: isAccepting ? "open" : hasUpcomingOpen ? "scheduled" : race.status || "unknown",
    sourceStatus: isAccepting ? "접수 중" : hasUpcomingOpen ? "접수 예정" : statusLabel(race.status),
    alertCapabilities: [
      ...(hasUpcomingOpen && openTimeConfirmed ? ["registration_time"] : []),
      ...(isAccepting ? ["open_now"] : []),
      "race_day"
    ]
  };
}

function normalizeRaceTime(value) {
  const text = String(value || "");
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${pad(Number(match[1]))}:${match[2]}:00`;
  const hourMatch = text.match(/(\d{1,2})시/);
  if (hourMatch) return `${pad(Number(hourMatch[1]))}:00:00`;
  return "09:00:00";
}

function mergeRaces(primary, secondary) {
  const seen = new Set(primary.map((race) => raceIdentity(race)));
  return [
    ...primary,
    ...secondary.filter((race) => {
      const key = raceIdentity(race);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  ];
}

function hasConfirmedRegistrationOpenTime(race) {
  if (typeof race.registrationOpenTimeConfirmed === "boolean") return race.registrationOpenTimeConfirmed;
  if (!race.registrationOpenAt) return false;
  return !isKstPlainDateTime(race.registrationOpenAt);
}

function registrationScheduleRows(race) {
  const windows = Array.isArray(race.registrationWindows) ? race.registrationWindows : [];
  const hasSeparateSchedules = windows.length > 1 && new Set(
    windows.map((window) => `${window.opensAt}|${window.timeConfirmed !== false}`)
  ).size > 1;

  if (hasSeparateSchedules) {
    return {
      separate: true,
      rows: windows.map((window) => ({
        label: window.label || "종목",
        at: window.opensAt,
        confirmed: window.timeConfirmed !== false
      }))
    };
  }

  const commonWindow = windows[0];
  return {
    separate: false,
    rows: [{
      at: race.registrationOpenAt || commonWindow?.opensAt || null,
      confirmed: race.registrationOpenAt
        ? hasConfirmedRegistrationOpenTime(race)
        : commonWindow?.timeConfirmed !== false
    }]
  };
}

function registrationScheduleHtml(race) {
  const { separate, rows } = registrationScheduleRows(race);

  return `<div class="registration-schedule" aria-label="접수 일정">${rows.map((row) => {
    const rowClass = `registration-window-row${separate ? "" : " compact"}`;
    if (!row.at) {
      return `<div class="${rowClass}">${separate ? `<span>${escapeHtml(row.label)}</span>` : ""}<strong>일정 확인 중</strong></div>`;
    }
    if (isAcceptingNow(race) && new Date(row.at).getTime() <= Date.now()) {
      return `<div class="${rowClass}">${separate ? `<span>${escapeHtml(row.label)}</span>` : ""}<strong>진행중</strong></div>`;
    }
    const timeLabel = row.confirmed ? formatRegistrationTime(row.at) : "시간 미확인";
    return `<div class="${rowClass}">${separate ? `<span>${escapeHtml(row.label)}</span>` : ""}<strong>${escapeHtml(formatRegistrationDate(row.at))}</strong><em>${escapeHtml(timeLabel)}</em></div>`;
  }).join("")}</div>`;
}

function formatRegistrationRange(race) {
  if (!race.registrationOpenAt) return race.registrationLabel || "접수 일정 준비 중";
  if (race.registrationPeriodLabel) return race.registrationPeriodLabel;
  if (!race.registrationCloseAt) return formatRegistrationPoint(race.registrationOpenAt);
  return `${formatRegistrationPoint(race.registrationOpenAt)} - ${formatRegistrationPoint(race.registrationCloseAt)}`;
}

function formatDday(value, fallback = "일정 대기") {
  return window.PushRunAlertsCore.formatDday(value, Date.now(), fallback);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function canUseRegistrationTimer(race) {
  return getAlertTarget(race)?.type === "registration_open";
}

// 알림 대상 계산은 순수 로직이라 alerts-core.js 로 옮겼다 (Node 테스트 공유).
function getAlertTarget(race) {
  return window.PushRunAlertsCore.getAlertTarget(race, Date.now());
}

function getAlertTargets(race) {
  return window.PushRunAlertsCore.getAlertTargets(race, Date.now());
}

function getTargetByKey(race, targetKey) {
  return window.PushRunAlertsCore.getAlertTarget(race, Date.now(), targetKey);
}

function subscriptionKey(raceId, target) {
  return window.PushRunAlertsCore.subscriptionStorageKey(raceId, target);
}

function subscriptionsForRace(raceId) {
  return Object.entries(state.alerts).filter(([, subscription]) => subscription?.enabled && subscription.raceId === raceId);
}

function canUseAlert(race) {
  return Boolean(getAlertTarget(race));
}

function isAcceptingNow(race) {
  return window.PushRunAlertsCore.isAcceptingNow(race, Date.now());
}

// 원본 status가 "open"으로 남아 있어도 마감 시각이 지났으면 접수 종료로 본다.
function isRegistrationClosed(race) {
  const closesAt = race.registrationCloseAt ? new Date(race.registrationCloseAt).getTime() : null;
  return Boolean(closesAt && Date.now() > closesAt);
}

function raceSortGroup(race) {
  const now = Date.now();
  const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
  const closesAt = race.registrationCloseAt ? new Date(race.registrationCloseAt).getTime() : null;
  const raceAt = new Date(race.raceDate).getTime();
  if ((race.status === "open" && (!closesAt || now <= closesAt)) || (opensAt && closesAt && opensAt <= now && now <= closesAt)) return 0;
  if (opensAt && opensAt > now) return 1;
  if (raceAt > now) return 2;
  return 3;
}

function raceTimes(race) {
  const cached = raceTimeCache.get(race);
  if (cached) return cached;
  const value = {
    close: new Date(race.registrationCloseAt || race.raceDate).getTime(),
    open: new Date(race.registrationOpenAt || race.raceDate).getTime(),
    race: new Date(race.raceDate).getTime()
  };
  raceTimeCache.set(race, value);
  return value;
}

function sortValueForGroup(race, group) {
  const times = raceTimes(race);
  if (group === 0) return times.close;
  if (group === 1) return times.open;
  if (group === 2) return times.race;
  return -times.race;
}

function getRaces() {
  const minute = Math.floor(Date.now() / 60000);
  if (
    sortedRacesSource === state.races &&
    sortedRacesRevision === state.dataRevision &&
    sortedRacesMinute === minute
  ) return sortedRacesCache;
  sortedRacesSource = state.races;
  sortedRacesRevision = state.dataRevision;
  sortedRacesMinute = minute;
  sortedRacesCache = state.races.filter(isVisibleRace).sort((a, b) => {
    const groupA = raceSortGroup(a);
    const groupB = raceSortGroup(b);
    if (groupA !== groupB) return groupA - groupB;
    return sortValueForGroup(a, groupA) - sortValueForGroup(b, groupB);
  });
  return sortedRacesCache;
}

function getActionRaces() {
  return filteredRaces();
}

function getConfirmedRegistrationRaces() {
  return getActionRaces()
    .filter((race) => getUpcomingRegistrationAt(race))
    .sort((a, b) => getUpcomingRegistrationAt(a) - getUpcomingRegistrationAt(b));
}

function getUpcomingRegistrationAt(race) {
  const candidates = [race.registrationOpenAt, ...(race.registrationWindows || []).map((window) => window.opensAt)]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value) && value > Date.now());
  return candidates.length ? Math.min(...candidates) : null;
}

function getOpenRegistrationRaces() {
  return sortOpenRaces(
    getActionRaces().filter((race) => isAcceptingNow(race) && !canUseRegistrationTimer(race)),
    Date.now()
  );
}

// ── 접수 상태 3분류 (전체 = 접수 중 + 접수 예정, 마감은 기본 제외) ──────
function isOpenRace(race) {
  return isAcceptingNow(race) && !isRegistrationClosed(race);
}
function isScheduledRace(race) {
  return !isAcceptingNow(race) && !isRegistrationClosed(race) && Boolean(getUpcomingRegistrationAt(race));
}
function isClosedRace(race) {
  return isRegistrationClosed(race);
}

// 정렬: 대회일 빠른 순(기본) / 접수일 빠른 순 / 지역순
function sortForRegistration(race) {
  const upcoming = getUpcomingRegistrationAt(race);
  if (upcoming) return upcoming;
  const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
  return opensAt ?? new Date(race.raceDate).getTime();
}
function sortFinderList(list) {
  const sorted = [...list];
  if (state.sort === "reg") {
    sorted.sort((a, b) => sortForRegistration(a) - sortForRegistration(b) || new Date(a.raceDate) - new Date(b.raceDate));
  } else if (state.sort === "region") {
    sorted.sort((a, b) => a.region.localeCompare(b.region, "ko") || new Date(a.raceDate) - new Date(b.raceDate));
  } else {
    sorted.sort((a, b) => new Date(a.raceDate) - new Date(b.raceDate) || a.name.localeCompare(b.name, "ko"));
  }
  return sorted;
}

// 현재 검색·지역·거리 조건을 반영한 상태별 목록과 개수를 한 번에 계산한다.
function finderResult() {
  const base = filteredRaces();
  const openList = base.filter(isOpenRace);
  const scheduledList = base.filter(isScheduledRace);
  const closedList = state.includeClosed ? base.filter(isClosedRace) : [];
  const allList = [...openList, ...scheduledList, ...closedList];
  return {
    counts: { all: allList.length, open: openList.length, scheduled: scheduledList.length },
    openList: sortFinderList(openList),
    scheduledList: sortFinderList(scheduledList),
    allList: sortFinderList(allList)
  };
}

function getCategoryRaces() {
  const finder = finderResult();
  if (state.activeCategory === "open") return finder.openList;
  if (state.activeCategory === "scheduled") return finder.scheduledList;
  return finder.allList;
}

function isVisibleRace(race) {
  const now = Date.now();
  const raceAt = new Date(race.raceDate).getTime();
  return raceAt >= now && !["cancelled", "postponed"].includes(race.status);
}

function statusLabel(status) {
  return {
    scheduled: "곧 열림",
    open: "접수 중",
    closed: "마감",
    sold_out: "매진",
    cancelled: "취소",
    postponed: "일정 확인",
    changed: "시간 변경"
  }[status] || "확인 중";
}

function courseTokens(race) {
  const raw = race.courseLabel || race.distances.join(",");
  const items = raw
    .split(/[,/·]+/)
    .map((item) => {
      const value = item.trim();
      if (value.toLowerCase() === "full") return "풀";
      if (value.toLowerCase() === "half") return "하프";
      if (value.toLowerCase() === "trail") return "트레일";
      return value;
    })
    .filter(Boolean);
  return items.length ? items : race.distances;
}

function courseChipsHtml(race) {
  return `<div class="course-chips">${courseTokens(race)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("")}</div>`;
}

function distanceMatches(race, distance) {
  if (distance === "all") return true;
  if (distance === "Full") return race.distances.includes("Full");
  if (distance === "Half") return race.distances.includes("Half");
  if (distance === "10K") return race.distances.includes("10K");
  if (distance === "5K") return race.distances.includes("5K");
  if (distance === "Trail") return race.distances.includes("Trail");
  return race.distances.some((item) => item === distance);
}

function filteredRaces() {
  const query = state.query.trim().toLowerCase();
  return getRaces().filter((race) => {
    const searchable = `${race.name} ${race.region} ${race.city} ${race.venue} ${race.distances.join(" ")}`.toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (state.regionFilter !== "all" && race.region !== state.regionFilter) return false;
    if (!distanceMatches(race, state.distanceFilter)) return false;
    return true;
  });
}

function listRacesForCurrentContext() {
  if (state.selectedCalendarDate) return racesForSelectedDate(state.selectedCalendarDate);
  return getCategoryRaces();
}

function registrationActionAt(race) {
  if (isAcceptingNow(race)) return Date.now();
  return getUpcomingRegistrationAt(race) || new Date(race.raceDate).getTime();
}

// 캘린더에서 고른 날짜(KST)에 접수 시작·마감 또는 대회일이 있는 대회만 추린다.
function racesForSelectedDate(key) {
  return calendarRacesForDate(getRaces(), key)
    .sort((a, b) => registrationActionAt(a) - registrationActionAt(b));
}

// 표시 중인 KST 달 키(YYYY-MM). state.calendarMonth 가 없으면 KST 오늘이 속한 달.
function calendarMonthStart() {
  return typeof state.calendarMonth === "string" ? state.calendarMonth : currentKstMonth();
}

// 접수 시작·종목별 시작·접수 마감·대회일을 각각 KST 날짜키로 집계한다.
function registrationCountByDate() {
  return eventCountsByDate(getRaces());
}

const CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function renderRegistrationCalendar() {
  const target = document.getElementById("registrationCalendar");
  if (!target) return;
  const monthStart = calendarMonthStart();
  const { year, month, firstWeekday, daysInMonth } = calendarMonthInfo(monthStart);
  const todayKey = KST_DATE_KEY.format(new Date());
  const counts = registrationCountByDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(`<div class="calendar-cell blank" aria-hidden="true"></div>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = calendarDateKey(year, month, day);
    const count = counts.get(key) || 0;
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const classes = ["calendar-cell"];
    if (count) classes.push("has-races");
    if (key === todayKey) classes.push("today");
    if (state.selectedCalendarDate === key) classes.push("active");
    if (dow === 0) classes.push("sun");
    if (dow === 6) classes.push("sat");
    const aria = `${month}월 ${day}일${count ? `, 대회 일정 ${count}개` : ", 대회 일정 없음"}${key === todayKey ? ", 오늘" : ""}`;
    cells.push(
      `<button type="button" class="${classes.join(" ")}"${count ? ` data-calendar-date="${escapeHtml(key)}"` : " disabled"}${state.selectedCalendarDate === key ? ' aria-pressed="true"' : ""} aria-label="${aria}"><strong>${day}</strong>${count ? `<span class="cal-dot">${count}</span>` : ""}</button>`
    );
  }
  while (cells.length % 7 !== 0) {
    cells.push(`<div class="calendar-cell blank" aria-hidden="true"></div>`);
  }

  target.innerHTML = `
    <div class="calendar-head">
      <button type="button" class="calendar-nav" data-calendar-nav="prev" aria-label="이전 달"><svg class="family-line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
      <div class="calendar-title"><span>대회 일정 캘린더</span><h2>${year}년 ${month}월</h2></div>
      <button type="button" class="calendar-nav" data-calendar-nav="next" aria-label="다음 달"><svg class="family-line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
    </div>
    <div class="calendar-weekdays">${CALENDAR_WEEKDAYS.map((label, index) => `<span class="${index === 0 ? "sun" : index === 6 ? "sat" : ""}">${label}</span>`).join("")}</div>
    <div class="calendar-grid">${cells.join("")}</div>`;
}

function buildRegistrationAlerts(race, offsets = DEFAULT_OFFSETS, selectedTarget = null, checkTimes = []) {
  const target = selectedTarget || getAlertTarget(race);
  if (!target) return [];
  if (target.type === "registration_time_check") {
    return window.PushRunAlertsCore
      .computeTimeCheckTimes(target.at, checkTimes, Date.now())
      .map(({ slot, fireAt }) => ({
        slot,
        fireAt,
        title: `[${race.name}] 접수 시간 확인 ${slot}`,
        body: `접수 시작 시각이 아직 공식 확인되지 않았어요. 지금 대회 사이트에서 접수 여부를 확인하세요.`,
        raceId: race.id,
        targetType: target.type,
        targetKey: target.key,
        targetAt: target.at,
        targetLabel: target.label
      }));
  }
  // 발사 시각 계산·만료 필터는 alerts-core.js 의 순수 함수를 쓰고, 문구만 여기서 채운다.
  return window.PushRunAlertsCore
    .computeFireTimes(target.at, offsets, Date.now())
    .map(({ offset, fireAt }) => {
      const when = offset === 0 ? "정각" : `${offset}분 전`;
      let title = `[${race.name}] ${target.label} ${when}`;
      let body = `${formatRegistrationPoint(target.at)} ${target.label} 예정입니다.`;

      if (target.type === "registration_open") {
        title = offset === 0 ? `[${race.name}] ${target.label}!` : `[${race.name}] ${target.label} ${offset}분 전`;
        body =
          offset === 0
            ? `${target.ticketLabel || "접수"}가 열렸어요. 대회 사이트에서 바로 확인하세요.`
            : `${formatRegistrationTime(target.at)} ${target.label}. 로그인과 결제 정보를 준비하세요.`;
      }

      if (target.type === "race_day") {
        title = offset === 0 ? `[${race.name}] 대회일 알림` : `[${race.name}] 대회일 ${offset}분 전`;
        body = "오늘 대회 일정입니다. 출발 시간과 장소를 다시 확인하세요.";
      }

      return {
        offset,
        fireAt,
        title,
        body,
        raceId: race.id,
        targetType: target.type,
        targetKey: target.key,
        targetAt: target.at,
        targetLabel: target.label
      };
    });
}

function getSelectedModalOffsets() {
  return Array.from(document.querySelectorAll("#modalPresetGrid input:checked"))
    .map((input) => Number(input.value))
    .sort((a, b) => b - a);
}

function getSelectedModalCheckTimes() {
  return Array.from(document.querySelectorAll("#modalPresetGrid input:checked"))
    .map((input) => input.value)
    .sort();
}

function isTimeCheckTarget(target) {
  return target?.type === "registration_time_check";
}

function formatAlertTargetDate(target) {
  return isTimeCheckTarget(target)
    ? `${formatRegistrationDate(target.at)} · 시간 미확정`
    : formatDateTime(target.at);
}

function alertScheduleLabel(alert) {
  if (alert.slot) return alert.slot;
  return alert.offset === 0 ? "정각" : `${alert.offset}분 전`;
}

function selectRace(id) {
  state.selectedRaceId = id;
  render();
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  window.setTimeout(() => modal.querySelector(FOCUSABLE_SELECTOR)?.focus(), 0);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  state.lastFocusedElement?.focus?.();
  state.lastFocusedElement = null;
}

function getOpenModal() {
  return Array.from(document.querySelectorAll(".modal-backdrop")).find((modal) => !modal.hidden) || null;
}

function trapModalFocus(event, modal) {
  const focusable = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => element instanceof HTMLElement && element.offsetParent !== null
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openAlertModal(raceId) {
  const race = getRaces().find((item) => item.id === raceId);
  const targets = race ? getAlertTargets(race) : [];
  if (!race || !targets.length) {
    showToast("지금은 알림을 켤 시간이 없어요. 대회 사이트에서 확인해 주세요.");
    return;
  }
  state.modalRaceId = raceId;
  const savedTargetKeys = subscriptionsForRace(raceId).map(([, subscription]) => subscription.targetKey).filter(Boolean);
  state.modalTargetKeys = targets.filter((target) => savedTargetKeys.includes(target.key)).map((target) => target.key);
  if (!state.modalTargetKeys.length) state.modalTargetKeys = [targets[0].key];
  renderModal();
  openModal("alertModal");
}

function closeAlertModal() {
  closeModal("alertModal");
  state.modalTargetKeys = [];
}

function openPermissionGuide() {
  openModal("permissionModal");
}

function closePermissionGuide() {
  closeModal("permissionModal");
  saveText(PERMISSION_GUIDE_KEY, "seen");
  renderPermissionEntry();
}

function renderPermissionEntry() {
  const strip = document.getElementById("permissionEntry");
  if (strip) strip.hidden = localStorage.getItem(PERMISSION_GUIDE_KEY) === "seen";
}

function registrationButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "ghost-btn" : "mini-btn action-site";
  const raceName = escapeHtml(race.name);
  // 외부(마라톤온라인) 유래 URL이므로 http/https 스킴만 허용한다(javascript:/data: 등 방어).
  const safeUrl = /^https?:\/\//i.test(race.registrationUrl || "");
  if (!safeUrl) {
    return `<button class="${classes}" type="button" disabled aria-disabled="true" aria-label="${raceName} 접수 사이트 준비 중">준비 중</button>`;
  }
  const insecure = /^http:\/\//i.test(race.registrationUrl);
  const buttonText = variant === "detail" ? "공식 접수처 보기" : "공식 접수처";
  // HTTP 경고는 화면 폭을 차지하지 않는 툴팁/보조 라벨로만 유지한다.
  const warning = insecure
    ? ` title="보안 연결(HTTPS)을 지원하지 않는 외부 사이트입니다" aria-label="${raceName} 접수 사이트 새 창으로 열기, HTTP 연결 주의"`
    : ` aria-label="${raceName} 접수 사이트 새 창으로 열기"`;
  return `<a class="${classes}" href="${escapeHtml(race.registrationUrl)}" target="_blank" rel="noopener noreferrer" data-family-event="official_registration_clicked"${warning}>${buttonText}</a>`;
}

function alertButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "primary-btn" : "mini-btn strong action-alert";
  const target = getAlertTarget(race);
  const label = `${escapeHtml(race.name)} 알림 설정`;
  if (!target) return "";
  return `<button class="${classes}" type="button" data-open-alert="${escapeHtml(race.id)}" aria-label="${label}">알림 설정</button>`;
}

function renderDistanceFilters() {
  const items = [
    ["all", "전체"],
    ["Full", "풀코스"],
    ["Half", "하프"],
    ["10K", "10K"],
    ["5K", "5K"],
    ["Trail", "트레일"]
  ];
  document.getElementById("distanceFilters").innerHTML = items
    .map(([value, label]) => {
      const active = state.distanceFilter === value;
      return `<button class="filter-chip ${active ? "active" : ""}" type="button" data-distance-filter="${value}" aria-pressed="${active}">${label}</button>`;
    })
    .join("");
}

function renderRegionFilter() {
  const select = document.getElementById("regionFilter");
  if (!select) return;
  const regions = [...new Set(getRaces().map((race) => race.region))].sort((a, b) => a.localeCompare(b, "ko"));
  const nextKey = regions.join("|");
  if (nextKey !== regionOptionsKey) {
    regionOptionsKey = nextKey;
    select.innerHTML = `<option value="all">전국</option>${regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("")}`;
  }
  select.value = state.regionFilter;
}

function syncDraftFilters() {
  state.draftDistanceFilter = state.distanceFilter;
  state.draftRegionFilter = state.regionFilter;
  state.draftQuery = state.query;
}

function mobileFilterSummary() {
  const region = state.regionFilter === "all" ? "전체" : state.regionFilter;
  const query = state.query.trim();
  return query ? `${region} · ${query}` : region;
}

function setMobileFiltersExpanded(expanded) {
  state.mobileFiltersExpanded = expanded;
  const panel = document.getElementById("filtersPanel");
  const button = document.getElementById("mobileFilterToggleButton");
  if (panel) panel.hidden = !expanded;
  if (button) {
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "지역 닫기" : `지역 · ${mobileFilterSummary()}`;
  }
}

function renderSearchResults() {
  state.query = state.draftQuery;
  state.selectedRaceId = null;
  state.selectedCalendarDate = null;
  state.visibleRaceCount = INITIAL_RACE_LIMIT;
  renderRaceList();
  renderCategoryTabs();
  renderRegistrationCalendar();
  renderFilterSummary();
  if (state.query.trim()) trackFamilyEvent("race_search_used");
}

function scheduleSearchApply() {
  clearTimeout(searchApplyTimer);
  searchApplyTimer = setTimeout(() => {
    if (!state.searchComposing) renderSearchResults();
  }, 180);
}

function resetFilters() {
  state.distanceFilter = "all";
  state.regionFilter = "all";
  state.query = "";
  state.activeCategory = "all";
  state.sort = "date";
  state.includeClosed = false;
  state.expandedRaceId = null;
  syncDraftFilters();
  state.selectedCalendarDate = null;
  state.visibleRaceCount = INITIAL_RACE_LIMIT;
  const input = document.getElementById("searchInput");
  if (input) input.value = "";
  const clearButton = document.getElementById("clearSearchButton");
  if (clearButton) clearButton.hidden = true;
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) sortSelect.value = "date";
  const includeClosed = document.getElementById("includeClosedToggle");
  if (includeClosed) includeClosed.checked = false;
  renderDistanceFilters();
  renderRegionFilter();
  renderCategoryTabs();
  renderSearchResults();
}

function applyFilters() {
  const searchInput = document.getElementById("searchInput");
  const regionSelect = document.getElementById("regionFilter");
  if (searchInput) state.draftQuery = searchInput.value;
  if (regionSelect) state.draftRegionFilter = regionSelect.value;
  state.distanceFilter = state.draftDistanceFilter;
  state.regionFilter = state.draftRegionFilter;
  state.query = state.draftQuery;
  state.selectedRaceId = null;
  state.visibleRaceCount = INITIAL_RACE_LIMIT;
  if (window.matchMedia("(max-width: 520px)").matches) setMobileFiltersExpanded(false);
  renderRaceList();
  renderCategoryTabs();
  renderRegistrationCalendar();
  renderFilterSummary();
  showToast("선택한 조건으로 대회를 찾았어요.");
}

function renderRaceList() {
  const list = document.getElementById("raceList");
  list.setAttribute("aria-busy", String(state.loadStatus === "loading"));
  if (state.loadStatus === "loading") {
    list.innerHTML = `
      <section class="focus-board" role="status" aria-label="대회 정보를 불러오는 중">
        <div class="all-results-head"><div><span class="section-kicker">전체 대회</span><h2>대회를 확인하고 있어요.</h2></div></div>
        <div class="race-list-list race-list-skeleton" aria-hidden="true">
          ${Array.from({ length: 4 }, () => `<div class="skeleton-card"><span></span><strong></strong><i></i><i></i><b></b></div>`).join("")}
        </div>
      </section>`;
    return;
  }
  if (state.loadStatus === "error") {
    list.innerHTML = `<div class="focus-empty" role="alert"><h3>대회 정보를 불러오지 못했어요.</h3><p>네트워크를 확인한 뒤 다시 시도해주세요.</p><button class="primary-btn" type="button" id="retryRaceDataButton">다시 불러오기</button></div>`;
    return;
  }
  const dateKey = state.selectedCalendarDate;
  const races = listRacesForCurrentContext();
  const visibleRaces = races.slice(0, state.visibleRaceCount);
  const dateHead = dateKey
    ? (() => {
        const [, month, dayNum] = dateKey.split("-").map(Number);
        return `<div class="all-results-head"><div><span class="section-kicker">대회 일정 캘린더</span><h2 id="allResultsTitle">${month}월 ${dayNum}일 일정</h2></div><button class="text-btn calendar-filter-clear" type="button" data-clear-calendar-date>전체 보기</button></div>`;
      })()
    : "";
  if (!races.length) {
    const empty = dateKey
      ? `<div class="finder-empty"><strong>이 날짜에는 대회 일정이 없어요.</strong><button class="text-btn calendar-filter-clear" type="button" data-clear-calendar-date>전체 보기</button></div>`
      : `<div class="finder-empty"><strong>조건에 맞는 대회가 없어요.</strong><span>지역이나 거리 필터를 넓혀 보세요.</span></div>`;
    list.innerHTML = `${dateHead}${empty}`;
    return;
  }
  list.innerHTML = `
    ${dateHead}
    <div class="race-list-list" role="list">
      ${visibleRaces.map(raceCardHtml).join("")}
    </div>
    ${visibleRaces.length < races.length ? `<button class="load-more-btn" type="button" data-load-more>20개 더 보기 <small>${visibleRaces.length}/${races.length}</small></button>` : ""}
  `;
}

function closingSoonHtml(races) {
  if (state.activeCategory !== "open" || state.selectedCalendarDate) return "";
  const now = Date.now();
  const soon = races
    .filter((race) => openRacePriority(race, now).bucket <= 1)
    .slice(0, CLOSING_SOON_LIMIT);
  if (!soon.length) return "";
  return `
    <aside class="closing-soon" aria-labelledby="closingSoonTitle">
      <div class="closing-soon-head"><span class="closing-soon-dot" aria-hidden="true"></span><h3 id="closingSoonTitle">마감 임박</h3><small>7일 안에 닫혀요.</small></div>
      <div class="closing-soon-list">
        ${soon.map((race) => {
          const safeUrl = /^https?:\/\//i.test(race.registrationUrl || "");
          const content = `<span>${escapeHtml(cardCountdown(race, now).label)}</span><strong>${escapeHtml(race.name)}</strong><i>바로 신청</i>`;
          return safeUrl
            ? `<a href="${escapeHtml(race.registrationUrl)}" target="_blank" rel="noopener noreferrer" data-family-event="official_registration_clicked" aria-label="${escapeHtml(race.name)} 공식 접수처 바로 열기">${content}</a>`
            : `<div>${content}</div>`;
        }).join("")}
      </div>
    </aside>`;
}

function renderFilterSummary() {
  const target = document.getElementById("filterSummary");
  if (!target) return;
  target.textContent = `총 ${listRacesForCurrentContext().length}개`;
  const context = document.getElementById("filterSummaryContext");
  if (context) {
    const region = state.regionFilter === "all" ? "전국" : state.regionFilter;
    const distance = state.distanceFilter === "all" ? "전체 거리" : distanceTagLabel(state.distanceFilter);
    const statusWord = state.activeCategory === "all" ? "전체" : state.activeCategory === "open" ? "중" : "예정";
    const query = state.query.trim() ? ` · “${state.query.trim()}”` : "";
    context.textContent = `${region} · ${distance} · 접수 ${statusWord}${query}`;
  }
  const resetRow = document.getElementById("resetRow");
  if (resetRow) {
    const hasFilters = state.distanceFilter !== "all" || state.regionFilter !== "all" || state.query.trim() !== "" || state.activeCategory !== "all" || state.sort !== "date" || state.includeClosed;
    resetRow.hidden = !hasFilters;
  }
}

// 거리 토큰 → 카드 태그 표시(풀코스/하프/트레일/10km/5km)
function distanceTagLabel(token) {
  return { Full: "풀코스", Half: "하프", Trail: "트레일", "10K": "10km", "5K": "5km" }[token] || token;
}
function courseTagList(race) {
  const tokens = Array.isArray(race.distances) && race.distances.length ? race.distances : courseTokens(race);
  return [...new Set(tokens.map(distanceTagLabel))];
}

// 접수 상태 → 카드 톤(상단 색선·배지·시간 확정 필). 시안과 1:1.
function raceTone(race) {
  if (isOpenRace(race)) {
    return { accent: "#2e9e63", badgeBg: "#e3f4e9", badgeColor: "#217a4b", statusLabel: "접수 중", timePill: false, regLineColor: "#5c4d40" };
  }
  if (isRegistrationClosed(race)) {
    return { accent: "#d8c7b8", badgeBg: "#f3e9dd", badgeColor: "#6e6156", statusLabel: "접수 마감", timePill: false, regLineColor: "#6e6156" };
  }
  if (hasConfirmedRegistrationOpenTime(race)) {
    return { accent: "#d9932c", badgeBg: "#fdf1dc", badgeColor: "#8a6414", statusLabel: "접수 예정", timePill: true, timePillLabel: "시간 확정", timePillBg: "#e3f4e9", timePillColor: "#217a4b", timePillBorder: "0", regLineColor: "#5c4d40" };
  }
  return { accent: "repeating-linear-gradient(90deg,#cbb8a5 0 7px,transparent 7px 11px)", badgeBg: "#f3e9dd", badgeColor: "#6e6156", statusLabel: "접수 예정", timePill: true, timePillLabel: "시간 확인 중", timePillBg: "#f3e9dd", timePillColor: "#6e6156", timePillBorder: "1px dashed #cbb8a5", regLineColor: "#6e6156" };
}

// ⑥ 카드에서 가장 중요한 접수 일정 한 줄
function registrationSummaryLine(race) {
  if (isOpenRace(race)) {
    return race.registrationCloseAt ? `접수 마감 ${formatRegistrationPoint(race.registrationCloseAt)}` : "공식 접수처에서 접수 마감 확인";
  }
  if (isRegistrationClosed(race)) return "접수가 마감되었어요";
  const at = getUpcomingRegistrationAt(race);
  if (at) {
    return hasConfirmedRegistrationOpenTime(race)
      ? `접수 시작 ${formatRegistrationPoint(at)}`
      : `접수 시작 ${formatRegistrationDate(at)} · 시각 확인 전`;
  }
  return race.registrationLabel || "접수 일정 준비 중";
}

const MAP_PIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>';

// ⑧ 자세히 보기 아코디언 상세
function raceDetailHtml(race) {
  const mapUrl = raceMapLink(race);
  const startPlace = race.venue ? escapeHtml(race.venue) : "행사장·출발 장소 공식 확인 필요";
  const mapBlock = mapUrl
    ? `<a class="detail-map-btn" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(race.name)} 출발 장소 네이버지도에서 보기">${MAP_PIN_SVG}<span>네이버지도에서 출발 장소 보기</span></a>`
    : `<div class="detail-map-disabled" role="note">출발 장소 공식 확인 중</div>`;

  const { separate, rows } = registrationScheduleRows(race);
  const windowRows = rows.map((row) => {
    const label = separate ? row.label || "종목" : "전 종목";
    let value;
    if (!row.at) value = "일정 확인 중";
    else if (isAcceptingNow(race) && new Date(row.at).getTime() <= Date.now()) value = "진행 중";
    else value = row.confirmed ? formatRegistrationPoint(row.at) : `${formatRegistrationDate(row.at)} 접수 (시각 확인 전)`;
    return `<div class="detail-window"><span class="detail-window-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }).join("");

  const raceSchedule = `${formatRegistrationDate(race.raceDate)} ${formatRegistrationTime(race.raceDate)}`;
  const capacityLabel = race.capacity ? `${Number(race.capacity).toLocaleString("ko-KR")}명` : null;
  const organizerLine = [race.organizer, capacityLabel].filter(Boolean).join(" · ") || "주최·규모 정보 준비 중";

  const safeUrl = /^https?:\/\//i.test(race.registrationUrl || "");
  const insecure = /^http:\/\//i.test(race.registrationUrl || "");
  const officialBlock = safeUrl
    ? `<a class="detail-official" href="${escapeHtml(race.registrationUrl)}" target="_blank" rel="noopener noreferrer" data-family-event="official_registration_clicked"${insecure ? ' title="보안 연결(HTTPS)을 지원하지 않는 외부 사이트입니다"' : ""} aria-label="${escapeHtml(race.name)} 공식 접수처 새 창으로 열기">공식 접수처 열기</a>`
    : `<div class="detail-official disabled" role="note">공식 접수처 링크 준비 중</div>`;
  const sourceLine = `${escapeHtml(race.sourceName || "공개 접수 일정")} · 신청 전 공식 페이지 확인`;

  return `
    <div class="race-detail" role="region" aria-label="${escapeHtml(race.name)} 상세 정보">
      <div class="detail-block"><span class="detail-key">출발 장소</span><strong class="detail-place">${startPlace}</strong></div>
      <div class="detail-map">${mapBlock}<p class="detail-map-note">출발 장소는 대회 공지로 변경될 수 있어 공식 안내를 함께 확인하세요.</p></div>
      <div class="detail-block"><span class="detail-key">접수 일정</span><strong>${escapeHtml(formatRegistrationRange(race))}</strong></div>
      <div class="detail-block"><span class="detail-key">종목별 접수 시각</span><div class="detail-windows">${windowRows}</div></div>
      <div class="detail-block"><span class="detail-key">대회 일정</span><strong>${escapeHtml(raceSchedule)}</strong></div>
      <div class="detail-block"><span class="detail-key">주최 · 규모</span><strong>${escapeHtml(organizerLine)}</strong></div>
      <div class="detail-official-wrap">${officialBlock}<span class="detail-source">${sourceLine}</span></div>
    </div>
  `;
}

function raceCardHtml(race) {
  const safeId = escapeHtml(race.id);
  const tone = raceTone(race);
  const expanded = state.expandedRaceId === race.id;
  const alertOn = subscriptionsForRace(race.id).length > 0;
  const canAlert = canUseAlert(race);
  const tags = courseTagList(race)
    .map((tag) => `<span class="race-tag">${escapeHtml(tag)}</span>`)
    .join("");
  const timePill = tone.timePill
    ? `<span class="race-time-pill" style="background:${tone.timePillBg};color:${tone.timePillColor};border:${tone.timePillBorder}">${escapeHtml(tone.timePillLabel)}</span>`
    : "";
  // 강한 코랄 CTA(⑦): 접수 예정·대회일 알림 가능 → "알림 설정",
  // 이미 접수 중이라 알릴 시점이 없으면 → "지금 접수하기"(공식 접수처).
  const safeRegUrl = /^https?:\/\//i.test(race.registrationUrl || "");
  const alertButton = canAlert
    ? `<button class="race-alert-btn${alertOn ? " on" : ""}" type="button" data-open-alert="${safeId}" aria-pressed="${alertOn}" aria-label="${escapeHtml(race.name)} 접수 알림 ${alertOn ? "설정됨" : "설정"}">${alertOn ? "알림 켜짐" : "알림 설정"}</button>`
    : safeRegUrl
      ? `<a class="race-alert-btn" href="${escapeHtml(race.registrationUrl)}" target="_blank" rel="noopener noreferrer" data-family-event="official_registration_clicked" aria-label="${escapeHtml(race.name)} 공식 접수처 새 창으로 열기">지금 접수하기</a>`
      : `<span class="race-alert-btn disabled" role="note">공식 접수처 확인</span>`;
  return `
    <article class="race-card-v2" data-race-id="${safeId}" data-expanded="${expanded}" role="listitem" tabindex="-1">
      <span class="race-accent" aria-hidden="true" style="background:${tone.accent}"></span>
      <div class="race-card-top">
        <div class="race-status-wrap">
          <span class="race-badge" style="background:${tone.badgeBg};color:${tone.badgeColor}">${escapeHtml(tone.statusLabel)}</span>
          ${timePill}
        </div>
        <div class="race-tags">${tags}</div>
      </div>
      <h3 class="race-name">${escapeHtml(race.name)}</h3>
      <p class="race-when"><strong>${escapeHtml(formatRegistrationDate(race.raceDate))} ${escapeHtml(formatRegistrationTime(race.raceDate))}</strong><span> · ${escapeHtml(race.region)} ${escapeHtml(race.city)}</span></p>
      <div class="race-regline"><span class="race-regline-key">접수</span><span class="race-regline-val" style="color:${tone.regLineColor}">${escapeHtml(registrationSummaryLine(race))}</span></div>
      <div class="race-card-actions">
        ${alertButton}
        <button class="race-expand-btn" type="button" data-expand-race="${safeId}" aria-expanded="${expanded}" aria-controls="detail-${safeId}">${expanded ? "간단히 보기" : "자세히 보기"}</button>
      </div>
      ${expanded ? `<div id="detail-${safeId}">${raceDetailHtml(race)}</div>` : ""}
    </article>
  `;
}

// 매초 갱신되는 시간 부분(카운트다운)만 따로 그린다. 체크박스 그리드는 건드리지 않는다.
function renderModalCountdown() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  const targets = getAlertTargets(race);
  const target = targets.find((item) => state.modalTargetKeys.includes(item.key)) || targets[0];
  if (!target) return;
  document.getElementById("modalCountdown").innerHTML = `
    <span>${escapeHtml(target.label)}</span>
    <strong>${escapeHtml(formatDday(target.at))}</strong>
    <small>${escapeHtml(formatAlertTargetDate(target))}</small>
  `;
}

function renderModal() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  const targets = getAlertTargets(race);
  const target = targets.find((item) => state.modalTargetKeys.includes(item.key)) || targets[0];
  if (!target) return;
  const selectedSubscriptions = targets
    .filter((item) => state.modalTargetKeys.includes(item.key))
    .map((item) => state.alerts[subscriptionKey(race.id, item)])
    .filter(Boolean);
  const subscription = selectedSubscriptions[0];
  const usesTimeCheck = targets.some(isTimeCheckTarget);
  const selectedOffsets = subscription?.offsets?.length ? subscription.offsets : DEFAULT_OFFSETS;
  const selectedCheckTimes = subscription?.checkTimes?.length
    ? subscription.checkTimes
    : window.PushRunAlertsCore.DEFAULT_TIME_CHECK_SLOTS;
  document.getElementById("modalRaceName").textContent = race.name;
  document.getElementById("modalRaceMeta").textContent = state.modalTargetKeys.length > 1
    ? `${state.modalTargetKeys.length}개 종목 접수 알림 · ${race.region} ${race.city}`
    : `${target.label} ${formatAlertTargetDate(target)} · ${race.region} ${race.city}`;
  renderModalCountdown();
  document.getElementById("modalTargetGrid").innerHTML = targets.map((item) => `
    <label>
      <input type="checkbox" value="${escapeHtml(item.key)}" ${state.modalTargetKeys.includes(item.key) ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(item.ticketLabel || item.label)}</strong>
        <small>${escapeHtml(formatAlertTargetDate(item))}</small>
      </span>
    </label>
  `).join("");
  document.getElementById("modalTargetTitle").textContent = targets.length > 1 ? "알림 받을 종목" : "알림 대상";
  document.getElementById("modalPresetTitle").textContent = usesTimeCheck ? "시간 확인 알림" : "알림 받을 시간";
  document.getElementById("modalPresetGrid").innerHTML = (usesTimeCheck
    ? window.PushRunAlertsCore.DEFAULT_TIME_CHECK_SLOTS.map((slot) => ({ slot }))
    : DEFAULT_OFFSETS.map((offset) => ({ offset })))
    .map((item) => usesTimeCheck ? `
      <label>
        <input type="checkbox" value="${item.slot}" ${selectedCheckTimes.includes(item.slot) ? "checked" : ""} />
        <span>${item.slot}</span>
      </label>
    ` : `
      <label>
        <input type="checkbox" value="${item.offset}" ${selectedOffsets.includes(item.offset) ? "checked" : ""} />
        <span>${item.offset === 0 ? "정각" : `${item.offset}분 전`}</span>
      </label>
    `).join("");
  const activeLabels = usesTimeCheck
    ? selectedCheckTimes.join(", ")
    : selectedOffsets.map((offset) => offset === 0 ? "정각" : `${offset}분 전`).join(", ");
  document.getElementById("modalAlertHint").textContent = usesTimeCheck
    ? `${activeLabels}에 공식 접수 여부를 확인하라고 알려드려요. 정확한 시간이 등록되면 다음 새로고침에서 정각 알림으로 바뀝니다.`
    : `${state.modalTargetKeys.length || 0}개 종목에 ${activeLabels} 알림을 함께 적용해요.`;
  const savedCount = subscriptionsForRace(race.id).length;
  const cancelButton = document.getElementById("modalCancelAlertButton");
  cancelButton.hidden = savedCount === 0;
  cancelButton.textContent = "전체 끄기";
  cancelButton.setAttribute("aria-label", `${race.name} 알림 ${savedCount}개 모두 끄기`);
}

function renderAlerts() {
  const list = document.getElementById("alertList");
  const racesById = Object.fromEntries(getRaces().map((race) => [race.id, race]));
  const active = Object.entries(state.alerts)
    .filter(([, alert]) => alert.enabled && alert.targetType !== "registration_close")
    .sort((a, b) => new Date(a[1].targetAt).getTime() - new Date(b[1].targetAt).getTime());
  if (!active.length) {
    list.innerHTML = `<div class="alert-card"><h3>켜진 알림이 없어요.</h3><p class="meta-line">대회 카드의 알림 설정을 눌러 추가하세요.</p></div>`;
    return;
  }
  list.innerHTML = active
    .map(([subscriptionId, subscription]) => {
      const race = racesById[subscription.raceId];
      if (!race) return "";
      const targetLabel = subscription.targetLabel || "접수 시작";
      const target = { type: subscription.targetType, at: subscription.targetAt || race.registrationOpenAt || race.raceDate };
      const targetAt = target.at;
      const visibleAlerts = [...(subscription.scheduledAlerts?.length
        ? subscription.scheduledAlerts.map((alert) => alert.offset)
        : subscription.offsets
      )];
      return `
        <div class="alert-card">
          <div class="alert-head">
            <div>
              <h3>${escapeHtml(race.name)}</h3>
              <p class="meta-line">${escapeHtml(targetLabel)} ${escapeHtml(formatAlertTargetDate(target))}</p>
            </div>
            <span class="status-pill scheduled">${escapeHtml(targetLabel)} 알림</span>
          </div>
          <div class="chips">
            ${(subscription.scheduledAlerts?.length ? subscription.scheduledAlerts : visibleAlerts.map((offset) => ({ offset }))).map((alert) => `<span class="chip highlight">${escapeHtml(alertScheduleLabel(alert))}</span>`).join("")}
          </div>
          <div class="detail-actions" style="margin-top:14px">
            <button class="ghost-btn" type="button" data-focus-race="${escapeHtml(race.id)}">상세</button>
            <button class="danger-btn" type="button" data-cancel-subscription="${escapeHtml(subscriptionId)}" aria-label="${escapeHtml(race.name)} ${escapeHtml(targetLabel)} 알림 끄기">알림 끄기</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSyncStatus() {
  const lastSync = localStorage.getItem(SYNC_STORAGE_KEY);
  const versionText = state.dataVersion ? ` · 데이터 ${state.dataVersion}` : "";
  const text = lastSync ? `마지막 확인: ${formatDateTime(lastSync)}${versionText}` : `마지막 확인: 아직 없음${versionText}`;
  const target = document.getElementById("lastSyncText");
  if (target) target.textContent = text;
}

function renderAppInfo() {
  const appVersion = document.getElementById("appVersionText");
  const appVersionDetail = document.getElementById("appVersionDetailText");
  const dataVersion = document.getElementById("dataVersionText");
  const buildSha = document.getElementById("buildShaText");
  const cacheVersion = document.getElementById("cacheVersionText");
  if (appVersion) appVersion.textContent = APP_VERSION;
  if (appVersionDetail) appVersionDetail.textContent = APP_VERSION;
  if (dataVersion) dataVersion.textContent = state.dataVersion || "확인 전";
  if (buildSha) buildSha.textContent = BUILD_SHA.startsWith("__") ? "로컬" : BUILD_SHA;
  if (cacheVersion) cacheVersion.textContent = PWA_CACHE_VERSION;
  const subjectBase = `러닝봄 ${APP_VERSION}`;
  const general = document.getElementById("generalInquiryLink");
  if (general) general.href = `mailto:hello.robom@gmail.com?subject=${encodeURIComponent(`[${subjectBase}] 일반 문의`)}`;
}

function renderCategoryTabs() {
  const target = document.getElementById("categoryTabs");
  if (!target) return;
  const { counts } = finderResult();
  target.innerHTML = [
    ["all", "전체", counts.all],
    ["open", "접수 중", counts.open],
    ["scheduled", "접수 예정", counts.scheduled]
  ]
    .map(([value, label, count]) => {
      const active = state.activeCategory === value;
      return `
      <button class="status-seg ${active ? "active" : ""}" type="button" data-category="${value}" aria-pressed="${active}">
        <span class="status-seg-label">${escapeHtml(label)}</span>
        <strong class="status-seg-count">${count}</strong>
      </button>
    `;
    })
    .join("");
}

function updatePermissionText() {
  const target = document.getElementById("permissionText");
  if (!target) return;
  if (!("Notification" in window)) {
    target.textContent = "이 브라우저는 알림을 지원하지 않습니다.";
    return;
  }
  const labels = {
    granted: "알림 권한이 켜져 있습니다.",
    denied: "알림 권한이 꺼져 있습니다.",
    default: "아직 알림 권한을 요청하지 않았습니다."
  };
  target.textContent = labels[Notification.permission] || "확인 중";
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

async function fireWebAlert(alert) {
  showToast(alert.title);
  if ("Notification" in window && Notification.permission === "granted") {
    const options = {
      body: alert.body,
      tag: `${alert.raceId}-${alert.targetKey || alert.targetType || "alert"}-${alert.slot || alert.offset}`,
      icon: "./icon-v2.svg",
      data: { url: "./" }
    };
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.showNotification(alert.title, options);
      else new Notification(alert.title, options);
    } catch {
      // 화면 토스트는 이미 표시했으므로 브라우저 알림 실패는 조용히 종료한다.
    }
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 220);
  } catch {
  }
}

function clearBrowserTimers() {
  state.timers.forEach((timer) => clearTimeout(timer));
  state.timers = [];
}

function scheduleBrowserTimers(alerts) {
  alerts.forEach((alert) => {
    // setTimeout 24.8일(2^31-1 ms) 클램프 판정은 alerts-core.js 의 classifyTimerDelay 로 일원화.
    const timing = window.PushRunAlertsCore.classifyTimerDelay(alert.fireAt, Date.now());
    if (timing.isPast) return;
    if (timing.needsRearm) {
      // ★ 24.8일 넘는 알림(예: 8·9월 대회)은 드롭하지 않고, 상한만큼 잔 뒤 전체 스케줄을
      // 다시 건다(재무장). 한 번의 스케줄 패스에 재무장 타이머는 하나만 둔다.
      if (!state.rearmScheduled) {
        state.rearmScheduled = true;
        state.timers.push(setTimeout(scheduleAllBrowserTimers, window.PushRunAlertsCore.MAX_TIMER_DELAY));
      }
      return;
    }
    state.timers.push(setTimeout(() => void fireWebAlert(alert), timing.delay));
  });
}

function scheduleAllBrowserTimers() {
  clearBrowserTimers();
  state.rearmScheduled = false;
  Object.values(state.alerts).forEach((subscription) => {
    if (subscription.enabled && subscription.targetType !== "registration_close") scheduleBrowserTimers(subscription.scheduledAlerts || []);
  });
}

// ★ 핵심 신뢰 수정: 저장된 알림의 발사 시각(fireAt)을 "최신 대회 데이터" 기준으로 다시 계산한다.
// races.json 에서 접수 시각이 바뀌면 바뀐 시각으로 알림을 다시 걸고,
// 데이터에서 사라진 대회의 알림(고아)과 발사 시각이 이미 지난 알림(만료)은 즉시 제거한다.
// UX 결정: 만료 알림은 유예 기간 없이 리로드 시점에 바로 지운다 — '내 알림'에는
// 실제로 울릴 알림만 남겨서 "켜져 있는데 안 울리는" 상태를 없앤다.
function reconcileStoredAlerts() {
  if (!state.races.length) return; // 데이터 로드 실패 시에는 판단 근거가 없으므로 건드리지 않는다.
  const result = window.PushRunAlertsCore.reconcileSubscriptions(state.alerts, state.races, {
    now: Date.now(),
    buildScheduledAlerts: (race, offsets, target, checkTimes) => buildRegistrationAlerts(race, offsets, target, checkTimes)
  });
  state.alerts = result.alerts;
  if (result.updated.length || result.dropped.length || result.expired.length) {
    saveJson(ALERT_STORAGE_KEY, state.alerts);
  }
}

async function enableAlertFromModal() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  if (race.status === "cancelled") {
    showToast("취소된 대회는 알림을 켤 수 없어요.");
    return;
  }
  const targets = state.modalTargetKeys.map((targetKey) => getTargetByKey(race, targetKey)).filter(Boolean);
  if (!targets.length) {
    showToast("알림 받을 종목을 하나 이상 선택하세요.");
    return;
  }
  const usesTimeCheck = targets.some(isTimeCheckTarget);
  const offsets = usesTimeCheck ? [] : getSelectedModalOffsets();
  const checkTimes = usesTimeCheck ? getSelectedModalCheckTimes() : [];
  if ((!usesTimeCheck && !offsets.length) || (usesTimeCheck && !checkTimes.length)) {
    showToast(usesTimeCheck ? "시간 확인 알림을 하나 이상 선택하세요." : "알림 시간을 하나 이상 선택하세요.");
    return;
  }
  let permission = "default";
  try {
    permission = await ensureNotificationPermission();
  } catch {
    showToast("브라우저 알림 권한을 확인하지 못했어요.");
    return;
  }
  const scheduledByTarget = targets.map((target) => ({ target, scheduledAlerts: buildRegistrationAlerts(race, offsets, target, checkTimes) }));
  if (scheduledByTarget.some((item) => !item.scheduledAlerts.length)) {
    showToast("지금은 알림을 켤 시간이 없어요.");
    return;
  }
  const previousAlerts = state.alerts;
  const nextAlerts = Object.fromEntries(Object.entries(state.alerts).filter(([, subscription]) => subscription?.raceId !== race.id));
  for (const { target, scheduledAlerts } of scheduledByTarget) {
    nextAlerts[subscriptionKey(race.id, target)] = {
      enabled: true,
      raceId: race.id,
      targetType: target.type,
      targetKey: target.key,
      targetAt: target.at,
      targetLabel: target.label,
      upgradeTargetKey: target.upgradeTargetKey,
      offsets,
      checkTimes,
      scheduledAlerts,
      createdAt: new Date().toISOString()
    };
  }
  state.alerts = nextAlerts;
  if (!saveJson(ALERT_STORAGE_KEY, state.alerts)) {
    state.alerts = previousAlerts;
    showToast("알림을 기기에 저장하지 못했어요. 브라우저 저장 설정을 확인해주세요.");
    return;
  }
  scheduleAllBrowserTimers();
  closeAlertModal();
  render();
  Array.from(document.querySelectorAll("[data-open-alert]"))
    .find((button) => button.dataset.openAlert === race.id)
    ?.focus();
  const savedMessage = targets.length > 1 ? `${targets.length}개 종목 알림을 켰어요.` : `${targets[0].ticketLabel || "접수"} 알림을 켰어요.`;
  showToast(permission === "granted" ? savedMessage : `${savedMessage} 브라우저 권한은 꺼져 있어요.`);
  trackFamilyEvent("alert_enabled", "alerts");
}

function cancelAlert(subscriptionId) {
  if (state.alerts[subscriptionId]) {
    const previous = state.alerts[subscriptionId];
    delete state.alerts[subscriptionId];
    if (!saveJson(ALERT_STORAGE_KEY, state.alerts)) {
      state.alerts[subscriptionId] = previous;
      showToast("알림 변경을 기기에 저장하지 못했어요.");
      return;
    }
    scheduleAllBrowserTimers();
    render();
    if (state.modalRaceId === previous.raceId) renderModal();
    showToast("알림을 껐어요.");
  }
}

function cancelAlertsForRace(raceId) {
  const entries = subscriptionsForRace(raceId);
  if (!entries.length) return;
  const previousAlerts = state.alerts;
  state.alerts = Object.fromEntries(Object.entries(state.alerts).filter(([, subscription]) => subscription?.raceId !== raceId));
  if (!saveJson(ALERT_STORAGE_KEY, state.alerts)) {
    state.alerts = previousAlerts;
    showToast("알림 변경을 기기에 저장하지 못했어요.");
    return;
  }
  scheduleAllBrowserTimers();
  closeAlertModal();
  render();
  showToast(`이 대회의 알림 ${entries.length}개를 껐어요.`);
}

async function refreshRaceData() {
  const syncButton = document.getElementById("syncButton");
  state.loadStatus = "loading";
  if (syncButton) {
    syncButton.disabled = true;
    syncButton.setAttribute("aria-busy", "true");
  }
  renderRaceList();
  try {
    await loadRaceData();
    saveText(SYNC_STORAGE_KEY, new Date().toISOString());
    state.loadStatus = "ready";
    reconcileStoredAlerts();
    scheduleAllBrowserTimers();
    state.selectedRaceId = null;
    render();
    showToast("최신 대회 데이터를 다시 불러왔어요.");
  } catch {
    state.loadStatus = "error";
    renderRaceList();
    showToast("대회 데이터를 다시 불러오지 못했어요.");
  } finally {
    if (syncButton) {
      syncButton.disabled = false;
      syncButton.removeAttribute("aria-busy");
    }
  }
}


// 폰 설정 딥링크(웹 최선책): Android Chrome 계열은 intent: URI로 일부 시스템 설정을 열 수 있다.
// 화면이 실제로 전환되지 않으면(비Android·미지원 브라우저) 안내 폴백을 연다.
function openAndroidSetting(action, fallback) {
  if (!/android/i.test(navigator.userAgent)) {
    fallback();
    return;
  }
  const timer = window.setTimeout(() => fallback(), 1600);
  const cancel = () => {
    if (document.hidden) window.clearTimeout(timer);
  };
  document.addEventListener("visibilitychange", cancel, { once: true });
  window.location.href = "intent:#Intent;action=" + action + ";end";
}

function showPermissionGuideFallback() {
  const btn = document.getElementById("openPermissionGuideButton");
  if (btn) btn.click();
}

function showBatteryGuide() {
  openModal("batteryModal");
}

function closeBatteryGuide() {
  closeModal("batteryModal");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.hideTimer);
  showToast.hideTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setView(viewName) {
  const previousView = document.querySelector(".view.active")?.id.replace("view-", "");
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === viewName;
    button.classList.toggle("active", active);
    if (button.matches(".nav-pill, .mobile-tab")) {
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  renderAlerts();
  renderSyncStatus();
  if (previousView && previousView !== viewName) window.scrollTo({ top: 0, behavior: "auto" });
}

function bindEvents() {
  const categoryTabs = document.getElementById("categoryTabs");
  if (categoryTabs) {
    categoryTabs.addEventListener("click", (event) => {
      const categoryButton = event.target.closest("[data-category]");
      if (!categoryButton) return;
      const category = categoryButton.dataset.category;
      state.activeCategory = category;
      state.selectedRaceId = null;
      state.selectedCalendarDate = null;
      state.visibleRaceCount = INITIAL_RACE_LIMIT;
      renderCategoryTabs();
      renderRegistrationCalendar();
      renderRaceList();
      renderFilterSummary();
      trackFamilyEvent("race_filter_applied");
      document.querySelector(`[data-category="${category}"]`)?.focus();
    });
  }

  document.addEventListener("click", (event) => {
    const familyEventTarget = event.target.closest("[data-family-event]");
    if (familyEventTarget) trackFamilyEvent(familyEventTarget.dataset.familyEvent);

    const retryButton = event.target.closest("#retryRaceDataButton");
    if (retryButton) {
      void refreshRaceData();
      return;
    }

    const loadMoreButton = event.target.closest("[data-load-more]");
    if (loadMoreButton) {
      const previousCount = state.visibleRaceCount;
      state.visibleRaceCount += INITIAL_RACE_LIMIT;
      renderRaceList();
      document.querySelectorAll(".race-card-v2")[previousCount]?.focus?.({ preventScroll: true });
      document.querySelectorAll(".race-card-v2")[previousCount]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const alertButton = event.target.closest("[data-open-alert]");
    if (alertButton) {
      openAlertModal(alertButton.dataset.openAlert);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-subscription]");
    if (cancelButton) {
      cancelAlert(cancelButton.dataset.cancelSubscription);
      return;
    }

    const focusButton = event.target.closest("[data-focus-race]");
    if (focusButton) {
      setView("home");
      selectRace(focusButton.dataset.focusRace);
      return;
    }

    const clearDateButton = event.target.closest("[data-clear-calendar-date]");
    if (clearDateButton) {
      state.selectedCalendarDate = null;
      state.visibleRaceCount = INITIAL_RACE_LIMIT;
      render();
      document.querySelector(".content-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const navButton = event.target.closest("[data-calendar-nav]");
    if (navButton) {
      const base = calendarMonthStart();
      const step = navButton.dataset.calendarNav === "next" ? 1 : -1;
      state.calendarMonth = shiftCalendarMonth(base, step);
      renderRegistrationCalendar();
      return;
    }

    const dayButton = event.target.closest("[data-calendar-date]");
    if (dayButton) {
      const key = dayButton.dataset.calendarDate;
      state.selectedCalendarDate = state.selectedCalendarDate === key ? null : key;
      state.visibleRaceCount = INITIAL_RACE_LIMIT;
      render();
      document.querySelector(".content-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const expandButton = event.target.closest("[data-expand-race]");
    if (expandButton) {
      const id = expandButton.dataset.expandRace;
      state.expandedRaceId = state.expandedRaceId === id ? null : id;
      renderRaceList();
      const card = document.querySelector(`[data-race-id="${CSS.escape(id)}"]`);
      card?.querySelector("[data-expand-race]")?.focus({ preventScroll: true });
      if (state.expandedRaceId === id) card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (state.expandedRaceId === id) trackFamilyEvent("race_opened");
      return;
    }

    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      setView(viewButton.dataset.view);
    }
  });

  document.getElementById("searchInput").addEventListener("compositionstart", () => {
    state.searchComposing = true;
  });
  document.getElementById("searchInput").addEventListener("compositionend", (event) => {
    state.searchComposing = false;
    state.draftQuery = event.target.value;
    scheduleSearchApply();
  });
  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.draftQuery = event.target.value;
    const clearButton = document.getElementById("clearSearchButton");
    if (clearButton) clearButton.hidden = !event.target.value;
    if (!state.searchComposing) scheduleSearchApply();
  });

  // Enter 키로 검색을 즉시 반영한다(디바운스 대기 없이).
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    state.draftQuery = event.target.value;
    renderSearchResults();
  });

  document.addEventListener("click", (event) => {
    const distanceButton = event.target.closest("[data-distance-filter]");
    if (distanceButton) {
      const distance = distanceButton.dataset.distanceFilter;
      state.distanceFilter = distance;
      state.draftDistanceFilter = distance;
      state.selectedRaceId = null;
      state.visibleRaceCount = INITIAL_RACE_LIMIT;
      renderDistanceFilters();
      renderRaceList();
      renderCategoryTabs();
      renderRegistrationCalendar();
      renderFilterSummary();
      trackFamilyEvent("race_filter_applied");
      document.querySelector(`[data-distance-filter="${distance}"]`)?.focus();
    }
  });

  // 지역 선택: 적용 버튼 없이 즉시 목록 갱신.
  document.getElementById("regionFilter").addEventListener("change", (event) => {
    state.regionFilter = event.target.value;
    state.draftRegionFilter = event.target.value;
    state.selectedCalendarDate = null;
    state.visibleRaceCount = INITIAL_RACE_LIMIT;
    renderRaceList();
    renderCategoryTabs();
    renderRegistrationCalendar();
    renderFilterSummary();
    trackFamilyEvent("race_filter_applied");
  });

  // 정렬: 대회일/접수일/지역순 즉시 적용.
  document.getElementById("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    state.visibleRaceCount = INITIAL_RACE_LIMIT;
    renderRaceList();
    renderFilterSummary();
  });

  // 조건 더보기: 접수 마감 포함 토글.
  document.getElementById("includeClosedToggle").addEventListener("change", (event) => {
    state.includeClosed = event.target.checked;
    state.visibleRaceCount = INITIAL_RACE_LIMIT;
    renderRaceList();
    renderCategoryTabs();
    renderFilterSummary();
  });

  document.getElementById("clearSearchButton").addEventListener("click", () => {
    const searchInput = document.getElementById("searchInput");
    state.draftQuery = "";
    state.query = "";
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    document.getElementById("clearSearchButton").hidden = true;
    renderSearchResults();
  });
  document.getElementById("resetFiltersButton").addEventListener("click", resetFilters);
  document.getElementById("syncButton").addEventListener("click", refreshRaceData);
  const permissionEntryButton = document.getElementById("openPermissionGuideButton");
  if (permissionEntryButton) permissionEntryButton.addEventListener("click", openPermissionGuide);

  document.getElementById("modalCloseButton").addEventListener("click", closeAlertModal);
  document.getElementById("alertModal").addEventListener("click", (event) => {
    if (event.target.id === "alertModal") closeAlertModal();
  });
  document.getElementById("modalSaveButton").addEventListener("click", enableAlertFromModal);
  document.getElementById("modalCancelAlertButton").addEventListener("click", () => cancelAlertsForRace(state.modalRaceId));
  document.getElementById("modalTargetGrid").addEventListener("change", (event) => {
    const focusKey = event.target.value;
    state.modalTargetKeys = Array.from(document.querySelectorAll("#modalTargetGrid input:checked")).map((input) => input.value);
    const selectedValues = Array.from(document.querySelectorAll("#modalPresetGrid input:checked")).map((input) => input.value);
    renderModal();
    if (selectedValues.length) {
      document.querySelectorAll("#modalPresetGrid input").forEach((input) => {
        input.checked = selectedValues.includes(input.value);
      });
    }
    Array.from(document.querySelectorAll("#modalTargetGrid input")).find((input) => input.value === focusKey)?.focus();
  });

  document.getElementById("permissionCloseButton").addEventListener("click", closePermissionGuide);
  document.getElementById("permissionLaterButton").addEventListener("click", closePermissionGuide);
  document.getElementById("permissionModal").addEventListener("click", (event) => {
    if (event.target.id === "permissionModal") closePermissionGuide();
  });
  document.getElementById("permissionEnableButton").addEventListener("click", async () => {
    const permission = await ensureNotificationPermission();
    updatePermissionText();
    closePermissionGuide();
    showToast(permission === "granted" ? "좋아요. 접수 알림을 받을 준비가 됐어요." : "알림 허용을 켜면 접수 팝업을 받을 수 있어요.");
  });

  document.getElementById("requestPermissionButton").addEventListener("click", async () => {
    const permission = await ensureNotificationPermission();
    updatePermissionText();
    showToast(permission === "granted" ? "알림 권한이 켜졌어요." : "알림 권한이 필요해요.");
  });

  document.getElementById("batteryGuideButton").addEventListener("click", showBatteryGuide);
  document.getElementById("openBatterySettingsButton").addEventListener("click", () => {
    openAndroidSetting("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS", showBatteryGuide);
  });
  document.getElementById("openSystemNotifButton").addEventListener("click", () => {
    openAndroidSetting("android.settings.APP_NOTIFICATION_SETTINGS", showPermissionGuideFallback);
  });
  document.getElementById("batterySettingsAgainButton").addEventListener("click", closeBatteryGuide);
  document.getElementById("batteryCloseButton").addEventListener("click", closeBatteryGuide);
  document.getElementById("batteryDoneButton").addEventListener("click", closeBatteryGuide);
  document.getElementById("batteryModal").addEventListener("click", (event) => {
    if (event.target.id === "batteryModal") closeBatteryGuide();
  });

  // 포그라운드 복귀 시 알림 재계산·재예약. pageshow 는 iOS bfcache 복원까지 커버한다.
  document.addEventListener("visibilitychange", resyncOnForeground);
  window.addEventListener("pageshow", resyncOnForeground);

  document.addEventListener("keydown", (event) => {
    const modal = getOpenModal();
    if (!modal) return;
    if (event.key === "Tab") {
      trapModalFocus(event, modal);
      return;
    }
    if (event.key !== "Escape") return;
    if (modal.id === "alertModal") closeAlertModal();
    if (modal.id === "permissionModal") closePermissionGuide();
    if (modal.id === "batteryModal") closeBatteryGuide();
  });
}

function render() {
  renderDistanceFilters();
  renderRegionFilter();
  const searchInput = document.getElementById("searchInput");
  if (searchInput && document.activeElement !== searchInput) searchInput.value = state.query;
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) sortSelect.value = state.sort;
  const includeClosed = document.getElementById("includeClosedToggle");
  if (includeClosed) includeClosed.checked = state.includeClosed;
  renderCategoryTabs();
  renderRegistrationCalendar();
  renderFilterSummary();
  renderRaceList();
  renderAlerts();
  renderSyncStatus();
  renderAppInfo();
  renderPermissionEntry();
  updatePermissionText();
  setView(document.querySelector(".view.active")?.id.replace("view-", "") || "home");
}

// 백그라운드/절전에서 포그라운드로 돌아오면 알림을 다시 맞춘다.
// 이유: setTimeout 예약 알림은 탭이 오래 숨겨지거나 기기가 절전되면 브라우저가
// throttle·정지시켜 발사가 밀리거나 유실될 수 있다. 복귀 시 최신 시각 기준으로
// 만료 알림을 정리하고(reconcile) 타이머를 다시 건다(reschedule).
function resyncOnForeground() {
  if (document.visibilityState !== "visible") return;
  reconcileStoredAlerts();
  scheduleAllBrowserTimers();
  render();
}

function startTicker() {
  // 매초 타이머는 알림 모달의 카운트다운 갱신에만 쓴다.
  // (예전의 renderDetail 은 존재하지 않는 #raceDetail 을 그리던 죽은 코드라 제거했다.)
  // 전체 renderModal 을 매초 부르면 체크박스 그리드가 재생성되며
  // 사용자가 방금 바꾼 오프셋 선택이 매초 defaults 로 되돌아가므로 카운트다운만 갱신한다.
  setInterval(() => {
    if (!document.getElementById("alertModal").hidden) renderModalCountdown();
  }, 1000);
}

async function initApp() {
  if ("serviceWorker" in navigator && window.isSecureContext) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshedForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || refreshedForUpdate) return;
      refreshedForUpdate = true;
      window.location.reload();
    });
    void navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => undefined);
  }
  bindEvents();
  syncDraftFilters();
  render();
  try {
    await loadRaceData();
    state.loadStatus = "ready";
    reconcileStoredAlerts();
  } catch {
    state.races = [];
    state.loadStatus = "error";
  }
  render();
  startTicker();
  scheduleAllBrowserTimers();
}

initApp();
