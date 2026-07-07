const ALERT_STORAGE_KEY = "pushrun:alert-subscriptions:v3";
const SYNC_STORAGE_KEY = "pushrun:last-sync:v1";
const PERMISSION_GUIDE_KEY = "pushrun:permission-guide-seen:v1";
const DEFAULT_OFFSETS = [20, 10, 0];
const SOON_DAYS = 14;
const RACE_DATA_URL = "./races.json?v=20260707-2";

const state = {
  selectedRaceId: null,
  modalRaceId: null,
  distanceFilter: "all",
  regionFilter: "all",
  query: "",
  draftDistanceFilter: "all",
  draftRegionFilter: "all",
  draftQuery: "",
  races: [],
  dataVersion: "",
  alerts: loadJson(ALERT_STORAGE_KEY, {}),
  timers: []
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
  state.races = mergeRaces(data.featuredRaces || [], parseScheduleFeed(data.scheduleFeed || []));
  state.dataVersion = data.version || "";
}

function parseScheduleFeed(feed) {
  return feed.map((entry, index) => {
    return {
      id: `schedule-${index}-${entry.date}`,
      name: entry.name,
      region: entry.region,
      city: entry.venue.split(" ")[0] || entry.region,
      venue: entry.venue,
      raceDate: `${entry.date}T${normalizeRaceTime(entry.time)}+09:00`,
      registrationOpenAt: null,
      registrationCloseAt: null,
      registrationUrl: null,
      distances: entry.distances,
      status: entry.status,
      capacity: null,
      popularity: 50,
      sourceName: "마라톤GO · 마라톤온라인 참고",
      note: `${entry.time} 예정. 대회 페이지가 열리면 바로 알려드릴게요.`,
      registrationLabel: entry.status === "open" ? "접수중" : entry.status === "closed" ? "접수 마감" : "접수 일정 준비중"
    };
  });
}

function normalizeRaceTime(value) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${pad(Number(match[1]))}:${match[2]}:00`;
  const hourMatch = value.match(/(\d{1,2})시/);
  if (hourMatch) return `${pad(Number(hourMatch[1]))}:00:00`;
  return "09:00:00";
}

function mergeRaces(primary, secondary) {
  const seen = new Set(primary.map((race) => `${race.name}|${race.raceDate.slice(0, 10)}`));
  return [
    ...primary,
    ...secondary.filter((race) => {
      const key = `${race.name}|${race.raceDate.slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  ];
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

function formatRegistrationRange(race) {
  if (!race.registrationOpenAt) return race.registrationLabel || "접수 일정 준비중";
  if (!race.registrationCloseAt) return formatShortDateTime(race.registrationOpenAt);
  return `${formatShortDateTime(race.registrationOpenAt)} - ${formatShortDateTime(race.registrationCloseAt)}`;
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
    const searchable = `${race.name} ${race.region} ${race.city} ${race.distances.join(" ")}`.toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (state.regionFilter !== "all" && race.region !== state.regionFilter) return false;
    if (!distanceMatches(race, state.distanceFilter)) return false;
    return true;
  });
}

function buildRegistrationAlerts(race, offsets = DEFAULT_OFFSETS) {
  if (!race.registrationOpenAt || race.status === "closed") return [];
  const openAt = new Date(race.registrationOpenAt);
  return offsets
    .map((offset) => {
      const fireAt = new Date(openAt.getTime() - offset * 60 * 1000);
      const title = offset === 0 ? `[${race.name}] 접수 시작!` : `[${race.name}] 접수 ${offset}분 전`;
      const body =
        offset === 0
          ? "지금 신청이 열리는 시간이에요. PushRun에서 접수 상태를 확인하세요."
          : `${pad(openAt.getHours())}:${pad(openAt.getMinutes())} 접수 시작. 로그인/결제 정보를 준비하세요.`;
      return { offset, fireAt: fireAt.toISOString(), title, body, raceId: race.id };
    })
    .filter((alert) => new Date(alert.fireAt).getTime() > Date.now());
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

function openAlertModal(raceId) {
  const race = getRaces().find((item) => item.id === raceId);
  if (!race?.registrationOpenAt || race.status === "closed") {
    showToast("접수 시간이 열리면 알림을 설정할 수 있어요.");
    return;
  }
  state.modalRaceId = raceId;
  renderModal();
  document.getElementById("alertModal").hidden = false;
}

function closeAlertModal() {
  document.getElementById("alertModal").hidden = true;
}

function openPermissionGuide() {
  document.getElementById("permissionModal").hidden = false;
}

function closePermissionGuide() {
  document.getElementById("permissionModal").hidden = true;
  localStorage.setItem(PERMISSION_GUIDE_KEY, "seen");
  renderPermissionEntry();
}

function renderPermissionEntry() {
  const strip = document.getElementById("permissionEntry");
  if (strip) strip.hidden = localStorage.getItem(PERMISSION_GUIDE_KEY) === "seen";
}

function registrationButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "ghost-btn" : "mini-btn";
  if (!race.registrationUrl) {
    return `<button class="${classes}" type="button" disabled aria-disabled="true">페이지 준비중</button>`;
  }
  return `<button class="${classes}" type="button" data-open-registration="${race.id}">대회 페이지</button>`;
}

function alertButtonHtml(race, variant = "mini") {
  const classes = variant === "detail" ? "primary-btn" : "mini-btn strong";
  if (!race.registrationOpenAt || race.status === "closed") {
    return `<button class="${classes}" type="button" disabled aria-disabled="true">알림 대기</button>`;
  }
  return `<button class="${classes}" type="button" data-open-alert="${race.id}">알림 설정</button>`;
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
  select.innerHTML = `<option value="all">전체 지역</option>${regions.map((region) => `<option value="${region}">${region}</option>`).join("")}`;
  select.value = state.draftRegionFilter;
}

function syncDraftFilters() {
  state.draftDistanceFilter = state.distanceFilter;
  state.draftRegionFilter = state.regionFilter;
  state.draftQuery = state.query;
}

function applyFilters() {
  state.distanceFilter = state.draftDistanceFilter;
  state.regionFilter = state.draftRegionFilter;
  state.query = state.draftQuery;
  state.selectedRaceId = null;
  renderRaceList();
  renderDetail();
  showToast("선택한 조건으로 대회를 찾았어요.");
}

function renderRaceList() {
  const list = document.getElementById("raceList");
  const races = filteredRaces();
  document.getElementById("raceCountLabel").textContent = `${races.length}개`;
  if (!races.length) {
    list.innerHTML = `<div class="alert-card"><h3>조건에 맞는 대회가 없어요.</h3><p class="meta-line">필터를 줄이거나 검색어를 바꿔보세요.</p></div>`;
    return;
  }
  list.innerHTML = races
    .map((race) => {
      const selected = state.selectedRaceId === race.id ? " selected" : "";
      const enabled = state.alerts[race.id]?.enabled;
      const soon = race.status === "open" || isWithinDays(race.registrationOpenAt, SOON_DAYS);
      const registrationChip = race.registrationUrl ? "대회 페이지" : "페이지 열리면 알려드릴게요";
      return `
        <article class="race-card${selected}" data-race-id="${race.id}">
          <div class="race-card-head">
            <div>
              <h3>${race.name}</h3>
              <p class="meta-line">${race.region} ${race.city} · ${race.venue}</p>
            </div>
            <span class="status-pill ${race.status}">${statusLabel(race.status)}</span>
          </div>
          <div class="schedule-pair">
            <div>
              <span>접수</span>
              <strong>${formatRegistrationRange(race)}</strong>
              <em>${race.registrationOpenAt ? `접수까지 ${formatDday(race.registrationOpenAt)}` : "접수일 업데이트 대기"}</em>
            </div>
            <div>
              <span>대회</span>
              <strong>${formatShortDateTime(race.raceDate)}</strong>
              <em>대회까지 ${formatDday(race.raceDate)}</em>
            </div>
          </div>
          <div class="chips">
            ${soon ? `<span class="chip highlight">${race.status === "open" ? "접수중" : "곧 접수"}</span>` : ""}
            ${enabled ? `<span class="chip highlight">알림 켜짐</span>` : ""}
            <span class="chip ${race.registrationUrl ? "highlight" : "warn"}">${registrationChip}</span>
            <span class="chip">${race.sourceName}</span>
          </div>
          <div class="race-card-actions">
            ${alertButtonHtml(race)}
            ${registrationButtonHtml(race)}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDetail() {
  const panel = document.getElementById("raceDetail");
  const race = getRaces().find((item) => item.id === state.selectedRaceId);
  if (!race) {
    panel.innerHTML = `
      <div class="empty-detail">
        <span class="mini-logo">PR</span>
        <h2>대회를 선택하세요</h2>
        <p>접수 시간과 알림 설정을 바로 확인합니다.</p>
      </div>
    `;
    return;
  }
  panel.innerHTML = `
    <div class="detail-head">
      <div>
        <span class="section-kicker">${race.region} · ${race.city}</span>
        <h2>${race.name}</h2>
        <p class="meta-line">${race.note}</p>
      </div>
      <span class="status-pill ${race.status}">${statusLabel(race.status)}</span>
    </div>
    <div class="detail-block date-callout">
      <span>${race.registrationOpenAt ? (race.status === "open" ? "지금 확인할 접수" : "알림 받을 접수") : "접수 상태"}</span>
      <strong>${formatRegistrationRange(race)}</strong>
    </div>
    <div class="detail-block field-list">
      <div class="field-row"><span>접수 기간</span><strong>${formatRegistrationRange(race)}</strong></div>
      <div class="field-row"><span>접수까지</span><strong>${race.registrationOpenAt ? formatDday(race.registrationOpenAt) : "접수일 업데이트 대기"}</strong></div>
      <div class="field-row"><span>대회일</span><strong>${formatShortDateTime(race.raceDate)}</strong></div>
      <div class="field-row"><span>대회까지</span><strong>${formatDday(race.raceDate)}</strong></div>
      <div class="field-row"><span>장소</span><strong>${race.venue}</strong></div>
      <div class="field-row"><span>거리</span><strong>${race.distances.join(" · ")}</strong></div>
      <div class="field-row"><span>확인처</span><strong>${race.sourceName}</strong></div>
    </div>
    <div class="detail-block detail-actions">
      ${alertButtonHtml(race, "detail")}
      ${registrationButtonHtml(race, "detail")}
    </div>
  `;
}

function renderModal() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
  const subscription = state.alerts[race.id];
  const selectedOffsets = subscription?.offsets || DEFAULT_OFFSETS;
  const possibleAlerts = buildRegistrationAlerts(race, selectedOffsets);
  document.getElementById("modalRaceName").textContent = race.name;
  document.getElementById("modalRaceMeta").textContent = `${formatDateTime(race.registrationOpenAt)} · ${race.region} ${race.city}`;
  document.getElementById("modalCountdown").textContent = formatDateTime(race.registrationOpenAt);
  document.getElementById("modalPresetGrid").innerHTML = DEFAULT_OFFSETS.map(
    (offset) => `
      <label>
        <input type="checkbox" value="${offset}" ${selectedOffsets.includes(offset) ? "checked" : ""} />
        ${offset === 0 ? "정각" : `${offset}분 전`}
      </label>
    `
  ).join("");
  document.getElementById("modalAlertHint").textContent = `예약 가능 알림 ${possibleAlerts.length}개. 지난 시간은 자동 제외됩니다.`;
  document.getElementById("modalCancelAlertButton").hidden = !subscription?.enabled;
}

function renderAlerts() {
  const list = document.getElementById("alertList");
  const racesById = Object.fromEntries(getRaces().map((race) => [race.id, race]));
  const active = Object.values(state.alerts).filter((alert) => alert.enabled);
  if (!active.length) {
    list.innerHTML = `<div class="alert-card"><h3>켜진 알림이 없어요.</h3><p class="meta-line">대회 카드의 알림 설정을 눌러 추가하세요.</p></div>`;
    return;
  }
  list.innerHTML = active
    .map((subscription) => {
      const race = racesById[subscription.raceId];
      if (!race) return "";
      const visibleOffsets = (subscription.scheduledAlerts?.length
        ? subscription.scheduledAlerts.map((alert) => alert.offset)
        : subscription.offsets
      ).sort((a, b) => b - a);
      return `
        <div class="alert-card">
          <div class="alert-head">
            <div>
              <h3>${race.name}</h3>
              <p class="meta-line">${formatDateTime(race.registrationOpenAt)}</p>
            </div>
            <span class="status-pill ${race.status}">${statusLabel(race.status)}</span>
          </div>
          <div class="chips">
            ${visibleOffsets.map((offset) => `<span class="chip highlight">${offset === 0 ? "정각" : `${offset}분 전`}</span>`).join("")}
          </div>
          <div class="detail-actions" style="margin-top:14px">
            <button class="ghost-btn" type="button" data-focus-race="${race.id}">상세</button>
            <button class="danger-btn" type="button" data-cancel-race="${race.id}">알림 끄기</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSyncStatus() {
  const lastSync = localStorage.getItem(SYNC_STORAGE_KEY);
  const text = lastSync ? `마지막 확인: ${formatDateTime(lastSync)}` : "마지막 확인: 아직 없음";
  const target = document.getElementById("lastSyncText");
  if (target) target.textContent = text;
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

function fireWebAlert(alert) {
  showToast(alert.title);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(alert.title, { body: alert.body, tag: `${alert.raceId}-${alert.offset}` });
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
    const delay = new Date(alert.fireAt).getTime() - Date.now();
    if (delay <= 0 || delay > 2147483647) return;
    state.timers.push(setTimeout(() => fireWebAlert(alert), delay));
  });
}

function scheduleAllBrowserTimers() {
  clearBrowserTimers();
  Object.values(state.alerts).forEach((subscription) => {
    if (subscription.enabled) scheduleBrowserTimers(subscription.scheduledAlerts || []);
  });
}

async function enableAlertFromModal() {
  const race = getRaces().find((item) => item.id === state.modalRaceId);
  if (!race) return;
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
    showToast("예약 가능한 알림 시간이 없어요.");
    return;
  }
  state.alerts[race.id] = {
    enabled: true,
    raceId: race.id,
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

function openRegistration(raceId) {
  const race = getRaces().find((item) => item.id === raceId);
  if (!race) return;
  if (!race.registrationUrl) {
    showToast("올해 대회 페이지는 아직 공개되지 않았어요.");
    return;
  }
  window.open(race.registrationUrl, "_blank", "noopener,noreferrer");
  showToast("대회 페이지를 열었어요.");
}

function simulateSync() {
  const now = new Date().toISOString();
  localStorage.setItem(SYNC_STORAGE_KEY, now);
  renderSyncStatus();
  showToast("새로고침 완료. 변경된 접수 정보는 없어요.");
}

function showBatteryGuide() {
  document.getElementById("batteryModal").hidden = false;
}

function closeBatteryGuide() {
  document.getElementById("batteryModal").hidden = true;
}

function openBatterySettings() {
  const ua = navigator.userAgent.toLowerCase();
  showBatteryGuide();
  if (ua.includes("android")) {
    window.location.href = "intent://settings/#Intent;action=android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS;end";
    showToast("배터리 설정이 열리면 PushRun을 제한 없음으로 바꿔주세요.");
    return;
  }
  if (/iphone|ipad|ipod/.test(ua)) {
    showToast("iPhone은 설정 앱의 배터리에서 저전력 모드를 확인해주세요.");
    return;
  }
  showToast("휴대폰에서 열면 배터리 설정 안내를 볼 수 있어요.");
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
  document.addEventListener("click", (event) => {
    const alertButton = event.target.closest("[data-open-alert]");
    if (alertButton) {
      openAlertModal(alertButton.dataset.openAlert);
      return;
    }

    const registrationButton = event.target.closest("[data-open-registration]");
    if (registrationButton) {
      openRegistration(registrationButton.dataset.openRegistration);
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
      renderDistanceFilters();
    }
  });

  document.getElementById("regionFilter").addEventListener("change", (event) => {
    state.draftRegionFilter = event.target.value;
  });

  document.getElementById("applyFiltersButton").addEventListener("click", applyFilters);
  document.getElementById("syncButton").addEventListener("click", simulateSync);
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
  document.getElementById("openBatterySettingsButton").addEventListener("click", openBatterySettings);
  document.getElementById("batterySettingsAgainButton").addEventListener("click", openBatterySettings);
  document.getElementById("batteryCloseButton").addEventListener("click", closeBatteryGuide);
  document.getElementById("batteryDoneButton").addEventListener("click", closeBatteryGuide);
  document.getElementById("batteryModal").addEventListener("click", (event) => {
    if (event.target.id === "batteryModal") closeBatteryGuide();
  });
}

function render() {
  renderDistanceFilters();
  renderRegionFilter();
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = state.draftQuery;
  renderRaceList();
  renderDetail();
  renderAlerts();
  renderSyncStatus();
  renderPermissionEntry();
  updatePermissionText();
}

function startTicker() {
  setInterval(() => {
    renderDetail();
    if (!document.getElementById("alertModal").hidden) renderModal();
  }, 1000);
}

async function initApp() {
  bindEvents();
  syncDraftFilters();
  try {
    await loadRaceData();
  } catch {
    state.races = [];
  }
  render();
  if (!state.races.length) showToast("대회 데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.");
  if (!localStorage.getItem(PERMISSION_GUIDE_KEY)) {
    setTimeout(openPermissionGuide, 600);
  }
  startTicker();
  scheduleAllBrowserTimers();
}

initApp();
