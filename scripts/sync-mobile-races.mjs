// 웹 정본의 검증된 대회 데이터를 네이티브 오프라인 번들 형식으로 재현 가능하게 변환한다.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "outputs", "pushrun-site", "races.json");
const targetPath = join(root, "apps", "mobile", "src", "data", "races.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

function stableId(race, prefix) {
  if (race.id) return race.id;
  const sourceNumber = String(race.sourceDetailUrl ?? "").match(/[?&]no=(\d+)/)?.[1];
  if (sourceNumber) return `${prefix}-${sourceNumber}`;
  const fingerprint = createHash("sha256")
    .update(`${race.name}|${race.raceDate ?? race.date}`)
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${fingerprint}`;
}

function normalizeRace(race, prefix) {
  return {
    id: stableId(race, prefix),
    name: race.name,
    region: race.region,
    venue: race.venue,
    raceDate: String(race.raceDate ?? race.date).slice(0, 10),
    distances: race.distances,
    registrationOpensAt: race.registrationOpenAt,
    registrationClosesAt: race.registrationCloseAt ?? undefined,
    registrationTimeConfirmed: race.registrationOpenTimeConfirmed === true,
    registrationWindows: Array.isArray(race.registrationWindows)
      ? race.registrationWindows
        .filter((window) => window?.opensAt)
        .map((window) => ({
          label: window.label,
          distance: window.distance,
          opensAt: window.opensAt,
          closesAt: window.closesAt ?? undefined,
          timeConfirmed: window.timeConfirmed === true,
        }))
      : undefined,
    registrationStatus: race.status ?? "unknown",
    registrationPeriodLabel: race.registrationPeriodLabel ?? undefined,
    note: race.note ?? undefined,
    capacity: Number.isFinite(race.capacity) ? race.capacity : undefined,
    organizer: race.organizer ?? undefined,
    verifiedAt: race.registrationTimeVerifiedAt ?? race.linkVerifiedFrom ?? undefined,
    officialUrl: race.registrationUrl ?? race.sourceDetailUrl,
    externalLinkKind: race.registrationUrl ? "official" : "source",
    sourceName: race.sourceName,
  };
}

const races = [
  ...(source.featuredRaces ?? []).map((race) => normalizeRace(race, "featured")),
  ...(source.scheduleFeed ?? []).map((race) => normalizeRace(race, "schedule")),
]
  .filter((race) => race.name && race.region && race.venue && race.raceDate && race.registrationOpensAt && race.officialUrl)
  .sort((left, right) => left.raceDate.localeCompare(right.raceDate) || left.name.localeCompare(right.name, "ko"));

const output = `${JSON.stringify({
  revision: source.version,
  source: "RunningBom 웹 정본의 검증된 대회 데이터",
  races,
}, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(targetPath, "utf8");
  if (current !== output) {
    throw new Error("모바일 대회 번들이 웹 정본과 다릅니다. npm run mobile:sync를 실행하세요.");
  }
} else {
  await writeFile(targetPath, output);
  console.log(`모바일 대회 ${races.length}개를 동기화했습니다.`);
}
