// PushRun 정적 자산과 대회 데이터의 출시 전 필수 조건을 검증한다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "outputs", "pushrun-site");
const app = readFileSync(join(site, "app.js"), "utf8");
const html = readFileSync(join(site, "index.html"), "utf8");
const sw = readFileSync(join(site, "sw.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(site, "manifest.webmanifest"), "utf8"));
const data = JSON.parse(readFileSync(join(site, "races.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// ── 신선도 기준(상수) ─────────────────────────────────────────────
// 접수 예정(오픈 시각이 미래) 대회가 이 수 미만이면 FAIL.
// "접수 예정" 목록이 비면 앱의 핵심 화면이 빈 채로 배포되기 때문이다.
const MIN_UPCOMING_REGISTRATION = 1;
// 대회일이 이미 지난 대회 비율이 이 값을 초과하면 FAIL.
// 절반 넘게 끝난 대회라면 데이터 자체가 오래된 것으로 본다.
const MAX_ENDED_RATIO = 0.5;

const errors = [];
const warn = [];
const httpLinks = [];
const featured = Array.isArray(data.featuredRaces) ? data.featuredRaces : [];
const schedule = Array.isArray(data.scheduleFeed) ? data.scheduleFeed : [];
const all = [...featured, ...schedule];

if (featured.length === 0) errors.push("featuredRaces가 비어 있습니다.");
if (schedule.length === 0) errors.push("scheduleFeed가 비어 있습니다.");
if (!manifest.start_url || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  errors.push("PWA manifest의 start_url 또는 icons가 없습니다.");
}

// app.js 가 역참조하는 필수 필드: 하나라도 비면 런타임에서 앱 전체가 죽거나 카드가 깨진다.
// - venue: parseScheduleFeed 가 venue.split(" ") 을 호출 (과거 실제 크래시 지점)
// - time: normalizeRaceTime 이 문자열 match 를 호출 (scheduleFeed 전용)
// - distances: courseLabel/필터가 join·includes 를 호출 (비어 있지 않은 배열이어야 함)
// - region/status: 필터·상태 뱃지 렌더링에 사용
const FEATURED_REQUIRED = ["id", "name", "region", "city", "venue", "raceDate", "status"];
const SCHEDULE_REQUIRED = ["name", "date", "time", "venue", "region", "status"];

function checkRequiredFields(race, keys, kind) {
  for (const key of keys) {
    const value = race[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      errors.push(`${kind} 필수 필드 누락(${key}): ${race.name || "이름 없음"}`);
    }
  }
  if (!Array.isArray(race.distances) || race.distances.length === 0) {
    errors.push(`${kind} 필수 필드 누락(distances): ${race.name || "이름 없음"}`);
  }
}

for (const race of featured) checkRequiredFields(race, FEATURED_REQUIRED, "featuredRaces");
for (const race of schedule) checkRequiredFields(race, SCHEDULE_REQUIRED, "scheduleFeed");

const identities = new Set();
for (const race of all) {
  const date = race.raceDate || race.date;
  if (!race.name || !date) {
    errors.push(`필수값 누락: ${race.name || "이름 없음"}`);
    continue;
  }
  if (Number.isNaN(Date.parse(date))) errors.push(`대회 날짜 오류: ${race.name} / ${date}`);
  for (const key of ["registrationOpenAt", "registrationCloseAt"]) {
    if (race[key] && Number.isNaN(Date.parse(race[key]))) errors.push(`${key} 오류: ${race.name}`);
  }
  if (
    race.registrationOpenAt &&
    race.registrationCloseAt &&
    Date.parse(race.registrationOpenAt) > Date.parse(race.registrationCloseAt)
  ) {
    errors.push(`접수 기간 순서 오류: ${race.name}`);
  }

  const identity = `${String(race.name).replace(/\s+/g, "").toLowerCase()}|${String(date).slice(0, 10)}`;
  if (identities.has(identity)) errors.push(`중복 대회: ${race.name} / ${String(date).slice(0, 10)}`);
  identities.add(identity);

  for (const key of ["registrationUrl", "sourceDetailUrl"]) {
    if (!race[key]) continue;
    try {
      const url = new URL(race[key]);
      if (!['http:', 'https:'].includes(url.protocol)) errors.push(`지원하지 않는 URL: ${race.name}`);
      if (url.protocol === "http:") httpLinks.push(`${race.name} ${key}`);
    } catch {
      errors.push(`URL 형식 오류: ${race.name} / ${key}`);
    }
  }
}

// ── 데이터 신선도 게이트 (실행 시각 KST 기준) ──────────────────────
const now = Date.now();
// 오늘의 KST 날짜 문자열(YYYY-MM-DD). 대회일은 날짜 단위로 비교해
// "오늘 열리는 대회"가 지난 대회로 집계되지 않게 한다.
const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(now));
let endedRaces = 0;
let closedRegistrations = 0;
let upcomingRegistrations = 0;
for (const race of all) {
  const raceDay = String(race.raceDate || race.date || "").slice(0, 10);
  if (raceDay && raceDay < todayKst) endedRaces += 1;
  if (race.registrationCloseAt && Date.parse(race.registrationCloseAt) < now) closedRegistrations += 1;
  if (race.registrationOpenAt && Date.parse(race.registrationOpenAt) > now) upcomingRegistrations += 1;
}
warn.push(
  `신선도: 총 ${all.length}개 중 대회 종료 ${endedRaces}개, 접수 마감 ${closedRegistrations}개, 접수 예정 ${upcomingRegistrations}개 (KST ${todayKst} 기준)`
);
if (httpLinks.length > 0) warn.push(`HTTPS 미지원 가능 외부 링크 ${httpLinks.length}개`);
if (upcomingRegistrations < MIN_UPCOMING_REGISTRATION) {
  errors.push(`신선도 실패: 접수 예정(미래 오픈) 대회가 ${upcomingRegistrations}개입니다. 최소 ${MIN_UPCOMING_REGISTRATION}개 필요 — races.json 갱신이 필요합니다.`);
}
if (all.length > 0 && endedRaces / all.length > MAX_ENDED_RATIO) {
  errors.push(`신선도 실패: 이미 끝난 대회가 ${endedRaces}/${all.length}개(${Math.round((endedRaces / all.length) * 100)}%)로 ${MAX_ENDED_RATIO * 100}%를 초과합니다 — races.json 갱신이 필요합니다.`);
}

// ── 버전·캐시버스트 일관성 ────────────────────────────────────────
const appVersion = app.match(/const APP_VERSION = "([^"]+)"/)?.[1];
const assetVersion = app.match(/const ASSET_VERSION = "([^"]+)"/)?.[1];
if (appVersion !== pkg.version) errors.push(`앱 버전 불일치: package=${pkg.version}, app.js=${appVersion}`);
if (
  !assetVersion ||
  !html.includes(`app.js?v=${assetVersion}`) ||
  !html.includes(`alerts-core.js?v=${assetVersion}`) ||
  !html.includes(`styles.css?v=${assetVersion}`)
) {
  errors.push("app.js의 ASSET_VERSION과 index.html 캐시버스트가 다릅니다.");
}

// sw.js: CACHE_NAME(pushrun-vX.Y.Z)은 package.json 버전과, APP_SHELL 의 ?v= 는 ASSET_VERSION 과 일치해야 한다.
const cacheVersion = sw.match(/const CACHE_NAME = "pushrun-v([^"]+)"/)?.[1];
if (cacheVersion !== pkg.version) {
  errors.push(`sw.js CACHE_NAME 불일치: package=${pkg.version}, sw.js=pushrun-v${cacheVersion}`);
}
const swBustVersions = [...sw.matchAll(/\?v=([\w.-]+)/g)].map((match) => match[1]);
if (swBustVersions.length === 0 || swBustVersions.some((version) => version !== assetVersion)) {
  errors.push(`sw.js APP_SHELL 캐시버스트 불일치: ASSET_VERSION=${assetVersion}, sw.js=[${[...new Set(swBustVersions)].join(", ")}]`);
}
if (!sw.includes(`./alerts-core.js?v=${assetVersion}`)) {
  errors.push("sw.js APP_SHELL 에 alerts-core.js 가 없습니다 (오프라인 셸에서 앱이 깨집니다).");
}
if (!sw.includes('request.mode === "navigate"')) {
  errors.push("sw.js의 HTML 셸 폴백이 탐색 요청으로 제한되지 않았습니다.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`정적 검증 통과: featured ${featured.length}, schedule ${schedule.length}, 총 ${all.length}개`);
if (warn.length > 0) console.warn(`경고:\n- ${warn.join("\n- ")}`);
