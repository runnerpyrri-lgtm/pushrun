// 외부 일정 페이지를 결정론적으로 정규화하고, 검증된 값만 기존 대회 데이터에 반영한다.
const KST_OFFSET = "+09:00";

export const MARATHONGO_DOMESTIC_URL = "https://marathongo.co.kr/raceSchedule/domestic";

const REGION_NAMES = new Set([
  "서울", "경기", "인천", "강원", "충북", "충남", "세종", "대전", "전북", "전남",
  "광주", "경북", "경남", "대구", "울산", "부산", "제주",
]);

function decodeEntities(value) {
  return String(value)
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'");
}

export function htmlLines(html) {
  return decodeEntities(String(html))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

export function extractMarathonGoDetailUrls(html) {
  const urls = new Set();
  for (const match of String(html).matchAll(/href=["']([^"']*\/raceDetail\/domestic\/[^"'#?]+)[^"']*["']/gi)) {
    try {
      urls.add(new URL(match[1], "https://marathongo.co.kr").toString());
    } catch {
      // 잘못된 외부 링크는 수집 대상에서 제외한다.
    }
  }
  return [...urls].sort();
}

function validUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseJsonLdArticle(html) {
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1]));
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const article = candidates.find((item) => item?.["@type"] === "Article" && typeof item.description === "string");
      if (article) return article;
    } catch {
      // 구조화 데이터가 깨졌으면 페이지 본문만으로 보수적으로 처리한다.
    }
  }
  return null;
}

export function parseKoreanDate(value) {
  const match = String(value).match(/(20\d{2})[.\-/년\s]+\s*(\d{1,2})[.\-/월\s]+\s*(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00${KST_OFFSET}`)) ? null : iso;
}

export function parseDateRange(value) {
  const matches = [...String(value).matchAll(/20\d{2}[.\-/년\s]+\s*\d{1,2}[.\-/월\s]+\s*\d{1,2}/g)]
    .map((match) => parseKoreanDate(match[0]))
    .filter(Boolean);
  if (matches.length < 2) return null;
  const [start, end] = matches;
  if (start > end) return null;
  return { start, end };
}

function dateAtStart(date) {
  return `${date}T00:00:00${KST_OFFSET}`;
}

function dateAtEnd(date) {
  return `${date}T23:59:00${KST_OFFSET}`;
}

function normaliseDistance(value) {
  const text = String(value).trim();
  if (/^10\s*(?:km|k)$/i.test(text)) return "10K";
  if (/^5\s*(?:km|k)$/i.test(text)) return "5K";
  if (/^(?:half|하프)/i.test(text)) return "Half";
  if (/^(?:full|풀)/i.test(text)) return "Full";
  if (/trail|트레일/i.test(text)) return "Trail";
  return text;
}

function normaliseName(name) {
  return String(name)
    .toLowerCase()
    .replace(/제\s*\d+회/g, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/marathon|race|trail|run/g, "")
    .replace(/마라톤대회|마라톤|트레일런|트레일|레이스/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function raceIdentity(race) {
  return `${normaliseName(race?.name)}|${String(race?.raceDate ?? race?.date ?? "").slice(0, 10)}`;
}

export function statusFromRegistrationPeriod(startAt, endAt, now = Date.now(), fallback = "unknown") {
  if (["cancelled", "sold_out"].includes(fallback)) return fallback;
  const start = Date.parse(startAt || "");
  const end = Date.parse(endAt || "");
  if (Number.isFinite(end) && end < now) return "closed";
  if (Number.isFinite(start) && start > now) return "scheduled";
  if (Number.isFinite(start) && (!Number.isFinite(end) || end >= now)) return "open";
  return fallback || "unknown";
}

function schemaDetails(article) {
  const parts = String(article?.description || "")
    .split("\n")[0]
    .split("|")
    .map((part) => part.trim());
  if (parts.length < 7) return {};
  return {
    organizer: parts[4] || undefined,
    registrationUrl: validUrl(parts[6]),
  };
}

// 마라톤GO의 공개 상세 페이지에서 실제로 확인되는 항목만 읽는다. 시각이 없는 날짜는
// 자정/23:59 경계로 표현하고 timeConfirmed=false를 유지해 정확한 시각으로 위장하지 않는다.
export function parseMarathonGoDetail(html, sourceDetailUrl, checkedAt = new Date().toISOString()) {
  const lines = htmlLines(html);
  const dateIndex = lines.findIndex((line) => /^20\d{2}-\d{2}-\d{2}$/.test(line));
  if (dateIndex < 0) return null;
  const raceDate = lines[dateIndex];
  const regionIndex = [...Array(dateIndex).keys()].reverse().find((index) => REGION_NAMES.has(lines[index]));
  if (regionIndex === undefined || regionIndex + 2 >= dateIndex) return null;
  const shareIndex = lines.lastIndexOf("공유하기", regionIndex);
  const distances = lines
    .slice(shareIndex >= 0 ? shareIndex + 1 : Math.max(0, regionIndex - 6), regionIndex)
    .map(normaliseDistance)
    .filter((distance) => distance && distance.length <= 20);
  const periodIndex = lines.findIndex((line) => line === "접수 기간" || line === "접수기간");
  const period = periodIndex >= 0 ? parseDateRange(lines[periodIndex + 1]) : null;
  if (!period || !lines[dateIndex - 1] || distances.length === 0) return null;
  const article = parseJsonLdArticle(html);
  const articleValues = schemaDetails(article);
  const name = String(article?.name || lines[9] || "").replace(/\s*\|\s*마라톤GO\s*$/i, "").trim();
  if (!name) return null;
  return {
    name,
    date: raceDate,
    time: lines[dateIndex + 1] || "시간 미확인",
    region: lines[regionIndex],
    venue: lines[dateIndex - 1],
    distances: [...new Set(distances)],
    registrationOpenAt: dateAtStart(period.start),
    registrationCloseAt: dateAtEnd(period.end),
    registrationOpenTimeConfirmed: false,
    registrationPeriodLabel: `${period.start.slice(5).replace("-", "/")} - ${period.end.slice(5).replace("-", "/")}`,
    registrationPeriodSource: "마라톤GO 공개 일정 상세",
    registrationUrl: articleValues.registrationUrl || undefined,
    sourceDetailUrl: validUrl(sourceDetailUrl),
    sourceName: "마라톤GO",
    organizer: articleValues.organizer,
    dataVerifiedAt: checkedAt,
  };
}

function hasOfficialOrPreciseSchedule(current) {
  return current?.registrationOpenTimeConfirmed === true || /공식/.test(String(current?.sourceName || ""));
}

function isMarathonGoManaged(current) {
  return current?.sourceName === "마라톤GO" || /(^|\.)marathongo\.co\.kr\//.test(String(current?.sourceDetailUrl || ""));
}

function mergeOne(current, discovered, now) {
  const next = { ...current };
  // 공식 페이지 또는 정확한 접수 시각이 이미 있으면, 포털의 날짜 단위 정보가 이를 덮지 않는다.
  const fields = hasOfficialOrPreciseSchedule(current)
    ? ["dataVerifiedAt"]
    : [
        "name", "date", "time", "region", "venue", "distances", "registrationOpenAt", "registrationCloseAt",
        "registrationOpenTimeConfirmed", "registrationPeriodLabel", "registrationPeriodSource", "sourceDetailUrl",
        "sourceName", "organizer", "dataVerifiedAt",
      ];
  for (const field of fields) {
    if (discovered[field] !== undefined && discovered[field] !== null && discovered[field] !== "") next[field] = discovered[field];
  }
  // 기존에 직접 확인한 공식 신청 URL은 마라톤GO의 소개 URL보다 우선한다.
  if (!next.registrationUrl && discovered.registrationUrl) next.registrationUrl = discovered.registrationUrl;
  next.status = statusFromRegistrationPeriod(next.registrationOpenAt, next.registrationCloseAt, now, current.status);
  // 동일한 출처 값이 다시 수집된 경우에는 확인 시각만 바꾸지 않는다. 그래야 6시간 점검이
  // 변경 없는 커밋을 만들지 않고, 실제 값 또는 상태가 달라진 경우에만 데이터 revision이 올라간다.
  const previousComparable = { ...current };
  const nextComparable = { ...next };
  delete previousComparable.dataVerifiedAt;
  delete nextComparable.dataVerifiedAt;
  if (stableJson(previousComparable) === stableJson(nextComparable) && current.dataVerifiedAt) {
    next.dataVerifiedAt = current.dataVerifiedAt;
  }
  return next;
}

function createScheduleRace(discovered, now) {
  return {
    ...discovered,
    status: statusFromRegistrationPeriod(discovered.registrationOpenAt, discovered.registrationCloseAt, now),
    courseLabel: discovered.distances.join(","),
    linkVerifiedFrom: "마라톤GO 공개 일정 상세",
  };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function kstDate(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

function isCurrentOrFutureRace(race, today) {
  return String(race?.raceDate ?? race?.date ?? "").slice(0, 10) >= today;
}

// 기존 출처의 데이터를 지우지 않고, 신뢰 가능한 마라톤GO 상세에서 확인된 항목만 병합한다.
// 신규 항목은 날짜·장소·거리·접수 기간이 모두 있을 때에만 scheduleFeed로 게시한다.
export function mergeMarathonGoDiscoveries(data, discoveries, { now = Date.now(), checkedAt = new Date().toISOString() } = {}) {
  const currentFeatured = Array.isArray(data?.featuredRaces) ? data.featuredRaces : [];
  const currentSchedule = Array.isArray(data?.scheduleFeed) ? data.scheduleFeed : [];
  const today = kstDate(now);
  const validDiscoveries = discoveries.filter(Boolean).filter((race) => isCurrentOrFutureRace(race, today));
  const byIdentity = new Map(validDiscoveries.map((race) => [raceIdentity(race), race]));
  const byDetailUrl = new Map(validDiscoveries.map((race) => [race.sourceDetailUrl, race]));
  const mergeRows = (rows, { discover = true } = {}) => rows.map((row) => {
    const discovery = discover && isMarathonGoManaged(row)
      ? byDetailUrl.get(row.sourceDetailUrl) || byIdentity.get(raceIdentity(row))
      : null;
    const next = discovery && discover ? mergeOne(row, discovery, now) : { ...row };
    if (!discovery) {
      next.status = statusFromRegistrationPeriod(next.registrationOpenAt, next.registrationCloseAt, now, row.status);
    }
    return next;
  });
  // featured는 사람이 공식 출처를 교차 확인해 선택한 영역이므로 자동 수집은 상태 갱신만 한다.
  const featuredRaces = mergeRows(currentFeatured, { discover: false }).filter((race) => isCurrentOrFutureRace(race, today));
  const scheduleFeed = mergeRows(currentSchedule).filter((race) => isCurrentOrFutureRace(race, today));
  const existing = new Set([...featuredRaces, ...scheduleFeed].map(raceIdentity));
  for (const discovery of validDiscoveries) {
    const identity = raceIdentity(discovery);
    if (!existing.has(identity)) {
      scheduleFeed.push(createScheduleRace(discovery, now));
      existing.add(identity);
    }
  }
  scheduleFeed.sort((left, right) => String(left.date || left.raceDate).localeCompare(String(right.date || right.raceDate)) || String(left.name).localeCompare(String(right.name), "ko"));
  // 확인 시각은 6시간 작업마다 불필요하게 커밋하지 않고 KST 하루에 한 번만 갱신한다.
  const previousRefreshDate = data?.lastSuccessfulRefreshAt ? kstDate(data.lastSuccessfulRefreshAt) : null;
  const output = {
    ...data,
    lastSuccessfulRefreshAt: previousRefreshDate === today ? data.lastSuccessfulRefreshAt : checkedAt,
    refreshPolicy: {
      provider: "마라톤GO 공개 국내 일정",
      providerUrl: MARATHONGO_DOMESTIC_URL,
      cadence: "6시간마다 자동 확인",
      rule: "필수 필드와 정적 검증을 통과한 값만 게시",
    },
    featuredRaces,
    scheduleFeed,
  };
  const changed = stableJson(data) !== stableJson(output);
  const contentBefore = { ...data };
  const contentAfter = { ...output };
  delete contentBefore.lastSuccessfulRefreshAt;
  delete contentBefore.refreshPolicy;
  delete contentAfter.lastSuccessfulRefreshAt;
  delete contentAfter.refreshPolicy;
  const contentChanged = stableJson(contentBefore) !== stableJson(contentAfter);
  return { data: output, changed, contentChanged, summary: { discovered: validDiscoveries.length, featured: featuredRaces.length, schedule: scheduleFeed.length, refreshedDate: today } };
}
