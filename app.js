const ALERT_STORAGE_KEY = "pushrun:alert-subscriptions:v3";
const SYNC_STORAGE_KEY = "pushrun:last-sync:v1";
const PERMISSION_GUIDE_KEY = "pushrun:permission-guide-seen:v1";
const UNAVAILABLE_REGISTRATION = null;
const DEFAULT_OFFSETS = [20, 10, 0];
const SOON_DAYS = 14;
const APPLY_URLS = {
  chuncheon: "https://www.chuncheonmarathon.com/apply/part-application.html",
  jtbc: "https://runable.me/",
  seoulMarathon: "https://dongma.club"
};

const state = {
  selectedRaceId: null,
  modalRaceId: null,
  statusFilter: "all",
  distanceFilter: "all",
  regionFilter: "all",
  query: "",
  draftStatusFilter: "all",
  draftDistanceFilter: "all",
  draftRegionFilter: "all",
  draftQuery: "",
  alerts: loadJson(ALERT_STORAGE_KEY, {}),
  timers: []
};

function makeDate(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

const RACES = [
  {
    id: "demo-10",
    name: "서울 잠실 10K",
    region: "서울",
    city: "잠실",
    venue: "잠실종합운동장",
    raceDate: "2026-09-13T00:00:00+09:00",
    registrationOpenAt: makeDate(11),
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["10K", "5K"],
    status: "scheduled",
    sourceConfidence: "official",
    capacity: 5000,
    popularity: 98,
    note: "접수 시작 전 알림을 켜두기 좋은 도심 10K 대회."
  },
  {
    id: "seoul-half",
    name: "서울 하프 마라톤",
    region: "서울",
    city: "광화문",
    venue: "광화문광장",
    raceDate: "2026-10-18T00:00:00+09:00",
    registrationOpenAt: "2026-07-12T20:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Half", "10K"],
    status: "scheduled",
    sourceConfidence: "official",
    capacity: 12000,
    popularity: 94,
    note: "인기 대회. 접수 시작 직후 확인 권장."
  },
  {
    id: "busan-night-run",
    name: "부산 나이트 런",
    region: "부산",
    city: "해운대",
    venue: "해운대 해변로",
    raceDate: "2026-08-29T00:00:00+09:00",
    registrationOpenAt: "2026-07-09T10:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["10K", "5K"],
    status: "scheduled",
    sourceConfidence: "multi_source",
    capacity: 7000,
    popularity: 87,
    note: "접수처와 공식 공지 기준이 일치합니다."
  },
  {
    id: "daegu-full",
    name: "대구 풀코스 챌린지",
    region: "대구",
    city: "수성구",
    venue: "대구스타디움",
    raceDate: "2026-11-08T00:00:00+09:00",
    registrationOpenAt: "2026-07-25T14:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Full", "Half", "10K"],
    status: "scheduled",
    sourceConfidence: "official",
    capacity: 15000,
    popularity: 90,
    note: "풀코스 선착순 구간 주의."
  },
  {
    id: "jeju-trail",
    name: "제주 오름 트레일런",
    region: "제주",
    city: "서귀포",
    venue: "오름 코스",
    raceDate: "2026-10-03T00:00:00+09:00",
    registrationOpenAt: "2026-07-16T09:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Trail", "15K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 1800,
    popularity: 76,
    note: "소규모 모집. 빠른 확인 추천."
  },
  {
    id: "incheon-bridge",
    name: "인천 브릿지 레이스",
    region: "인천",
    city: "송도",
    venue: "센트럴파크",
    raceDate: "2026-09-27T00:00:00+09:00",
    registrationOpenAt: "2026-07-20T11:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Half", "10K", "5K"],
    status: "changed",
    sourceConfidence: "multi_source",
    capacity: 9000,
    popularity: 82,
    note: "접수 시간이 11:00로 변경되었습니다."
  },
  {
    id: "gangneung-sea",
    name: "강릉 바다 마라톤",
    region: "강원",
    city: "강릉",
    venue: "경포해변",
    raceDate: "2026-08-16T00:00:00+09:00",
    registrationOpenAt: "2026-07-15T18:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["10K", "5K"],
    status: "postponed",
    sourceConfidence: "multi_source",
    capacity: 4000,
    popularity: 65,
    note: "일정 재공지 확인 대상입니다."
  },
  {
    id: "han-river-kids",
    name: "한강 키즈 패밀리런",
    region: "서울",
    city: "여의도",
    venue: "여의도 한강공원",
    raceDate: "2026-08-23T00:00:00+09:00",
    registrationOpenAt: "2026-07-11T13:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Kids", "3K", "5K"],
    status: "cancelled",
    sourceConfidence: "official",
    capacity: 2500,
    popularity: 59,
    note: "취소 공지 확인."
  },
  {
    id: "chuncheon-autumn",
    name: "2026 춘천마라톤",
    region: "강원",
    city: "춘천",
    venue: "춘천 공지천교",
    raceDate: "2026-10-25T09:00:00+09:00",
    registrationOpenAt: "2026-07-14T14:00:00+09:00",
    registrationUrl: APPLY_URLS.chuncheon,
    distances: ["Full", "10K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 12000,
    popularity: 91,
    note: "Full 일반접수는 7월 14일 14시, 10km는 7월 16일 14시에 열립니다."
  },
  {
    id: "gyeongju-international",
    name: "경주 국제 마라톤",
    region: "경북",
    city: "경주",
    venue: "경주시내 코스",
    raceDate: "2026-10-18T00:00:00+09:00",
    registrationOpenAt: "2026-08-12T14:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Full", "Half", "10K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 10000,
    popularity: 88,
    note: "역사 도시 코스."
  },
  {
    id: "jtbc-seoul",
    name: "2026 JTBC 서울마라톤",
    region: "서울",
    city: "상암",
    venue: "상암 월드컵공원",
    raceDate: "2026-11-01T00:00:00+09:00",
    registrationOpenAt: "2026-07-01T00:00:00+09:00",
    registrationUrl: APPLY_URLS.jtbc,
    distances: ["Full", "10K"],
    status: "open",
    sourceConfidence: "single_source",
    capacity: 30000,
    popularity: 96,
    note: "러너블에서 미등록 추가접수 선응모가 진행 중입니다."
  },
  {
    id: "jeonju-hanok",
    name: "전주 한옥마을 러닝",
    region: "전북",
    city: "전주",
    venue: "한옥마을 일대",
    raceDate: "2026-09-20T00:00:00+09:00",
    registrationOpenAt: "2026-07-30T09:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Half", "10K", "5K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 5000,
    popularity: 72,
    note: "관광형 러닝 대회."
  },
  {
    id: "ulsan-industrial",
    name: "울산 태화강 마라톤",
    region: "울산",
    city: "울산",
    venue: "태화강 국가정원",
    raceDate: "2026-09-06T00:00:00+09:00",
    registrationOpenAt: "2026-07-22T10:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Half", "10K", "5K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 4500,
    popularity: 68,
    note: "강변 코스."
  },
  {
    id: "daejeon-science",
    name: "대전 사이언스런",
    region: "대전",
    city: "유성",
    venue: "엑스포 과학공원",
    raceDate: "2026-10-11T00:00:00+09:00",
    registrationOpenAt: "2026-08-01T11:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["10K", "5K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 3500,
    popularity: 61,
    note: "가족 참가형."
  },
  {
    id: "suwon-fortress",
    name: "수원 화성 러닝 페스타",
    region: "경기",
    city: "수원",
    venue: "화성행궁 일대",
    raceDate: "2026-09-12T00:00:00+09:00",
    registrationOpenAt: "2026-07-18T10:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["10K", "5K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 6000,
    popularity: 75,
    note: "수도권 근교 대회."
  },
  {
    id: "gwangju-mudeung",
    name: "광주 무등산 트레일",
    region: "광주",
    city: "광주",
    venue: "무등산권",
    raceDate: "2026-10-04T00:00:00+09:00",
    registrationOpenAt: "2026-08-08T09:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Trail", "15K", "7K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 1800,
    popularity: 70,
    note: "트레일 모집 인원 적음."
  },
  {
    id: "paju-dmz",
    name: "파주 평화 러닝",
    region: "경기",
    city: "파주",
    venue: "임진각 평화누리",
    raceDate: "2026-09-27T00:00:00+09:00",
    registrationOpenAt: "2026-07-28T13:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Half", "10K", "5K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 7000,
    popularity: 79,
    note: "수도권 주말 대회."
  },
  {
    id: "mokpo-sea",
    name: "목포 해상케이블카 마라톤",
    region: "전남",
    city: "목포",
    venue: "목포 해변 코스",
    raceDate: "2026-11-15T00:00:00+09:00",
    registrationOpenAt: "2026-09-01T10:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["Half", "10K"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 4000,
    popularity: 64,
    note: "가을 남해권 대회."
  },
  {
    id: "sejong-lake",
    name: "세종 호수공원 러닝",
    region: "세종",
    city: "세종",
    venue: "세종호수공원",
    raceDate: "2026-09-19T00:00:00+09:00",
    registrationOpenAt: "2026-07-24T10:00:00+09:00",
    registrationUrl: UNAVAILABLE_REGISTRATION,
    distances: ["10K", "5K", "Family"],
    status: "scheduled",
    sourceConfidence: "single_source",
    capacity: 3000,
    popularity: 55,
    note: "가족 참가형."
  }
];

function getRaces() {
  return [...RACES].sort((a, b) => new Date(a.registrationOpenAt) - new Date(b.registrationOpenAt));
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
  localStorage.setItem(key, JSON.stringify(value));
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

function pad(value) {
  return String(value).padStart(2, "0");
}

function timeLeft(value) {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "접수 시작";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}일 ${pad(hours)}:${pad(minutes)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
    if (state.statusFilter === "soon") return isWithinDays(race.registrationOpenAt, SOON_DAYS);
    if (state.statusFilter === "popular") return race.popularity >= 85;
    if (state.statusFilter === "changed") return ["changed", "cancelled", "postponed"].includes(race.status);
    return true;
  });
}

function buildRegistrationAlerts(race, offsets = DEFAULT_OFFSETS) {
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
  return getRaces().find((race) => new Date(race.registrationOpenAt).getTime() > Date.now() && race.status !== "cancelled");
}

function selectRace(id) {
  state.selectedRaceId = id;
  render();
}

function openAlertModal(raceId) {
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
    return `<button class="${classes}" type="button" disabled aria-disabled="true">접수 미정</button>`;
  }
  return `<button class="${classes}" type="button" data-open-registration="${race.id}">접수 페이지</button>`;
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

function renderStatusFilters() {
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.statusFilter === state.draftStatusFilter);
  });
}

function syncDraftFilters() {
  state.draftStatusFilter = state.statusFilter;
  state.draftDistanceFilter = state.distanceFilter;
  state.draftRegionFilter = state.regionFilter;
  state.draftQuery = state.query;
}

function applyFilters() {
  state.statusFilter = state.draftStatusFilter;
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
      const soon = isWithinDays(race.registrationOpenAt, SOON_DAYS);
      const registrationChip = race.registrationUrl ? "접수 페이지 준비" : "접수 미정";
      return `
        <article class="race-card${selected}" data-race-id="${race.id}">
          <div class="race-card-head">
            <div>
              <h3>${race.name}</h3>
              <p class="meta-line">${race.region} ${race.city} · ${race.distances.join(" · ")}</p>
            </div>
            <span class="status-pill ${race.status}">${statusLabel(race.status)}</span>
          </div>
          <p class="meta-line">접수 ${formatDateTime(race.registrationOpenAt)} · 대회 ${formatDate(race.raceDate)}</p>
          <div class="chips">
            ${soon ? `<span class="chip highlight">곧 접수</span>` : ""}
            ${enabled ? `<span class="chip highlight">알림 켜짐</span>` : ""}
            <span class="chip ${race.registrationUrl ? "highlight" : "warn"}">${registrationChip}</span>
            <span class="chip">선착순 ${race.capacity.toLocaleString()}명</span>
          </div>
          <div class="race-card-actions">
            <button class="mini-btn strong" type="button" data-open-alert="${race.id}">알림 설정</button>
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
      <span>접수 시작</span>
      <strong>${formatDateTime(race.registrationOpenAt)}</strong>
    </div>
    <div class="detail-block field-list">
      <div class="field-row"><span>접수 시작</span><strong>${formatDateTime(race.registrationOpenAt)}</strong></div>
      <div class="field-row"><span>대회일</span><strong>${formatDate(race.raceDate)}</strong></div>
      <div class="field-row"><span>장소</span><strong>${race.venue}</strong></div>
      <div class="field-row"><span>거리</span><strong>${race.distances.join(" · ")}</strong></div>
      <div class="field-row"><span>접수 페이지</span><strong>${race.registrationUrl ? "열기 가능" : "아직 미정"}</strong></div>
    </div>
    <div class="detail-block detail-actions">
      <button class="primary-btn" type="button" data-open-alert="${race.id}">알림 설정</button>
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
    showToast("올해 접수 페이지는 아직 공개되지 않았어요.");
    return;
  }
  window.open(race.registrationUrl, "_blank", "noopener,noreferrer");
  showToast("접수 페이지를 열었어요.");
}

function simulateSync() {
  const now = new Date().toISOString();
  localStorage.setItem(SYNC_STORAGE_KEY, now);
  renderSyncStatus();
  showToast("새로고침 완료. 변경된 접수 정보는 없어요.");
}

function showBatteryGuide() {
  showToast("휴대폰 설정에서 PushRun 배터리 제한을 해제하면 알림이 더 안정적이에요.");
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
    const statusButton = event.target.closest("[data-status-filter]");
    if (statusButton) {
      state.draftStatusFilter = statusButton.dataset.statusFilter;
      renderStatusFilters();
    }

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
}

function render() {
  renderStatusFilters();
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

bindEvents();
syncDraftFilters();
render();
if (!localStorage.getItem(PERMISSION_GUIDE_KEY)) {
  setTimeout(openPermissionGuide, 600);
}
startTicker();
scheduleAllBrowserTimers();
