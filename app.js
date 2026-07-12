const ALERT_STORAGE_KEY = "pushrun:alert-subscriptions:v3";
const SYNC_STORAGE_KEY = "pushrun:last-sync:v1";
const PERMISSION_GUIDE_KEY = "pushrun:permission-guide-seen:v1";
const APP_VERSION = "0.9.3";
const ASSET_VERSION = "20260712-11";
const DEFAULT_OFFSETS = [20, 10, 0];
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
  activeCategory: "confirmed",
  selectedCalendarDate: null,
  calendarMonth: null,
  races: [],
  dataVersion: "",
  alerts: loadJson(ALERT_STORAGE_KEY, {}),
  timers: [],
  rearmScheduled: false,
  lastFocusedElement: null,
  loadStatus: "loading",
  mobileFiltersExpanded: !window.matchMedia("(max-width: 520px)").matches
};

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
      sourceStatus: isOpen ? "접수중" : hasUpcomingOpen ? "접수 예정" : statusLabel(entry.status),
      alertCapabilities: [
        ...(hasUpcomingOpen && openTimeConfirmed ? ["registration_time"] : []),
        ...(isOpen ? ["open_now"] : []),
        "race_day"
      ],
      capacity: null,
      popularity: 50,
      sourceName: entry.sourceName || "마라톤온라인",
      note: `${entry.time} 출발. 접수기간은 마라톤온라인 상세 페이지 기준입니다.`,
      registrationLabel: entry.registrationPeriodLabel || (isOpen ? "접수중" : entry.status === "closed" ? "접수 마감" : "접수 일정 준비중")
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
    sourceStatus: isAccepting ? "접수중" : hasUpcomingOpen ? "접수 예정" : statusLabel(race.status),
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

function raceIdentity(race) {
  return `${normalizeRaceName(race.name)}|${race.raceDate.slice(0, 10)}`;
}

function normalizeRaceName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/제\d+회/g, "")
    .replace(/2026/g, "")
    .replace(/marathon|race|trail|run/g, "")
    .replace(/마라톤대회|마라톤|트레일런|트레일|레이스/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatWeekday(value) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(new Date(value));
}

function formatShortDate(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}(${formatWeekday(value)})`;
}

function formatRegistrationPoint(value) {
  const date = new Date(value);
  const isPlainDate = (date.getHours() === 0 && date.getMinutes() === 0) || (date.getHours() === 23 && date.getMinutes() === 59);
  const yearPrefix = date.getFullYear() === new Date().getFullYear() ? "" : `${String(date.getFullYear()).slice(2)}.`;
  const dateLabel = `${yearPrefix}${date.getMonth() + 1}/${date.getDate()}(${formatWeekday(value)})`;
  return isPlainDate ? dateLabel : `${dateLabel} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRegistrationDate(value) {
  const date = new Date(value);
  const yearPrefix = date.getFullYear() === new Date().getFullYear() ? "" : `${String(date.getFullYear()).slice(2)}.`;
  return `${yearPrefix}${date.getMonth() + 1}/${date.getDate()}(${formatWeekday(value)})`;
}

function hasConfirmedRegistrationOpenTime(race) {
  if (typeof race.registrationOpenTimeConfirmed === "boolean") return race.registrationOpenTimeConfirmed;
  if (!race.registrationOpenAt) return false;
  const date = new Date(race.registrationOpenAt);
  return !((date.getHours() === 0 && date.getMinutes() === 0) || (date.getHours() === 23 && date.getMinutes() === 59));
}

function formatRegistrationTime(value) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
      return `<div class="${rowClass}">${separate ? `<span>${escapeHtml(row.label)}</span>` : ""}<strong>일정 확인중</strong></div>`;
    }
    if (isAcceptingNow(race) && new Date(row.at).getTime() <= Date.now()) {
      return `<div class="${rowClass}">${separate ? `<span>${escapeHtml(row.label)}</span>` : ""}<strong>진행중</strong></div>`;
    }
    const timeLabel = row.confirmed ? formatRegistrationTime(row.at) : "시간 미확인";
    return `<div class="${rowClass}">${separate ? `<span>${escapeHtml(row.label)}</span>` : ""}<strong>${escapeHtml(formatRegistrationDate(row.at))}</strong><em>${escapeHtml(timeLabel)}</em></div>`;
  }).join("")}</div>`;
}

function formatRegistrationRange(race) {
  if (!race.registrationOpenAt) return race.registrationLabel || "접수 일정 준비중";
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

function raceSortGroup(race) {
  const now = Date.now();
  const opensAt = race.registrationOpenAt ? new Date(race.registrationOpenAt).getTime() : null;
  const closesAt = race.registrationCloseAt ? new Date(race.registrationCloseAt).getTime() : null;
  const raceAt = new Date(race.raceDate).getTime();
  if (race.status === "open" || (opensAt && closesAt && opensAt <= now && now <= closesAt)) return 0;
  if (opensAt && opensAt > now) return 1;
  if (raceAt > now) return 2;
  return 3;
}

function sortValueForGroup(race, group) {
  if (group === 0) return new Date(race.registrationCloseAt || race.raceDate).getTime();
  if (group === 1) return new Date(race.registrationOpenAt).getTime();
  if (group === 2) return new Date(race.raceDate).getTime();
  return -new Date(race.raceDate).getTime();
}

function getRaces() {
  return state.races.filter(isVisibleRace).sort((a, b) => {
    const groupA = raceSortGroup(a);
    const groupB = raceSortGroup(b);
    if (groupA !== groupB) return groupA - groupB;
    return sortValueForGroup(a, groupA) - sortValueForGroup(b, groupB);
  });
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
  return getActionRaces()
    .filter((race) => isAcceptingNow(race) && !canUseRegistrationTimer(race))
    .sort((a, b) => new Date(a.registrationCloseAt || a.raceDate).getTime() - new Date(b.registrationCloseAt || b.raceDate).getTime());
}

function getCategoryRaces() {
  return state.activeCategory === "open" ? getOpenRegistrationRaces() : getConfirmedRegistrationRaces();
}

function ticketDdayInfo(race) {
  const target = getAlertTarget(race);
  if (target?.type === "registration_open") return { label: target.ticketLabel || "접수", at: target.at };
  const upcomingAt = getUpcomingRegistrationAt(race);
  if (upcomingAt) return { label: "접수", at: new Date(upcomingAt).toISOString() };
  if (state.activeCategory === "open" && isAcceptingNow(race)) {
    return {
      label: race.registrationCloseAt ? "마감" : "접수중",
      at: race.registrationCloseAt || race.raceDate
    };
  }
  return { label: "대회", at: race.raceDate };
}

function getCategoryCopy() {
  return state.activeCategory === "open"
    ? {
        title: "현재 접수중",
        description: "",
        empty: "현재 접수중인 대회가 없어요."
      }
    : {
        title: "접수 예정",
        description: "",
        empty: "접수 예정 대회가 없어요."
      };
}

function isVisibleRace(race) {
  const now = Date.now();
  const raceAt = new Date(race.raceDate).getTime();
  return raceAt >= now && !["cancelled", "postponed"].includes(race.status);
}

function statusLabel(status) {
  return {
    scheduled: "접수 예정",
    open: "접수중",
    closed: "마감",
    sold_out: "매진",
    cancelled: "취소",
    postponed: "일정 확인",
    changed: "시간 변경"
  }[status] || "확인중";
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

function getHeroRace() {
  const primary = state.activeCategory === "open" ? getOpenRegistrationRaces() : getConfirmedRegistrationRaces();
  return primary[0] || getActionRaces()[0] || null;
}

function registrationActionAt(race) {
  if (isAcceptingNow(race)) return Date.now();
  return getUpcomingRegistrationAt(race) || new Date(race.raceDate).getTime();
}

// 캘린더에서 고른 날짜(KST)에 접수(시작 또는 마감) 일정이 있는 대회만 추린다.
function racesForSelectedDate(key) {
  return getRaces()
    .filter((race) => KST_DATE_KEY.format(new Date(race.registrationOpenAt || race.registrationCloseAt || 0)) === key)
    .sort((a, b) => registrationActionAt(a) - registrationActionAt(b));
}

function heroAlertButtonHtml(race) {
  const target = getAlertTarget(race);
  if (!target) {
    return `<button class="primary-btn" type="button" disabled aria-disabled="true">알림 준비중</button>`;
  }
  return `<button class="primary-btn" type="button" data-open-alert="${escapeHtml(race.id)}" aria-label="${escapeHtml(race.name)} 알림 설정">접수 알림 켜기</button>`;
}

// 표시 중인 달의 1일(로컬)을 돌려준다. state.calendarMonth 가 없으면 오늘이 속한 달.
function calendarMonthStart() {
  if (state.calendarMonth instanceof Date) return state.calendarMonth;
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

// 접수 시작(없으면 마감) 날짜를 KST 기준 날짜키로 집계한다.
function registrationCountByDate() {
  const counts = new Map();
  getRaces().forEach((race) => {
    const at = race.registrationOpenAt || race.registrationCloseAt;
    if (!at) return;
    const key = KST_DATE_KEY.format(new Date(at));
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

const CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function renderRegistrationCalendar() {
  const target = document.getElementById("registrationCalendar");
  if (!target) return;
  const monthStart = calendarMonthStart();
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = KST_DATE_KEY.format(new Date());
  const counts = registrationCountByDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(`<div class="calendar-cell blank" aria-hidden="true"></div>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayDate = new Date(year, month, day);
    const key = KST_DATE_KEY.format(dayDate);
    const count = counts.get(key) || 0;
    const dow = dayDate.getDay();
    const classes = ["calendar-cell"];
    if (count) classes.push("has-races");
    if (key === todayKey) classes.push("today");
    if (state.selectedCalendarDate === key) classes.push("active");
    if (dow === 0) classes.push("sun");
    if (dow === 6) classes.push("sat");
    const aria = `${month + 1}월 ${day}일${count ? `, 접수 일정 ${count}개` : ", 접수 일정 없음"}${key === todayKey ? ", 오늘" : ""}`;
    cells.push(
      `<button type="button" class="${classes.join(" ")}"${count ? ` data-calendar-date="${escapeHtml(key)}"` : " disabled"}${state.selectedCalendarDate === key ? ' aria-pressed="true"' : ""} aria-label="${aria}"><strong>${day}</strong>${count ? `<span class="cal-dot">${count}</span>` : ""}</button>`
    );
  }
  while (cells.length % 7 !== 0) {
    cells.push(`<div class="calendar-cell blank" aria-hidden="true"></div>`);
  }

  target.innerHTML = `
    <div class="calendar-head">
      <button type="button" class="calendar-nav" data-calendar-nav="prev" aria-label="이전 달">‹</button>
      <div class="calendar-title"><span>접수 캘린더</span><h2>${year}년 ${month + 1}월</h2></div>
      <button type="button" class="calendar-nav" data-calendar-nav="next" aria-label="다음 달">›</button>
    </div>
    <div class="calendar-weekdays">${CALENDAR_WEEKDAYS.map((label, index) => `<span class="${index === 0 ? "sun" : index === 6 ? "sat" : ""}">${label}</span>`).join("")}</div>
    <div class="calendar-grid">${cells.join("")}</div>`;
}

function renderHomeHero() {
  const target = document.getElementById("homeHero");
  if (!target) return;
  target.setAttribute("aria-busy", String(state.loadStatus === "loading"));
  if (state.loadStatus === "loading") {
    target.innerHTML = `<div class="hero-loading" role="status">가장 가까운 접수 일정을 찾고 있어요.</div>`;
    return;
  }
  if (state.loadStatus === "error") {
    target.innerHTML = `<div class="hero-loading" role="alert">대회 정보를 불러오지 못했어요.</div>`;
    return;
  }
  const race = getHeroRace();
  if (!race) {
    target.innerHTML = `<div class="hero-loading">예정된 대회를 확인하고 있어요.</div>`;
    return;
  }
  const ticket = ticketDdayInfo(race);
  const targetAt = ticket.at ? new Date(ticket.at) : null;
  const timeConfirmed = race.registrationOpenAt && hasConfirmedRegistrationOpenTime(race);
  const status = isAcceptingNow(race) ? "현재 접수중" : "접수 예정";
  const dday = formatDday(ticket.at, "일정 확인");
  const distance = courseTokens(race).slice(0, 2).join(" · ") || "종목 확인";
  const openTime = isAcceptingNow(race)
    ? "지금"
    : timeConfirmed && targetAt
      ? formatRegistrationTime(targetAt)
      : "시간 미확정";
  target.className = `hero-race ${isAcceptingNow(race) ? "open" : "scheduled"}`;
  target.innerHTML = `
    <div class="hero-accent" aria-hidden="true"></div>
    <div class="hero-topline">
      <span class="hero-status">${escapeHtml(status)} · ${escapeHtml(dday)}</span>
      <span class="hero-date">${escapeHtml(formatShortDate(race.raceDate))} 대회</span>
    </div>
    <h1>${escapeHtml(race.name)}</h1>
    <p class="hero-location">${escapeHtml(distance)} · ${escapeHtml(race.region)} ${escapeHtml(race.city)}</p>
    <div class="hero-metrics" aria-label="핵심 접수 정보">
      <div><strong>${escapeHtml(dday)}</strong><span>${isAcceptingNow(race) ? "접수 마감" : "접수까지"}</span></div>
      <div><strong>${escapeHtml(distance)}</strong><span>관심 거리</span></div>
      <div><strong>${escapeHtml(openTime)}</strong><span>오픈 시각</span></div>
    </div>
    <div class="hero-actions">
      ${registrationButtonHtml(race, "detail")}
      ${heroAlertButtonHtml(race)}
    </div>
    ${subscriptionsForRace(race.id).length ? `<p class="hero-enabled">알림 ${subscriptionsForRace(race.id).length}개가 켜져 있어요.</p>` : ""}
  `;
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
  const targetAt = new Date(target.at);
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
            : `${pad(targetAt.getHours())}:${pad(targetAt.getMinutes())} ${target.label}. 로그인과 결제 정보를 준비하세요.`;
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
    return `<button class="${classes}" type="button" disabled aria-disabled="true" aria-label="${raceName} 접수 사이트 준비중">준비중</button>`;
  }
  const insecure = /^http:\/\//i.test(race.registrationUrl);
  const buttonText = variant === "detail" ? "접수 페이지 보기" : "접수";
  // 목록 버튼은 좁은 폰 화면에서 넘치지 않도록 짧게, 히어로 CTA는 목적을 분명히 쓴다.
  // HTTP 경고는 화면 폭을 차지하지 않는 툴팁/보조 라벨로만 유지한다.
  const warning = insecure
    ? ` title="보안 연결(HTTPS)을 지원하지 않는 외부 사이트입니다" aria-label="${raceName} 접수 사이트 새 창으로 열기, HTTP 연결 주의"`
    : ` aria-label="${raceName} 접수 사이트 새 창으로 열기"`;
  return `<a class="${classes}" href="${escapeHtml(race.registrationUrl)}" target="_blank" rel="noopener noreferrer"${warning}>${buttonText}</a>`;
}

function alertButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "primary-btn" : "mini-btn strong action-alert";
  const target = getAlertTarget(race);
  const label = `${escapeHtml(race.name)} 알림 설정`;
  if (!target) {
    return `<button class="${classes}" type="button" disabled aria-disabled="true" aria-label="${label} 불가">알림</button>`;
  }
  return `<button class="${classes}" type="button" data-open-alert="${escapeHtml(race.id)}" aria-label="${label}">알림</button>`;
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
      const active = state.draftDistanceFilter === value;
      return `<button class="filter-chip ${active ? "active" : ""}" type="button" data-distance-filter="${value}" aria-pressed="${active}">${label}</button>`;
    })
    .join("");
}

function renderRegionFilter() {
  const select = document.getElementById("regionFilter");
  const regions = [...new Set(getRaces().map((race) => race.region))].sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = `<option value="all">전체 지역</option>${regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("")}`;
  select.value = state.draftRegionFilter;
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
    button.textContent = expanded ? "대회 찾기 닫기" : `대회 찾기 · ${mobileFilterSummary()}`;
  }
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
  if (window.matchMedia("(max-width: 520px)").matches) setMobileFiltersExpanded(false);
  renderRaceList();
  renderCategoryTabs();
  renderRegistrationCalendar();
  renderHomeHero();
  showToast("선택한 조건으로 대회를 찾았어요.");
}

function renderRaceList() {
  const list = document.getElementById("raceList");
  list.setAttribute("aria-busy", String(state.loadStatus === "loading"));
  if (state.loadStatus === "loading") {
    list.innerHTML = `<div class="focus-empty" role="status"><h3>대회 정보를 불러오는 중이에요.</h3><p>잠시만 기다려주세요.</p></div>`;
    return;
  }
  if (state.loadStatus === "error") {
    list.innerHTML = `<div class="focus-empty" role="alert"><h3>대회 정보를 불러오지 못했어요.</h3><p>네트워크를 확인한 뒤 다시 시도해주세요.</p><button class="primary-btn" type="button" id="retryRaceDataButton">다시 불러오기</button></div>`;
    return;
  }
  const dateKey = state.selectedCalendarDate;
  const races = dateKey ? racesForSelectedDate(dateKey) : getCategoryRaces();
  const copy = getCategoryCopy();
  let head;
  if (dateKey) {
    const [, month, dayNum] = dateKey.split("-").map(Number);
    head = `<div class="all-results-head"><div><span class="section-kicker">접수 캘린더</span><h2 id="allResultsTitle">${month}월 ${dayNum}일 접수 일정</h2></div><button class="text-btn calendar-filter-clear" type="button" data-clear-calendar-date>전체 보기</button></div>`;
  } else {
    head = `<div class="all-results-head"><div><span class="section-kicker">전체 대회</span><h2 id="allResultsTitle">${escapeHtml(copy.title)}</h2></div><strong>${races.length}개</strong></div>`;
  }
  if (!races.length) {
    const empty = dateKey
      ? `<div class="focus-empty"><h3>이 날짜에는 접수 일정이 없어요.</h3><button class="text-btn calendar-filter-clear" type="button" data-clear-calendar-date>전체 보기</button></div>`
      : `<div class="focus-empty"><h3>${escapeHtml(copy.empty)}</h3><p>검색어를 지우거나 거리·지역 필터를 전체로 바꿔보세요.</p></div>`;
    list.innerHTML = `<section class="focus-board ${state.activeCategory}">${head}${empty}</section>`;
    return;
  }
  list.innerHTML = `
    <section class="focus-board ${state.activeCategory}" aria-labelledby="allResultsTitle">
      ${head}
      <div class="race-list-list">
        ${races.map(raceCardHtml).join("")}
      </div>
    </section>
  `;
}

function raceCardHtml(race) {
  const selected = state.selectedRaceId === race.id ? " selected" : "";
  const enabled = subscriptionsForRace(race.id).length > 0;
  const ticketInfo = ticketDdayInfo(race);
  const safeId = escapeHtml(race.id);
  const ticketDday = formatDday(ticketInfo.at);
  return `
    <article class="race-card list-card${selected}" data-race-id="${safeId}">
      <div class="list-card-grid">
        <div class="list-date">
          <span>${escapeHtml(ticketInfo.label)}</span>
          ${ticketDday ? `<strong>${escapeHtml(ticketDday)}</strong>` : ""}
        </div>
        <div class="list-body">
          <h3>${escapeHtml(race.name)}</h3>
          <p class="race-location">${escapeHtml(race.region)} · ${escapeHtml(race.city)}</p>
          ${courseChipsHtml(race)}
          <div class="registration-strip">
            <div class="registration-schedule-row">
              <span class="registration-label">접수</span>
              ${registrationScheduleHtml(race)}
            </div>
            <div class="race-schedule-row">
              <span class="registration-label">대회</span>
              <strong>${escapeHtml(formatRegistrationDate(race.raceDate))}</strong>
            </div>
          </div>
        </div>
        <div class="list-action-wrap">
          ${registrationButtonHtml(race)}
          ${alertButtonHtml(race)}
        </div>
      </div>
      ${enabled ? `<p class="focus-enabled">종목 알림 ${subscriptionsForRace(race.id).length}개가 켜져 있어요.</p>` : ""}
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
  const dataVersion = document.getElementById("dataVersionText");
  if (appVersion) appVersion.textContent = APP_VERSION;
  if (dataVersion) dataVersion.textContent = state.dataVersion || "확인 전";
  const subjectBase = `러닝봄 ${APP_VERSION}`;
  const general = document.getElementById("generalInquiryLink");
  const ad = document.getElementById("adInquiryLink");
  if (general) general.href = `mailto:hello.robom@gmail.com?subject=${encodeURIComponent(`[${subjectBase}] 일반 문의`)}`;
  if (ad) ad.href = `mailto:hello.robom@gmail.com?subject=${encodeURIComponent(`[${subjectBase}] 광고·제휴 문의`)}`;
}

function renderCategoryTabs() {
  const target = document.getElementById("categoryTabs");
  if (!target) return;
  target.innerHTML = [
    ["confirmed", "접수 예정", getConfirmedRegistrationRaces().length],
    ["open", "현재 접수중", getOpenRegistrationRaces().length]
  ]
    .map(([value, label, count]) => {
      const active = state.activeCategory === value;
      return `
      <button class="category-tab ${active ? "active" : ""}" type="button" data-category="${value}" aria-pressed="${active}">
        <span>${escapeHtml(label)} <b>${count}</b></span>
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
      icon: "./icon.svg",
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
      renderCategoryTabs();
      renderRegistrationCalendar();
      renderRaceList();
      renderHomeHero();
      document.querySelector(`[data-category="${category}"]`)?.focus();
    });
  }

  document.addEventListener("click", (event) => {
    const retryButton = event.target.closest("#retryRaceDataButton");
    if (retryButton) {
      void refreshRaceData();
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
      render();
      document.querySelector(".content-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const navButton = event.target.closest("[data-calendar-nav]");
    if (navButton) {
      const base = calendarMonthStart();
      const step = navButton.dataset.calendarNav === "next" ? 1 : -1;
      state.calendarMonth = new Date(base.getFullYear(), base.getMonth() + step, 1);
      renderRegistrationCalendar();
      return;
    }

    const dayButton = event.target.closest("[data-calendar-date]");
    if (dayButton) {
      const key = dayButton.dataset.calendarDate;
      state.selectedCalendarDate = state.selectedCalendarDate === key ? null : key;
      render();
      document.querySelector(".content-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const raceCard = event.target.closest("[data-race-id]");
    if (raceCard) {
      // 접수·알림 버튼/링크 클릭은 카드 선택으로 전파하지 않아 전체 재렌더 깜빡임을 막는다.
      const interactive = event.target.closest("a, button");
      if (interactive && interactive !== raceCard) return;
      selectRace(raceCard.dataset.raceId);
      return;
    }

    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      setView(viewButton.dataset.view);
    }
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.draftQuery = event.target.value;
  });

  // Enter 키로 "확인" 버튼과 동일하게 필터를 즉시 적용한다. 기존 applyFilters 재사용.
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyFilters();
  });

  document.addEventListener("click", (event) => {
    const distanceButton = event.target.closest("[data-distance-filter]");
    if (distanceButton) {
      const distance = distanceButton.dataset.distanceFilter;
      state.draftDistanceFilter = distance;
      state.distanceFilter = state.draftDistanceFilter;
      state.selectedRaceId = null;
      renderDistanceFilters();
      renderRaceList();
      renderCategoryTabs();
      renderHomeHero();
      document.querySelector(`[data-distance-filter="${distance}"]`)?.focus();
    }
  });

  document.getElementById("regionFilter").addEventListener("change", (event) => {
    state.draftRegionFilter = event.target.value;
  });

  document.getElementById("applyFiltersButton").addEventListener("click", applyFilters);
  document.getElementById("mobileFilterToggleButton").addEventListener("click", () => {
    setMobileFiltersExpanded(!state.mobileFiltersExpanded);
  });
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
    const selectedOffsets = getSelectedModalOffsets();
    renderModal();
    if (selectedOffsets.length) {
      document.querySelectorAll("#modalPresetGrid input").forEach((input) => {
        input.checked = selectedOffsets.includes(Number(input.value));
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
  document.getElementById("openBatterySettingsButton").addEventListener("click", showBatteryGuide);
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
  if (searchInput) searchInput.value = state.draftQuery;
  renderCategoryTabs();
  renderRegistrationCalendar();
  renderHomeHero();
  renderRaceList();
  renderAlerts();
  renderSyncStatus();
  renderAppInfo();
  renderPermissionEntry();
  updatePermissionText();
  setMobileFiltersExpanded(state.mobileFiltersExpanded);
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
    void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
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
