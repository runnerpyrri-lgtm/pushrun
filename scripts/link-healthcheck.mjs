// 대회 접수 링크(등록 URL·출처 상세 URL)에 실제 네트워크 요청을 보내 죽은 링크(404 등)와
// 리다이렉트를 찾는다. 네트워크가 필요하므로 CI 전용이며 오프라인 npm test에는 포함하지 않는다.
// 순수 판정 로직은 link-healthcheck-core.mjs 에 분리해 오프라인에서도 단위 테스트한다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectRegistrationLinks,
  parseLinkUrl,
  classifyLinkStatus,
  summarizeHealthcheck,
} from "./link-healthcheck-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const dataPath = resolve(root, argValue("--data", "outputs/pushrun-site/races.json"));
const outPath = resolve(root, argValue("--out", "outputs/link-healthcheck-report.json"));
const timeoutMs = 10_000;
const concurrency = 8;

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const links = collectRegistrationLinks(data);

async function checkOne(link) {
  const parsed = parseLinkUrl(link.url);
  if (!parsed) {
    return { ...link, ...classifyLinkStatus({ error: "URL 형식 오류" }) };
  }
  try {
    let response;
    try {
      response = await fetch(parsed, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      // 일부 서버는 HEAD를 지원하지 않는다(405/501) — 이 경우 GET으로 재확인한다.
      if (response.status === 405 || response.status === 501) {
        response = await fetch(parsed, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      }
    } catch {
      response = await fetch(parsed, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    }
    return {
      ...link,
      ...classifyLinkStatus({ status: response.status, redirected: response.redirected, finalUrl: response.url }),
      finalUrl: response.url,
    };
  } catch (error) {
    return { ...link, ...classifyLinkStatus({ error: error?.message || String(error) }) };
  }
}

// 동시 실행 개수를 제한해 외부 서버(신청 사이트)에 과부하를 주지 않는다.
async function runPool(items, size, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
  return results;
}

const results = await runPool(links, concurrency, checkOne);
const summary = summarizeHealthcheck(results);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ checkedAt: new Date().toISOString(), summary, results }, null, 2));

console.log(
  `링크 헬스체크: 총 ${summary.total}개 중 정상 ${summary.healthy}개, 죽은 링크 ${summary.dead}개, 리다이렉트 ${summary.redirected}개`
);
if (summary.deadLinks.length > 0) {
  console.error("죽은 링크:");
  for (const dead of summary.deadLinks) {
    console.error(`- [${dead.field}] ${dead.url} (${dead.reason}) — ${dead.races.join(", ")}`);
  }
}
if (summary.dead > 0) process.exitCode = 1;
