// PushRun 정적 자산과 대회 데이터의 출시 전 필수 조건을 검증한다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "outputs", "pushrun-site");
const app = readFileSync(join(site, "app.js"), "utf8");
const calendarCore = readFileSync(join(site, "race-calendar-core.js"), "utf8");
const styles = readFileSync(join(site, "styles.css"), "utf8");
const html = readFileSync(join(site, "index.html"), "utf8");
const sw = readFileSync(join(site, "sw.js"), "utf8");
const familyAnalytics = readFileSync(join(site, "family-analytics.js"), "utf8");
const familyShell = readFileSync(join(site, "family-shell.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(site, "manifest.webmanifest"), "utf8"));
const data = JSON.parse(readFileSync(join(site, "races.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const familyMeta = JSON.parse(readFileSync(join(root, "generated", "robom-family", "app-meta.json"), "utf8"));
const familySettings = JSON.parse(readFileSync(join(root, "generated", "robom-family", "settings-contract.json"), "utf8"));
const familyFeatureFlags = JSON.parse(readFileSync(join(root, "generated", "robom-family", "feature-flags.json"), "utf8"));
const familyAuth = JSON.parse(readFileSync(join(root, "generated", "robom-family", "auth-config.json"), "utf8"));
const familyLock = JSON.parse(readFileSync(join(root, "family.lock.json"), "utf8"));
const vercelConfig = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const vercelBuild = readFileSync(join(root, "scripts", "build-vercel.mjs"), "utf8");
const vercelIgnore = readFileSync(join(root, ".vercelignore"), "utf8");
const FAMILY_SOURCE_COMMIT = "a048b157d09ef0a99b3344c2f8dd0dbd806b149c";

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

if (vercelConfig.buildCommand !== "node scripts/build-vercel.mjs" || vercelConfig.outputDirectory !== ".vercel-static") {
  errors.push("Vercel 정적 미러가 빌드 SHA 주입 산출물을 배포하지 않습니다.");
}
if (!vercelBuild.includes("VERCEL_GIT_COMMIT_SHA") || !vercelBuild.includes('replaceAll("__BUILD_SHA__"')) {
  errors.push("Vercel 빌드가 운영 Git SHA를 app.js에 주입하지 않습니다.");
}
if (!vercelIgnore.includes("!scripts/build-vercel.mjs")) {
  errors.push("Vercel 업로드에서 빌드 SHA 주입 스크립트가 제외됩니다.");
}

if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com/.test(html)) {
  errors.push("첫 화면에 외부 CDN 글꼴 또는 설치 자산 의존이 남아 있습니다.");
}

if (!styles.includes(".race-finder .region-select-box { width: 82px; }") || !styles.includes("min-height: 112px;") || !styles.includes("min-height: 58px;")) {
  errors.push("초기 필터 렌더링 전 모바일 레이아웃 이동 방지 공간이 없습니다.");
}

if (featured.length === 0) errors.push("featuredRaces가 비어 있습니다.");
if (schedule.length === 0) errors.push("scheduleFeed가 비어 있습니다.");
if (!manifest.id || !manifest.start_url || !manifest.scope || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  errors.push("PWA manifest의 id, start_url, scope 또는 icons가 없습니다.");
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
    race.registrationOpenTimeConfirmed !== undefined &&
    typeof race.registrationOpenTimeConfirmed !== "boolean"
  ) {
    errors.push(`registrationOpenTimeConfirmed 형식 오류: ${race.name}`);
  }
  if (race.registrationWindows !== undefined) {
    if (!Array.isArray(race.registrationWindows) || race.registrationWindows.length === 0) {
      errors.push(`registrationWindows 형식 오류: ${race.name}`);
    } else {
      const windowIds = new Set();
      for (const window of race.registrationWindows) {
        if (!window?.id || !window?.label || !window?.opensAt || Number.isNaN(Date.parse(window.opensAt))) {
          errors.push(`종목별 접수 시각 오류: ${race.name}`);
        }
        if (windowIds.has(window?.id)) errors.push(`종목별 접수 ID 중복: ${race.name} / ${window.id}`);
        windowIds.add(window?.id);
      }
    }
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
  const upcomingTimes = [race.registrationOpenAt, ...(race.registrationWindows || []).map((window) => window.opensAt)]
    .map((value) => Date.parse(value || ""))
    .filter((value) => Number.isFinite(value) && value > now);
  if (upcomingTimes.length) upcomingRegistrations += 1;
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
  !html.includes(`family-analytics.js?v=${assetVersion}`) ||
  !html.includes(`family-shell.js?v=${assetVersion}`) ||
  !html.includes(`family/analytics-events.js?v=${assetVersion}`) ||
  !html.includes(`family/tokens.css?v=${assetVersion}`) ||
  !html.includes(`race-calendar-core.js?v=${assetVersion}`) ||
  !html.includes(`alerts-core.js?v=${assetVersion}`) ||
  !html.includes(`styles.css?v=${assetVersion}`)
) {
  errors.push("app.js의 ASSET_VERSION과 index.html 캐시버스트가 다릅니다.");
}
if (!html.includes(`name="application-version" content="${pkg.version}"`)) {
  errors.push("HTML application-version과 package.json 버전이 다릅니다.");
}
if (familyLock.sourceCommit !== FAMILY_SOURCE_COMMIT) {
  errors.push(`family.lock.json sourceCommit 불일치: ${familyLock.sourceCommit}`);
}
if (familyLock.familySpecVersion !== familyMeta.familySpecVersion || familyMeta.id !== "runningbom") {
  errors.push("패밀리 lock과 RunningBom 메타데이터가 일치하지 않습니다.");
}
if (familyMeta.version !== pkg.version) {
  errors.push(`패밀리 app-meta 버전 drift: package=${pkg.version}, app-meta=${familyMeta.version}`);
}
for (const name of ["feature-flags.json", "auth-config.json"]) {
  if (!familyLock.files?.[name]) errors.push(`${name}이 family.lock.json에 없습니다.`);
  if (!sw.includes(`./family/${name}?v=${assetVersion}`)) errors.push(`${name}이 PWA 앱 셸 캐시에 없습니다.`);
}
if (familyFeatureFlags.ads?.enabled || familyFeatureFlags.analytics?.enabled) {
  errors.push("패밀리 feature flag의 광고·분석 기본값은 비활성이어야 합니다.");
}
if (!familyFeatureFlags.analytics?.consentRequired) {
  errors.push("패밀리 분석 feature flag는 명시적 동의를 요구해야 합니다.");
}
if (familyAuth.namespace !== "runningbom" || familyAuth.guestFirst !== true) {
  errors.push("패밀리 auth config는 runningbom guest-first여야 합니다.");
}
const familyAppIds = familyMeta.familyApps?.map((item) => item.id).sort() || [];
if (familyAppIds.join(",") !== ["calendarbom", "certbom", "homebom", "notebom", "outbom", "runningbom"].join(",")) {
  errors.push("설정용 패밀리 메타데이터에 5개 앱 전체가 없습니다.");
}

// sw.js: CACHE_NAME(pushrun-vX.Y.Z)은 package.json 버전과, APP_SHELL 의 ?v= 는 ASSET_VERSION 과 일치해야 한다.
const cacheVersion = sw.match(/const CACHE_NAME = "pushrun-v([^"]+)"/)?.[1];
if (cacheVersion !== pkg.version) {
  errors.push(`sw.js CACHE_NAME 불일치: package=${pkg.version}, sw.js=pushrun-v${cacheVersion}`);
}
if (!app.includes(`const PWA_CACHE_VERSION = "pushrun-v${pkg.version}"`)) {
  errors.push("설정 화면의 PWA 캐시 버전과 package.json 버전이 다릅니다.");
}
const swBustVersions = [...sw.matchAll(/\?v=([\w.-]+)/g)].map((match) => match[1]);
if (swBustVersions.length === 0 || swBustVersions.some((version) => version !== assetVersion)) {
  errors.push(`sw.js APP_SHELL 캐시버스트 불일치: ASSET_VERSION=${assetVersion}, sw.js=[${[...new Set(swBustVersions)].join(", ")}]`);
}
if (!sw.includes(`./alerts-core.js?v=${assetVersion}`)) {
  errors.push("sw.js APP_SHELL 에 alerts-core.js 가 없습니다 (오프라인 셸에서 앱이 깨집니다).");
}
for (const familyAsset of [
  "./family/tokens.css",
  "./family/analytics-events.js",
  "./family/app-meta.json",
  "./family/settings-contract.json",
  "./family/wordmark.svg",
  "./family/icons.svg",
  "./family-analytics.js",
  "./family-shell.js"
]) {
  if (!sw.includes(`${familyAsset}?v=${assetVersion}`)) {
    errors.push(`sw.js APP_SHELL 패밀리 자산 누락: ${familyAsset}`);
  }
}
if (!sw.includes('const CACHE_PREFIX = "pushrun-v"') || !sw.includes("key.startsWith(CACHE_PREFIX)")) {
  errors.push("서비스워커가 러닝봄 own prefix 캐시만 정리하지 않습니다.");
}
if (!sw.includes(`./race-calendar-core.js?v=${assetVersion}`) || !calendarCore.includes("buildRaceCalendarEvents")) {
  errors.push("대회 일정 캘린더 core가 HTML·서비스워커에 일관되게 포함되지 않았습니다.");
}
if (app.includes(".getHours()") || app.includes(".getMonth()") || app.includes(".getDate()")) {
  errors.push("화면 날짜·시각 계산에 브라우저 로컬 Date API가 남아 있습니다.");
}
if (!html.includes('name="theme-color" content="#2b211a"') || manifest.theme_color !== "#2b211a") {
  errors.push("HTML과 manifest의 웜 에스프레소 theme-color가 다릅니다.");
}
if (!sw.includes('request.mode === "navigate"')) {
  errors.push("sw.js의 HTML 셸 폴백이 탐색 요청으로 제한되지 않았습니다.");
}
if (app.includes('const status = isAcceptingNow(race) ? "현재 접수 중" : "접수 예정"')) {
  errors.push("히어로가 접수 상태와 D-day를 중복 표시하는 이전 문구를 사용합니다.");
}
if (!html.includes('id="clearSearchButton"') || !html.includes('id="filterSummary"')) {
  errors.push("모바일 검색의 지우기 버튼 또는 적용 조건 요약이 없습니다.");
}
if (html.includes('id="homeHero"') || app.includes("renderHomeHero") || app.includes("getHeroRace")) {
  errors.push("홈의 거대한 다음 대회 히어로 코드가 남아 있습니다.");
}
if (!html.includes('class="race-finder"') || !html.includes('placeholder="대회명·지역 검색"')) {
  errors.push("검색 우선 홈 구조가 없습니다.");
}
if (
  !html.includes('<strong class="brand-prefix">러닝</strong>') ||
  !html.includes('class="brand-bom"') ||
  !html.includes(`family/wordmark.svg?v=${assetVersion}`) ||
  !sw.includes(`./family/wordmark.svg?v=${assetVersion}`) ||
  html.includes("bom-runningbom.svg")
) {
  errors.push("중앙 패밀리 봄 wordmark가 HTML·서비스워커에 일관되게 연결되지 않았습니다.");
}
if (!html.includes('id="buildShaText"') || !app.includes('const BUILD_SHA = "__BUILD_SHA__"')) {
  errors.push("설정 화면의 운영 빌드 식별자가 없습니다.");
}
if (app.includes('>접수</a>') || app.includes('>알림</button>')) {
  errors.push("목록 행동 문구가 공식 접수처·알림 설정으로 구체화되지 않았습니다.");
}
if (app.includes("알림 준비 중") || app.includes("aria-label=\"${label} 불가\"")) {
  errors.push("접수 중 카드에 비활성 알림 준비 중 행동이 남아 있습니다.");
}
if (!app.includes("const INITIAL_RACE_LIMIT = 20") || !app.includes("data-load-more")) {
  errors.push("긴 목록의 20개 단위 점진 표시가 없습니다.");
}
if (!app.includes("sortOpenRaces") || !calendarCore.includes("cardCountdown")) {
  errors.push("마감 임박 정렬 또는 의미가 포함된 카드 카운트다운이 없습니다.");
}
if ((styles.match(/:root\s*\{/g) || []).length !== 1 || !styles.includes("--page: var(--app-page") || !styles.includes("--family-nav-height") || !styles.includes("radial-gradient")) {
  errors.push("패밀리 생성 토큰과 RunningBom 배경이 실제 CSS에 연결되지 않았습니다.");
}
if (/ad-slot|광고 자리/.test(`${html}\n${styles}\n${app}`)) {
  errors.push("hidden 또는 visible 광고 placeholder가 남아 있습니다.");
}
if (!app.includes("sortedRacesSource === state.races")) {
  errors.push("대회 정렬 결과 캐시가 없어 필터 렌더마다 전체 정렬이 반복됩니다.");
}
if (/[⌕›‹×⌂♧⚙]/.test(`${html}\n${app}`)) {
  errors.push("문자 임시 아이콘이 HTML 또는 동적 UI에 남아 있습니다.");
}
if (!html.includes("family/icons.svg#family-icon-search") || !html.includes("family/icons.svg#family-icon-settings")) {
  errors.push("중앙 패밀리 선형 SVG 내비 아이콘이 연결되지 않았습니다.");
}
if (!styles.includes("min-height: calc(var(--family-nav-height") || !styles.includes("env(safe-area-inset-bottom)")) {
  errors.push("48px 이상 하단 내비 높이 또는 safe-area 처리가 없습니다.");
}
const requiredSettingsIds = [
  "installAppButton",
  "checkUpdateButton",
  "stableInstallLink",
  "familyAppsList",
  "supportLink",
  "privacyLink",
  "analyticsConsentToggle",
  "familySpecVersionText",
  "deploymentProviderText"
];
if (requiredSettingsIds.some((id) => !html.includes(`id="${id}"`))) {
  errors.push("패밀리 설정의 설치·5앱·지원·개인정보·앱 메타 흐름이 불완전합니다.");
}
if (!familySettings.sections.includes("install-and-update") || !familySettings.sections.includes("app-meta")) {
  errors.push("생성된 설정 계약에 필수 패밀리 섹션이 없습니다.");
}
if (!familyShell.includes('addEventListener("beforeinstallprompt"') || !familyShell.includes("navigator.standalone") || !familyShell.includes("홈 화면에 추가")) {
  errors.push("자체 PWA 설치 CTA의 beforeinstallprompt 또는 iOS fallback이 없습니다.");
}
if (!familyAnalytics.includes("let provider = null") || !familyAnalytics.includes("if (!contract.events.includes(eventName) || !getConsent() || !provider) return false")) {
  errors.push("개인정보 최소 분석 adapter가 기본 noop·동의 확인을 보장하지 않습니다.");
}
if (!html.includes("실행 중일 때만") || !html.includes("서버 푸시는 제공하지 않습니다")) {
  errors.push("웹 알림이 실행 중에만 확인된다는 한계 안내가 정확하지 않습니다.");
}
for (const [name, source] of [["family-analytics.js", familyAnalytics], ["family-shell.js", familyShell]]) {
  if (!source.startsWith("// ")) errors.push(`${name} 첫 줄에 한국어 역할 주석이 없습니다.`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`정적 검증 통과: featured ${featured.length}, schedule ${schedule.length}, 총 ${all.length}개`);
if (warn.length > 0) console.warn(`경고:\n- ${warn.join("\n- ")}`);
