const ALERT_STORAGE_KEY = "pushrun:alert-subscriptions:v3";
const SYNC_STORAGE_KEY = "pushrun:last-sync:v1";
const PERMISSION_GUIDE_KEY = "pushrun:permission-guide-seen:v1";
const DEFAULT_OFFSETS = [20, 10, 0];
const SOON_DAYS = 14;
const APPLY_URLS = {
  chuncheon: "https://www.chuncheonmarathon.com/apply/part-application.html",
  jtbc: "https://runable.me/",
  jtbcOfficial: "https://marathon.jtbc.com/",
  seoulMarathon: "https://dongma.club",
  daegu: "https://daegumarathon.daegu.go.kr",
  ytn: "https://marathongo.co.kr/raceDetail/domestic/2026-ytn-seoul-tour-marathon",
  seoulInternational: "https://marathongo.co.kr/raceDetail/domestic/2026-seoul-international-marathon",
  seoulHalf: "https://marathongo.co.kr/raceDetail/domestic/2026-seoul-half-marathon",
  nightBusan: "https://marathongo.co.kr/raceDetail/domestic/2026-night-run-busan",
  theRaceBusan: "https://marathongo.co.kr/raceDetail/domestic/2026-the-race-busan-10k",
  incheonHalf: "https://marathongo.co.kr/raceDetail/domestic/26th-incheon-international-half-marathon-2026",
  incheonFederation: "https://marathongo.co.kr/raceDetail/domestic/2026-incheon-athletics-federation-marathon",
  cheongju: "https://marathongo.co.kr/raceDetail/domestic/2026-jeonmahyeop-cheongju-marathon",
  gyeongju: "https://marathongo.co.kr/raceDetail/domestic/2026-gyeongju-marathon",
  mbnSeoul: "https://marathongo.co.kr/raceDetail/domestic/2026-mbn-seoul-marathon",
  seoulRun: "https://marathongo.co.kr/raceDetail/domestic/2026-seoulrun",
  giveRace: "https://marathongo.co.kr/raceDetail/domestic/13th-give-n-race-2026-04-05",
  busan50k: "https://marathongo.co.kr/raceDetail/domestic/2026-busan-50k",
  seasideIncheon: "https://marathongo.co.kr/raceDetail/domestic/1st-kyonggi-news-seaside-marathon-2026-05-16"
};

const state = {
  selectedRaceId: null,
  modalRaceId: null,
  distanceFilter: "all",
  regionFilter: "all",
  query: "",
  draftDistanceFilter: "all",
  draftRegionFilter: "all",
  draftQuery: "",
  alerts: loadJson(ALERT_STORAGE_KEY, {}),
  timers: []
};

const RACES = [
  {
    id: "jtbc-seoul",
    name: "2026 JTBC 서울마라톤",
    region: "서울",
    city: "상암",
    venue: "상암 월드컵공원",
    raceDate: "2026-11-01T08:00:00+09:00",
    registrationOpenAt: "2026-07-01T00:00:00+09:00",
    registrationCloseAt: "2026-07-31T23:59:00+09:00",
    registrationUrl: APPLY_URLS.jtbc,
    distances: ["Full", "10K"],
    status: "open",
    capacity: 30000,
    popularity: 99,
    sourceName: "러너블 · JTBC 공식",
    note: "러너블에서 미등록 추가접수 선응모가 7월 한 달간 진행 중입니다."
  },
  {
    id: "ytn-seoul-tour",
    name: "2026 YTN 서울투어마라톤",
    region: "서울",
    city: "서울광장",
    venue: "서울광장",
    raceDate: "2026-09-06T07:30:00+09:00",
    registrationOpenAt: "2026-06-17T10:00:00+09:00",
    registrationCloseAt: "2026-07-15T23:59:00+09:00",
    registrationUrl: APPLY_URLS.ytn,
    distances: ["Half", "11K"],
    status: "open",
    capacity: 5000,
    popularity: 86,
    sourceName: "마라톤GO",
    note: "접수 기간은 6월 17일부터 7월 15일까지로 확인됩니다."
  },
  {
    id: "cheongju-jeonmahyeop",
    name: "2026 전마협회장배 청주마라톤",
    region: "충북",
    city: "청주",
    venue: "무심천 체육공원",
    raceDate: "2026-09-06T07:30:00+09:00",
    registrationOpenAt: "2026-06-10T10:00:00+09:00",
    registrationCloseAt: "2026-08-06T23:59:00+09:00",
    registrationUrl: APPLY_URLS.cheongju,
    distances: ["10K", "5K"],
    status: "open",
    capacity: 3000,
    popularity: 78,
    sourceName: "마라톤GO",
    note: "10km 2,000명, 5km 1,000명 선착순 모집으로 확인됩니다."
  },
  {
    id: "chuncheon-marathon",
    name: "2026 춘천마라톤",
    region: "강원",
    city: "춘천",
    venue: "춘천 공지천공원",
    raceDate: "2026-10-25T09:00:00+09:00",
    registrationOpenAt: "2026-07-14T14:00:00+09:00",
    registrationCloseAt: "2026-07-23T18:00:00+09:00",
    registrationUrl: APPLY_URLS.chuncheon,
    distances: ["Full", "10K"],
    status: "scheduled",
    capacity: 12000,
    popularity: 96,
    sourceName: "공식 · 마라톤GO",
    note: "Full 일반접수는 7월 14일 14시, 10km 일반접수는 7월 16일 14시에 열립니다."
  },
  {
    id: "daegu-marathon",
    name: "2026 대구마라톤",
    region: "대구",
    city: "대구",
    venue: "대구스타디움 및 시내 일원",
    raceDate: "2026-02-22T09:00:00+09:00",
    registrationOpenAt: "2025-09-15T10:00:00+09:00",
    registrationCloseAt: "2025-12-31T23:59:00+09:00",
    registrationUrl: APPLY_URLS.daegu,
    distances: ["Full", "10K", "5K"],
    status: "closed",
    capacity: 40000,
    popularity: 92,
    sourceName: "대구마라톤 공식",
    note: "풀코스/단체 9월 17일 10시, 10km/건강달리기 9월 22일 10시 오픈으로 공지됐습니다."
  },
  {
    id: "seoul-international",
    name: "2026 서울마라톤",
    region: "서울",
    city: "광화문",
    venue: "광화문광장",
    raceDate: "2026-03-15T08:00:00+09:00",
    registrationOpenAt: "2025-06-09T19:00:00+09:00",
    registrationCloseAt: "2026-06-10T23:59:00+09:00",
    registrationUrl: APPLY_URLS.seoulMarathon,
    distances: ["Full", "10K"],
    status: "closed",
    capacity: 38000,
    popularity: 98,
    sourceName: "동마클럽 · 마라톤GO",
    note: "접수처는 동마클럽으로 확인됩니다."
  },
  {
    id: "seoul-half",
    name: "2026 서울하프마라톤",
    region: "서울",
    city: "광화문",
    venue: "광화문광장",
    raceDate: "2026-04-26T08:00:00+09:00",
    registrationOpenAt: "2025-12-16T10:00:00+09:00",
    registrationCloseAt: "2025-12-18T23:59:00+09:00",
    registrationUrl: APPLY_URLS.seoulHalf,
    distances: ["Half", "10K"],
    status: "closed",
    capacity: 12000,
    popularity: 94,
    sourceName: "마라톤GO",
    note: "홈페이지 선착순 접수, HALF 8만원·10km 7만원으로 확인됩니다."
  },
  {
    id: "night-run-busan",
    name: "2026 나이트런 부산",
    region: "부산",
    city: "광안리",
    venue: "광안리 해변",
    raceDate: "2026-08-01T19:00:00+09:00",
    registrationOpenAt: "2026-06-01T10:00:00+09:00",
    registrationCloseAt: "2026-07-01T23:59:00+09:00",
    registrationUrl: APPLY_URLS.nightBusan,
    distances: ["10K", "5K"],
    status: "closed",
    capacity: 7000,
    popularity: 88,
    sourceName: "마라톤GO",
    note: "6월 티켓 오픈 예정으로 공지된 대회입니다."
  },
  {
    id: "mbn-seoul",
    name: "2026 MBN 서울마라톤",
    region: "서울",
    city: "광화문",
    venue: "광화문 광장, 잠실종합운동장",
    raceDate: "2026-11-15T08:00:00+09:00",
    registrationOpenAt: "2026-06-22T10:00:00+09:00",
    registrationCloseAt: "2026-06-26T23:59:00+09:00",
    registrationUrl: APPLY_URLS.mbnSeoul,
    distances: ["Half", "10K"],
    status: "closed",
    capacity: 12000,
    popularity: 89,
    sourceName: "마라톤GO",
    note: "HALF 6월 25일, 10km 6월 26일 접수로 확인됩니다."
  },
  {
    id: "gyeongju-marathon",
    name: "2026 경주마라톤",
    region: "경북",
    city: "경주",
    venue: "경주시민운동장",
    raceDate: "2026-10-17T08:00:00+09:00",
    registrationOpenAt: "2026-05-26T10:00:00+09:00",
    registrationCloseAt: "2026-05-28T23:59:00+09:00",
    registrationUrl: APPLY_URLS.gyeongju,
    distances: ["Full", "Half", "10K"],
    status: "closed",
    capacity: 10000,
    popularity: 88,
    sourceName: "마라톤GO",
    note: "풀·하프·10km 참가비와 접수 기간이 확인됩니다."
  },
  {
    id: "seoulrun",
    name: "2026 서울런",
    region: "서울",
    city: "여의도",
    venue: "여의도공원 문화의마당",
    raceDate: "2026-06-28T08:00:00+09:00",
    registrationOpenAt: "2026-03-18T10:00:00+09:00",
    registrationCloseAt: "2026-06-17T23:59:00+09:00",
    registrationUrl: APPLY_URLS.seoulRun,
    distances: ["Half", "10K", "5K"],
    status: "closed",
    capacity: 5000,
    popularity: 76,
    sourceName: "마라톤GO",
    note: "서울 여의도공원에서 열리는 하프·10km·5km 대회입니다."
  },
  {
    id: "the-race-busan",
    name: "2026 THE RACE BUSAN 10K",
    region: "부산",
    city: "부산항",
    venue: "부산항북항 친수공원",
    raceDate: "2026-04-19T08:00:00+09:00",
    registrationOpenAt: "2026-02-09T10:00:00+09:00",
    registrationCloseAt: "2026-03-06T23:59:00+09:00",
    registrationUrl: APPLY_URLS.theRaceBusan,
    distances: ["10K"],
    status: "closed",
    capacity: 6000,
    popularity: 82,
    sourceName: "마라톤GO",
    note: "부산항북항 친수공원 예정지에서 열리는 10km 대회입니다."
  },
  {
    id: "incheon-half",
    name: "제26회 인천국제하프마라톤",
    region: "인천",
    city: "문학",
    venue: "인천문학경기장",
    raceDate: "2026-03-22T08:30:00+09:00",
    registrationOpenAt: "2026-01-05T10:00:00+09:00",
    registrationCloseAt: "2026-02-13T23:59:00+09:00",
    registrationUrl: APPLY_URLS.incheonHalf,
    distances: ["Half", "10K"],
    status: "closed",
    capacity: 9000,
    popularity: 80,
    sourceName: "마라톤GO",
    note: "2026년 1월 5일 접수 예정으로 확인된 인천 하프 대회입니다."
  },
  {
    id: "incheon-federation",
    name: "2026 인천시육상연맹배 마라톤",
    region: "인천",
    city: "정서진",
    venue: "정서진아라타워",
    raceDate: "2026-05-17T08:00:00+09:00",
    registrationOpenAt: "2026-03-11T14:00:00+09:00",
    registrationCloseAt: "2026-04-03T23:59:00+09:00",
    registrationUrl: APPLY_URLS.incheonFederation,
    distances: ["Half", "10K", "5K"],
    status: "closed",
    capacity: 5000,
    popularity: 72,
    sourceName: "마라톤GO",
    note: "3월 11일 14시 접수 예정으로 확인됩니다."
  },
  {
    id: "give-n-race",
    name: "제13회 GIVE N RACE",
    region: "부산",
    city: "벡스코",
    venue: "부산 벡스코 야외광장",
    raceDate: "2026-04-05T09:00:00+09:00",
    registrationOpenAt: "2026-02-02T10:00:00+09:00",
    registrationCloseAt: "2026-03-02T23:59:00+09:00",
    registrationUrl: APPLY_URLS.giveRace,
    distances: ["10K", "8K"],
    status: "closed",
    capacity: 7000,
    popularity: 79,
    sourceName: "마라톤GO",
    note: "기부 문화와 결합한 부산 러닝 대회입니다."
  },
  {
    id: "busan-50k",
    name: "2026 BUSAN 50K",
    region: "부산",
    city: "부산",
    venue: "신라대학교 대운동장",
    raceDate: "2026-05-09T06:00:00+09:00",
    registrationOpenAt: "2026-01-05T10:00:00+09:00",
    registrationCloseAt: "2026-02-03T23:59:00+09:00",
    registrationUrl: APPLY_URLS.busan50k,
    distances: ["Trail", "50K", "37K", "24K", "12K"],
    status: "closed",
    capacity: 1800,
    popularity: 74,
    sourceName: "마라톤GO",
    note: "트레일·울트라 성격의 부산 장거리 레이스입니다."
  },
  {
    id: "seaside-incheon",
    name: "제1회 경기신문 씨사이드 마라톤",
    region: "인천",
    city: "중구",
    venue: "인천 중구 씨사이드파크",
    raceDate: "2026-05-16T09:00:00+09:00",
    registrationOpenAt: "2026-02-23T14:00:00+09:00",
    registrationCloseAt: "2026-04-24T23:59:00+09:00",
    registrationUrl: APPLY_URLS.seasideIncheon,
    distances: ["Half", "10K", "5K"],
    status: "closed",
    capacity: 5000,
    popularity: 70,
    sourceName: "마라톤GO",
    note: "하프·10km·5km 전종목 선착순 5,000명으로 확인됩니다."
  }
];

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
  if (!race.registrationCloseAt) return formatShortDateTime(race.registrationOpenAt);
  return `${formatShortDateTime(race.registrationOpenAt)} - ${formatShortDateTime(race.registrationCloseAt)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function raceSortGroup(race) {
  const now = Date.now();
  const opensAt = new Date(race.registrationOpenAt).getTime();
  const closesAt = new Date(race.registrationCloseAt || race.registrationOpenAt).getTime();
  const raceAt = new Date(race.raceDate).getTime();
  if (race.status === "open" || (opensAt <= now && now <= closesAt)) return 0;
  if (opensAt > now) return 1;
  if (raceAt > now) return 2;
  return 3;
}

function sortValueForGroup(race, group) {
  if (group === 0) return new Date(race.registrationCloseAt || race.registrationOpenAt).getTime();
  if (group === 1) return new Date(race.registrationOpenAt).getTime();
  if (group === 2) return new Date(race.raceDate).getTime();
  return -new Date(race.raceDate).getTime();
}

function getRaces() {
  return RACES.filter(isVisibleRace).sort((a, b) => {
    const groupA = raceSortGroup(a);
    const groupB = raceSortGroup(b);
    if (groupA !== groupB) return groupA - groupB;
    return sortValueForGroup(a, groupA) - sortValueForGroup(b, groupB);
  });
}

function isVisibleRace(race) {
  const now = Date.now();
  const raceAt = new Date(race.raceDate).getTime();
  const closesAt = new Date(race.registrationCloseAt || race.registrationOpenAt).getTime();
  return raceAt >= now && closesAt >= now && !["cancelled", "postponed"].includes(race.status);
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
    return `<button class="${classes}" type="button" disabled aria-disabled="true">확인 중</button>`;
  }
  return `<button class="${classes}" type="button" data-open-registration="${race.id}">대회 페이지</button>`;
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
      const registrationChip = race.registrationUrl ? "대회 페이지" : "확인 중";
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
            <div><span>접수</span><strong>${formatRegistrationRange(race)}</strong></div>
            <div><span>대회</span><strong>${formatShortDateTime(race.raceDate)}</strong></div>
          </div>
          <div class="chips">
            ${soon ? `<span class="chip highlight">${race.status === "open" ? "접수중" : "곧 접수"}</span>` : ""}
            ${enabled ? `<span class="chip highlight">알림 켜짐</span>` : ""}
            <span class="chip ${race.registrationUrl ? "highlight" : "warn"}">${registrationChip}</span>
            <span class="chip">${race.sourceName}</span>
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
      <span>${race.status === "open" ? "지금 확인할 접수" : "알림 받을 접수"}</span>
      <strong>${formatRegistrationRange(race)}</strong>
    </div>
    <div class="detail-block field-list">
      <div class="field-row"><span>접수 기간</span><strong>${formatRegistrationRange(race)}</strong></div>
      <div class="field-row"><span>대회일</span><strong>${formatShortDateTime(race.raceDate)}</strong></div>
      <div class="field-row"><span>장소</span><strong>${race.venue}</strong></div>
      <div class="field-row"><span>거리</span><strong>${race.distances.join(" · ")}</strong></div>
      <div class="field-row"><span>확인처</span><strong>${race.sourceName}</strong></div>
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

bindEvents();
syncDraftFilters();
render();
if (!localStorage.getItem(PERMISSION_GUIDE_KEY)) {
  setTimeout(openPermissionGuide, 600);
}
startTicker();
scheduleAllBrowserTimers();
