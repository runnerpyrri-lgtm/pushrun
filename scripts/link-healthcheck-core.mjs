// 대회 접수 링크 헬스체크의 순수 로직(링크 추출·URL 파싱·상태 판정)만 담는다.
// 네트워크 요청은 하지 않으므로 오프라인에서도 단위 테스트할 수 있다. 실제 요청은
// link-healthcheck.mjs 가 이 모듈의 함수만 사용해 수행한다.

// validate-static.mjs 가 형식 검증에 쓰는 필드와 동일하게 맞춘다(접수 URL, 출처 상세 URL).
export const LINK_FIELDS = ["registrationUrl", "sourceDetailUrl"];

// races.json(featuredRaces + scheduleFeed)에서 점검 대상 링크를 뽑는다.
// 같은 URL을 여러 대회가 공유하면 한 번만 점검하되, 어떤 대회들이 이 링크를 쓰는지는 보존한다.
export function collectRegistrationLinks(data) {
  const featured = Array.isArray(data?.featuredRaces) ? data.featuredRaces : [];
  const schedule = Array.isArray(data?.scheduleFeed) ? data.scheduleFeed : [];
  const byUrl = new Map();
  for (const race of [...featured, ...schedule]) {
    for (const field of LINK_FIELDS) {
      const url = race?.[field];
      if (!url || typeof url !== "string") continue;
      if (!byUrl.has(url)) byUrl.set(url, { url, field, races: [] });
      byUrl.get(url).races.push(race.name || "이름 없음");
    }
  }
  return [...byUrl.values()];
}

// URL 문자열이 http(s) 스킴의 유효한 URL이면 URL 객체를, 아니면 null을 반환한다.
export function parseLinkUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

// 네트워크 요청 결과(상태 코드·리다이렉트 여부·오류)만 받아 링크 생/사를 순수하게 판정한다.
// - 2xx~3xx(추적 후 최종 상태)면 정상. 리다이렉트가 있었다면 reason에 남긴다(도메인 이전 감지용).
// - 404/410만 "없는 페이지"로 확정한다. 인증 차단·요청 제한·서버 장애·네트워크 실패는
//   외부 사이트의 일시 상태일 수 있으므로 unknown으로 남겨 수집 결과를 함부로 삭제하지 않는다.
export function classifyLinkStatus({ status, redirected, finalUrl, error } = {}) {
  if (error) return { healthy: false, unknown: true, state: "unknown", redirected: Boolean(redirected), reason: `요청 실패: ${error}` };
  if (typeof status !== "number" || Number.isNaN(status)) {
    return { healthy: false, unknown: true, state: "unknown", redirected: Boolean(redirected), reason: "상태 코드 없음" };
  }
  const redirectNote = redirected ? ` (리다이렉트됨 → ${finalUrl || "알 수 없는 주소"})` : "";
  if (status >= 200 && status < 400) {
    return { healthy: true, unknown: false, state: "healthy", redirected: Boolean(redirected), reason: `${status}${redirectNote}` };
  }
  if (status === 404 || status === 410) {
    return { healthy: false, unknown: false, state: "dead", redirected: Boolean(redirected), reason: `${status} 없는 페이지${redirectNote}` };
  }
  return { healthy: false, unknown: true, state: "unknown", redirected: Boolean(redirected), reason: `${status} 외부 확인 필요${redirectNote}` };
}

// 개별 점검 결과 배열을 집계해 리포트 요약을 만든다.
export function summarizeHealthcheck(results) {
  const list = Array.isArray(results) ? results : [];
  const deadLinks = list.filter((result) => result.state === "dead");
  const unknownLinks = list.filter((result) => result.state === "unknown");
  const redirectedLinks = list.filter((result) => result.redirected);
  return {
    total: list.length,
    healthy: list.filter((result) => result.state === "healthy").length,
    dead: deadLinks.length,
    unknown: unknownLinks.length,
    redirected: redirectedLinks.length,
    deadLinks,
    unknownLinks,
  };
}
