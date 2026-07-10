// PushRun 정적 자산과 대회 데이터의 출시 전 필수 조건을 검증한다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "outputs", "pushrun-site");
const app = readFileSync(join(site, "app.js"), "utf8");
const html = readFileSync(join(site, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(site, "manifest.webmanifest"), "utf8"));
const data = JSON.parse(readFileSync(join(site, "races.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const errors = [];
const warn = [];
const featured = Array.isArray(data.featuredRaces) ? data.featuredRaces : [];
const schedule = Array.isArray(data.scheduleFeed) ? data.scheduleFeed : [];
const all = [...featured, ...schedule];

if (featured.length === 0) errors.push("featuredRaces가 비어 있습니다.");
if (schedule.length === 0) errors.push("scheduleFeed가 비어 있습니다.");
if (!manifest.start_url || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  errors.push("PWA manifest의 start_url 또는 icons가 없습니다.");
}

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
      if (url.protocol === "http:") warn.push(`${race.name} ${key}`);
    } catch {
      errors.push(`URL 형식 오류: ${race.name} / ${key}`);
    }
  }
}

const appVersion = app.match(/const APP_VERSION = "([^"]+)"/)?.[1];
const assetVersion = app.match(/const ASSET_VERSION = "([^"]+)"/)?.[1];
if (appVersion !== pkg.version) errors.push(`앱 버전 불일치: package=${pkg.version}, app.js=${appVersion}`);
if (!assetVersion || !html.includes(`app.js?v=${assetVersion}`) || !html.includes(`styles.css?v=${assetVersion}`)) {
  errors.push("app.js의 ASSET_VERSION과 index.html 캐시버스트가 다릅니다.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`정적 검증 통과: featured ${featured.length}, schedule ${schedule.length}, 총 ${all.length}개`);
if (warn.length > 0) console.warn(`경고: HTTPS 미지원 가능 외부 링크 ${warn.length}개`);
