const ALERT_STORAGE_KEY = "pushrun:alert-subscriptions:v3";
const SYNC_STORAGE_KEY = "pushrun:last-sync:v1";
const PERMISSION_GUIDE_KEY = "pushrun:permission-guide-seen:v1";
const APP_VERSION = "0.6.9";
const ASSET_VERSION = "20260711-1";
const DEFAULT_OFFSETS = [20, 10, 0];
const SOON_DAYS = 14;
const RACE_DATA_URL = `./races.json?v=${ASSET_VERSION}`;
const MARATHON_ONLINE_LIST_URL = "http://www.roadrun.co.kr/schedule/list.php";

const state = {
  selectedRaceId: null,
  modalRaceId: null,
  distanceFilter: "all",
  regionFilter: "all",
  query: "",
  draftDistanceFilter: "all",
  draftRegionFilter: "all",
  draftQuery: "",
  activeCategory: "confirmed",
  races: [],
  dataVersion: "",
  alerts: loadJson(ALERT_STORAGE_KEY, {}),
  timers: [],
  rearmScheduled: false,
  lastFocusedElement: null
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
  localStorage.setItem(key, JSON.stringify(value));
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
    const isOpen = entry.status === "open" || Boolean(opensAt && opensAt <= now && (!closesAt || now <= closesAt));
    const hasUpcomingOpen = Boolean(opensAt && opensAt > now);
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
        ...(hasUpcomingOpen ? ["registration_time"] : []),
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
  const isAccepting = race.status === "open" || (opensAt && opensAt <= now && (!closesAt || now <= closesAt));
  const hasUpcomingOpen = opensAt && opensAt > now && !["closed", "sold_out", "cancelled"].includes(race.status);
  return {
    ...race,
    courseLabel: race.courseLabel || (Array.isArray(race.distances) ? race.distances : []).join(","),
    registrationStatus: isAccepting ? "open" : hasUpcomingOpen ? "scheduled" : race.status || "unknown",
    sourceStatus: isAccepting ? "접수중" : hasUpcomingOpen ? "접수 예정" : statusLabel(race.status),
    alertCapabilities: [
      ...(hasUpcomingOpen ? ["registration_time"] : []),
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

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(value));
}

function formatWeekday(value) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(new Date(value));
}

function formatShortDateTime(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}(${formatWeekday(value)}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatRegistrationRange(race) {
  if (!race.registrationOpenAt) return race.registrationLabel || "접수 일정 준비중";
  if (race.registrationPeriodLabel) return race.registrationPeriodLabel;
  if (!race.registrationCloseAt) return formatRegistrationPoint(race.registrationOpenAt);
  return `${formatRegistrationPoint(race.registrationOpenAt)} - ${formatRegistrationPoint(race.registrationCloseAt)}`;
}

function formatDday(value, fallback = "일정 대기") {
  if (!value) return fallback;
  const target = new Date(value);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((target - today) / 86400000);
  if (days === 0) return "D-Day";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
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
  return race.alertCapabilities?.includes("registration_time") && new Date(race.registrationOpenAt).getTime() > Date.now();
}

// 알림 대상 계산은 순수 로직이라 alerts-core.js 로 옮겼다 (Node 테스트 공유).
function getAlertTarget(race) {
  return window.PushRunAlertsCore.getAlertTarget(race, Date.now());
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
    .filter((race) => canUseRegistrationTimer(race))
    .sort((a, b) => new Date(a.registrationOpenAt).getTime() - new Date(b.registrationOpenAt).getTime());
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
  if (state.activeCategory === "open" && isAcceptingNow(race)) {
    return {
      label: race.registrationCloseAt ? "마감" : "접수중",
      at: race.registrationCloseAt || race.raceDate
    };
  }
  const target = getAlertTarget(race);
  if (target?.type === "registration_open") return { label: "접수", at: target.at };
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
        empty: "접수 시간이 확정된 대회가 없어요."
      };
}

function isVisibleRace(race) {
  const now = Date.now();
  const raceAt = new Date(race.raceDate).getTime();
  return raceAt >= now && !["cancelled", "postponed"].includes(race.status);
}

function isWithinDays(value, days) {
  const diff = new Date(value).getTime() - Date.now();
  return diff > 0 && diff <= days * 24 * 60 * 60 * 1000;
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

function displayStatusLabel(race) {
  if (canUseRegistrationTimer(race)) return "접수 예정";
  if (isAcceptingNow(race)) return "현재 접수중";
  if (race.registrationStatus === "closed" || race.status === "closed") return "접수 마감";
  return "확인중";
}

function registrationActionText(race) {
  if (canUseRegistrationTimer(race)) return `접수 시작 ${formatDday(race.registrationOpenAt)}`;
  if (isAcceptingNow(race)) return race.registrationCloseAt ? `접수 마감 ${formatDday(race.registrationCloseAt)}` : "현재 접수중";
  return displayStatusLabel(race);
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

function buildRegistrationAlerts(race, offsets = DEFAULT_OFFSETS) {
  const target = getAlertTarget(race);
  if (!target) return [];
  const targetAt = new Date(target.at);
  // 발사 시각 계산·만료 필터는 alerts-core.js 의 순수 함수를 쓰고, 문구만 여기서 채운다.
  return window.PushRunAlertsCore
    .computeFireTimes(target.at, offsets, Date.now())
    .map(({ offset, fireAt }) => {
      const when = offset === 0 ? "정각" : `${offset}분 전`;
      let title = `[${race.name}] ${target.label} ${when}`;
      let body = `${formatRegistrationPoint(target.at)} ${target.label} 예정입니다.`;

      if (target.type === "registration_open") {
        title = offset === 0 ? `[${race.name}] 접수 시작!` : `[${race.name}] 접수 시작 ${offset}분 전`;
        body =
          offset === 0
            ? "지금 접수가 열렸어요. 대회 사이트에서 바로 확인하세요."
            : `${pad(targetAt.getHours())}:${pad(targetAt.getMinutes())} 접수 시작. 로그인과 결제 정보를 준비하세요.`;
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

function nextRace() {
  return getRaces().find((race) => race.registrationOpenAt && new Date(race.registrationOpenAt).getTime() > Date.now() && race.status !== "cancelled");
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
  if (!race || !canUseAlert(race)) {
    showToast("지금은 알림을 켤 시간이 없어요. 대회 사이트에서 확인해 주세요.");
    return;
  }
  state.modalRaceId = raceId;
  renderModal();
  openModal("alertModal");
}

function closeAlertModal() {
  closeModal("alertModal");
}

function openPermissionGuide() {
  openModal("permissionModal");
}

function closePermissionGuide() {
  closeModal("permissionModal");
  localStorage.setItem(PERMISSION_GUIDE_KEY, "seen");
  renderPermissionEntry();
}

function renderPermissionEntry() {
  const strip = document.getElementById("permissionEntry");
  if (strip) strip.hidden = localStorage.getItem(PERMISSION_GUIDE_KEY) === "seen";
}

function registrationButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "ghost-btn" : "mini-btn action-site";
  if (!race.registrationUrl) {
    return `<button class="${classes}" type="button" disabled aria-disabled="true">준비중</button>`;
  }
  const insecure = /^http:\/\//i.test(race.registrationUrl);
  const warning = insecure
    ? ' title="보안 연결을 지원하지 않는 외부 사이트입니다" aria-label="접수 사이트 열기, HTTP 연결 주의"'
    : "";
  return `<a class="${classes}" href="${escapeHtml(race.registrationUrl)}" target="_blank" rel="noopener noreferrer"${warning}>접수${insecure ? " · HTTP" : ""}</a>`;
}

function alertButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "primary-btn" : "mini-btn strong action-alert";
  const target = getAlertTarget(race);
  if (!target) {
    return `<button class="${classes}" type="button" disabled aria-disabled="true">알림</button>`;
  }
  return `<button class="${classes}" type="button" data-open-alert="${escapeHtml(race.id)}">알림</button>`;
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
    .map(([value, label]) => `<button class="filter-chip ${state.draftDistanceFilter === value ? "active" : ""}" type="button" data-distance-filter="${value}">${label}</button>`)
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

function applyFilters() {
  const searchInput = document.getElementById("searchInput");
  const regionSelect = document.getElementById("regionFilter");
  if (searchInput) state.draftQuery = searchInput.value;
  if (regionSelect) state.draftRegionFilter = regionSelect.value;
  state.distanceFilter = state.draftDistanceFilter;
  state.regionFilter = state.draftRegionFilter;
  state.query = state.draftQuery;
  state.selectedRaceId = null;
  renderRaceList();
  renderCategoryTabs();
  showToast("선택한 조건으로 대회를 찾았어요.");
}

function renderRaceList() {
  const list = document.getElementById("raceList");
  const races = getCategoryRaces();
  const copy = getCategoryCopy();
  if (!races.length) {
    list.innerHTML = `<div class="focus-empty"><h3>${copy.empty}</h3><p>검색어를 지우거나 거리·지역 필터를 전체로 바꿔보세요.</p></div>`;
    return;
  }
  list.innerHTML = `
    <section class="focus-board ${state.activeCategory}">
      <div class="race-list-list">
        ${races.map(raceCardHtml).join("")}
      </div>
    </section>
  `;
}

function raceCardHtml(race) {
  const selected = state.selectedRaceId === race.id ? " selected" : "";
  const enabled = state.alerts[race.id]?.enabled;
  const ticketInfo = ticketDdayInfo(race);
  const safeId = escapeHtml(race.id);
  const startLabel = race.registrationOpenAt ? formatRegistrationPoint(race.registrationOpenAt) : "확인중";
  const raceDateLabel = formatShortDate(race.raceDate);
  const ticketDday = formatDday(ticketInfo.at);
  const actionButtons = `<div class="list-action-row ticket-actions">${registrationButtonHtml(race)}${alertButtonHtml(race)}</div>`;
  return `
    <article class="race-card list-card${selected}" data-race-id="${safeId}">
      <div class="list-card-grid">
        <div class="list-date">
          <span>${escapeHtml(ticketInfo.label)}</span>
          <strong>${escapeHtml(ticketDday)}</strong>
        </div>
        <div class="list-body">
          <div class="list-title-row">
            <h3>${escapeHtml(race.name)}</h3>
          </div>
          <p class="race-location">${escapeHtml(race.region)} · ${escapeHtml(race.city)}</p>
          ${courseChipsHtml(race)}
        </div>
        <div class="registration-strip">
          <div>
            <span>접수</span>
            <strong>${escapeHtml(startLabel)}</strong>
          </div>
          <div>
            <span>대회</span>
            <strong>${escapeHtml(raceDateLabel)}</strong>
          </div>
        </div>
        <div class="list-action-wrap">
          ${actionButtons}
        </div>
      </div>
      ${enabled ? `<p class="focus-enabled">알림이 켜져 있어요.</p>` : ""}
    </article>
  `;
}

// 매초 갱신되는 시간 부분(카운트다운)만 따로 그린다. 체크박스 그리드는 건드리지 않는다.
function renderModalCountdown() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  const target = getAlertTarget(race);
  if (!target) return;
  document.getElementById("modalCountdown").innerHTML = `
    <span>${escapeHtml(target.label)}</span>
    <strong>${escapeHtml(formatDday(target.at))}</strong>
    <small>${escapeHtml(formatDateTime(target.at))}</small>
  `;
}

function renderModal() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  const target = getAlertTarget(race);
  if (!target) return;
  const subscription = state.alerts[race.id];
  const selectedOffsets = subscription?.offsets || DEFAULT_OFFSETS;
  document.getElementById("modalRaceName").textContent = race.name;
  document.getElementById("modalRaceMeta").textContent = `${target.label} ${formatDateTime(target.at)} · ${race.region} ${race.city}`;
  renderModalCountdown();
  document.getElementById("modalPresetGrid").innerHTML = DEFAULT_OFFSETS.map(
    (offset) => `
      <label>
        <input type="checkbox" value="${offset}" ${selectedOffsets.includes(offset) ? "checked" : ""} />
        <span>${offset === 0 ? "정각" : `${offset}분 전`}</span>
      </label>
    `
  ).join("");
  const activeLabels = selectedOffsets.map((offset) => offset === 0 ? "정각" : `${offset}분 전`).join(", ");
  document.getElementById("modalAlertHint").textContent = `${activeLabels}에 접수 시간을 알려드려요.`;
  document.getElementById("modalCancelAlertButton").hidden = !subscription?.enabled;
}

function renderAlerts() {
  const list = document.getElementById("alertList");
  const racesById = Object.fromEntries(getRaces().map((race) => [race.id, race]));
  const active = Object.values(state.alerts).filter((alert) => alert.enabled && alert.targetType !== "registration_close");
  if (!active.length) {
    list.innerHTML = `<div class="alert-card"><h3>켜진 알림이 없어요.</h3><p class="meta-line">대회 카드의 알림 설정을 눌러 추가하세요.</p></div>`;
    return;
  }
  list.innerHTML = active
    .map((subscription) => {
      const race = racesById[subscription.raceId];
      if (!race) return "";
      const targetLabel = subscription.targetLabel || "접수 시작";
      const targetAt = subscription.targetAt || race.registrationOpenAt || race.raceDate;
      const visibleOffsets = (subscription.scheduledAlerts?.length
        ? subscription.scheduledAlerts.map((alert) => alert.offset)
        : subscription.offsets
      ).sort((a, b) => b - a);
      return `
        <div class="alert-card">
          <div class="alert-head">
            <div>
              <h3>${escapeHtml(race.name)}</h3>
              <p class="meta-line">${escapeHtml(targetLabel)} ${escapeHtml(formatDateTime(targetAt))}</p>
            </div>
            <span class="status-pill scheduled">${escapeHtml(targetLabel)} 알림</span>
          </div>
          <div class="chips">
            ${visibleOffsets.map((offset) => `<span class="chip highlight">${offset === 0 ? "정각" : `${offset}분 전`}</span>`).join("")}
          </div>
          <div class="detail-actions" style="margin-top:14px">
            <button class="ghost-btn" type="button" data-focus-race="${escapeHtml(race.id)}">상세</button>
            <button class="danger-btn" type="button" data-cancel-race="${escapeHtml(race.id)}">알림 끄기</button>
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

function renderCategoryTabs() {
  const target = document.getElementById("categoryTabs");
  if (!target) return;
  target.innerHTML = [
    ["confirmed", "접수 예정"],
    ["open", "현재 접수중"]
  ]
    .map(([value, label]) => `
      <button class="category-tab ${state.activeCategory === value ? "active" : ""}" type="button" data-category="${value}">
        <span>${escapeHtml(label)}</span>
      </button>
    `)
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
      tag: `${alert.raceId}-${alert.targetType || "alert"}-${alert.offset}`,
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
    buildScheduledAlerts: (race, offsets) => buildRegistrationAlerts(race, offsets)
  });
  state.alerts = result.alerts;
  if (result.updated.length || result.dropped.length || result.expired.length) {
    saveJson(ALERT_STORAGE_KEY, state.alerts);
  }
}

async function enableAlertFromModal() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  const target = getAlertTarget(race);
  if (!target) {
    showToast("지금은 알림을 켤 시간이 없어요.");
    return;
  }
  if (race.status === "cancelled") {
    showToast("취소된 대회는 알림을 켤 수 없어요.");
    return;
  }
  const offsets = getSelectedModalOffsets();
  if (!offsets.length) {
    showToast("알림 시간을 하나 이상 선택하세요.");
    return;
  }
  const permission = await ensureNotificationPermission();
  const scheduledAlerts = buildRegistrationAlerts(race, offsets);
  if (!scheduledAlerts.length) {
    showToast("지금은 알림을 켤 시간이 없어요.");
    return;
  }
  state.alerts[race.id] = {
    enabled: true,
    raceId: race.id,
    targetType: target.type,
    targetAt: target.at,
    targetLabel: target.label,
    offsets,
    scheduledAlerts,
    createdAt: new Date().toISOString()
  };
  saveJson(ALERT_STORAGE_KEY, state.alerts);
  scheduleAllBrowserTimers();
  render();
  renderModal();
  showToast(permission === "granted" ? "알림을 켰어요." : "알림은 저장했지만 브라우저 권한이 꺼져 있어요.");
}

function cancelAlert(raceId) {
  if (state.alerts[raceId]) {
    delete state.alerts[raceId];
    saveJson(ALERT_STORAGE_KEY, state.alerts);
    scheduleAllBrowserTimers();
    render();
    if (state.modalRaceId === raceId) renderModal();
    showToast("알림을 껐어요.");
  }
}

async function refreshRaceData() {
  try {
    await loadRaceData();
    localStorage.setItem(SYNC_STORAGE_KEY, new Date().toISOString());
    reconcileStoredAlerts();
    scheduleAllBrowserTimers();
    state.selectedRaceId = null;
    render();
    showToast("최신 대회 데이터를 다시 불러왔어요.");
  } catch {
    showToast("대회 데이터를 다시 불러오지 못했어요.");
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
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  renderAlerts();
  renderSyncStatus();
}

function bindEvents() {
  const categoryTabs = document.getElementById("categoryTabs");
  if (categoryTabs) {
    categoryTabs.addEventListener("click", (event) => {
      const categoryButton = event.target.closest("[data-category]");
      if (!categoryButton) return;
      state.activeCategory = categoryButton.dataset.category;
      state.selectedRaceId = null;
      renderCategoryTabs();
      renderRaceList();
    });
  }

  document.addEventListener("click", (event) => {
    const alertButton = event.target.closest("[data-open-alert]");
    if (alertButton) {
      openAlertModal(alertButton.dataset.openAlert);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-race]");
    if (cancelButton) {
      cancelAlert(cancelButton.dataset.cancelRace);
      return;
    }

    const focusButton = event.target.closest("[data-focus-race]");
    if (focusButton) {
      setView("home");
      selectRace(focusButton.dataset.focusRace);
      return;
    }

    const raceCard = event.target.closest("[data-race-id]");
    if (raceCard) {
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

  document.addEventListener("click", (event) => {
    const distanceButton = event.target.closest("[data-distance-filter]");
    if (distanceButton) {
      state.draftDistanceFilter = distanceButton.dataset.distanceFilter;
      state.distanceFilter = state.draftDistanceFilter;
      state.selectedRaceId = null;
      renderDistanceFilters();
      renderRaceList();
      renderCategoryTabs();
    }
  });

  document.getElementById("regionFilter").addEventListener("change", (event) => {
    state.draftRegionFilter = event.target.value;
  });

  document.getElementById("applyFiltersButton").addEventListener("click", applyFilters);
  document.getElementById("syncButton").addEventListener("click", refreshRaceData);
  const permissionEntryButton = document.getElementById("openPermissionGuideButton");
  if (permissionEntryButton) permissionEntryButton.addEventListener("click", openPermissionGuide);

  document.getElementById("modalCloseButton").addEventListener("click", closeAlertModal);
  document.getElementById("alertModal").addEventListener("click", (event) => {
    if (event.target.id === "alertModal") closeAlertModal();
  });
  document.getElementById("modalSaveButton").addEventListener("click", enableAlertFromModal);
  document.getElementById("modalCancelAlertButton").addEventListener("click", () => cancelAlert(state.modalRaceId));

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
  renderRaceList();
  renderAlerts();
  renderSyncStatus();
  renderPermissionEntry();
  updatePermissionText();
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
  try {
    await loadRaceData();
    reconcileStoredAlerts();
  } catch {
    state.races = [];
  }
  render();
  if (!state.races.length) showToast("대회 데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.");
  startTicker();
  scheduleAllBrowserTimers();
}

initApp();
