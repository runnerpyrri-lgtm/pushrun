// 마라톤GO 공개 국내 일정을 저부하로 수집해 검증된 대회 데이터만 정본에 반영한다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARATHONGO_DOMESTIC_URL,
  extractMarathonGoDetailUrls,
  mergeMarathonGoDiscoveries,
  parseMarathonGoDetail,
} from "./race-data-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = resolve(root, "outputs/pushrun-site/races.json");
const reportPath = resolve(root, "outputs/race-data-refresh-report.json");
const write = process.argv.includes("--write");
const sourceIndex = process.argv.indexOf("--source");
const sourcePath = sourceIndex >= 0 ? resolve(root, process.argv[sourceIndex + 1]) : dataPath;
const limitIndex = process.argv.indexOf("--limit");
const detailLimit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : 180;
const timeoutMs = 15_000;
const concurrency = 4;
const headers = { "user-agent": "RunningBomDataSync/1.0 (+https://robom.kr)", accept: "text/html,application/xhtml+xml" };

if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 250) {
  throw new Error("--limit은 1~250 사이의 정수여야 합니다.");
}

async function fetchText(url) {
  const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { html: await response.text(), finalUrl: response.url };
}

async function runPool(items, size, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
  return output;
}

const checkedAt = new Date().toISOString();
const current = JSON.parse(readFileSync(sourcePath, "utf8"));
const catalogue = await fetchText(MARATHONGO_DOMESTIC_URL);
const detailUrls = extractMarathonGoDetailUrls(catalogue.html).slice(0, detailLimit);
if (detailUrls.length === 0) throw new Error("마라톤GO 국내 일정에서 상세 URL을 찾지 못했습니다. 기존 데이터는 변경하지 않았습니다.");

const results = await runPool(detailUrls, concurrency, async (url) => {
  try {
    const page = await fetchText(url);
    const race = parseMarathonGoDetail(page.html, page.finalUrl, checkedAt);
    return race ? { ok: true, race } : { ok: false, url, reason: "필수 일정 필드 부족" };
  } catch (error) {
    return { ok: false, url, reason: error?.message || String(error) };
  }
});

const discoveries = results.filter((result) => result.ok).map((result) => result.race);
const failures = results.filter((result) => !result.ok);
if (discoveries.length === 0) throw new Error("정규화 가능한 일정이 0건입니다. 기존 데이터는 변경하지 않았습니다.");

const merged = mergeMarathonGoDiscoveries(current, discoveries, { checkedAt });
if (merged.contentChanged) {
  const kst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", ".");
  const currentRevision = Number(String(current.version || "").match(/race-data-(\d+)$/)?.[1] || 0);
  merged.data.version = `${kst}-race-data-${currentRevision + 1}`;
}
const report = {
  checkedAt,
  source: { name: "마라톤GO 공개 국내 일정", url: catalogue.finalUrl },
  catalogueCount: detailUrls.length,
  parsedCount: discoveries.length,
  rejectedCount: failures.length,
  rejected: failures.slice(0, 30),
  changed: merged.changed,
  contentChanged: merged.contentChanged,
  summary: merged.summary,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (write) {
  writeFileSync(dataPath, `${JSON.stringify(merged.data, null, 2)}\n`);
  console.log(`대회 자동 동기화 완료: 발견 ${discoveries.length}건, 제외 ${failures.length}건, schedule ${merged.summary.schedule}건`);
} else {
  console.log(`대회 자동 동기화 미리보기: 발견 ${discoveries.length}건, 제외 ${failures.length}건, 변경 ${merged.changed ? "있음" : "없음"}`);
}
