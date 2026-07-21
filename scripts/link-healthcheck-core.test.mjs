// 링크 헬스체크 순수 로직(추출·파싱·판정) 검증. 네트워크를 쓰지 않아 오프라인에서도 돈다.
import test from "node:test";
import assert from "node:assert/strict";
import { collectRegistrationLinks, parseLinkUrl, classifyLinkStatus, summarizeHealthcheck } from "./link-healthcheck-core.mjs";

test("collectRegistrationLinks: featured·schedule에서 registrationUrl·sourceDetailUrl을 모은다", () => {
  const data = {
    featuredRaces: [
      { name: "A대회", registrationUrl: "https://a.example.com/apply", sourceDetailUrl: "https://a.example.com/detail" },
    ],
    scheduleFeed: [
      { name: "B대회", registrationUrl: "https://b.example.com/apply" },
    ],
  };
  const links = collectRegistrationLinks(data);
  assert.equal(links.length, 3);
  assert.ok(links.some((link) => link.url === "https://a.example.com/apply" && link.field === "registrationUrl"));
  assert.ok(links.some((link) => link.url === "https://a.example.com/detail" && link.field === "sourceDetailUrl"));
});

test("collectRegistrationLinks: 같은 URL을 여러 대회가 공유하면 한 번만 점검하고 대회명을 모은다", () => {
  const data = {
    featuredRaces: [{ name: "A대회", registrationUrl: "https://shared.example.com/apply" }],
    scheduleFeed: [{ name: "B대회", registrationUrl: "https://shared.example.com/apply" }],
  };
  const links = collectRegistrationLinks(data);
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].races, ["A대회", "B대회"]);
});

test("collectRegistrationLinks: URL 필드가 없거나 배열이 없어도 죽지 않는다", () => {
  assert.deepEqual(collectRegistrationLinks({}), []);
  assert.deepEqual(collectRegistrationLinks({ featuredRaces: [{ name: "이름만" }] }), []);
});

test("parseLinkUrl: http·https만 유효하고 그 외는 null", () => {
  assert.ok(parseLinkUrl("https://example.com/apply") instanceof URL);
  assert.ok(parseLinkUrl("http://example.com/apply") instanceof URL);
  assert.equal(parseLinkUrl("ftp://example.com/apply"), null);
  assert.equal(parseLinkUrl("이건 URL이 아님"), null);
  assert.equal(parseLinkUrl(""), null);
  assert.equal(parseLinkUrl(undefined), null);
});

test("classifyLinkStatus: 2xx는 정상", () => {
  const result = classifyLinkStatus({ status: 200, redirected: false });
  assert.equal(result.healthy, true);
  assert.equal(result.redirected, false);
});

test("classifyLinkStatus: 리다이렉트 후 최종 200이면 정상이지만 redirected 플래그와 사유에 남긴다", () => {
  const result = classifyLinkStatus({ status: 200, redirected: true, finalUrl: "https://moved.example.com/apply" });
  assert.equal(result.healthy, true);
  assert.equal(result.redirected, true);
  assert.match(result.reason, /리다이렉트됨/);
  assert.match(result.reason, /moved\.example\.com/);
});

test("classifyLinkStatus: 404·410은 죽은 링크로 판정", () => {
  assert.equal(classifyLinkStatus({ status: 404 }).healthy, false);
  assert.equal(classifyLinkStatus({ status: 410 }).healthy, false);
  assert.match(classifyLinkStatus({ status: 404 }).reason, /404/);
});

test("classifyLinkStatus: 4xx·5xx는 죽은 링크로 판정", () => {
  assert.equal(classifyLinkStatus({ status: 403 }).healthy, false);
  assert.equal(classifyLinkStatus({ status: 500 }).healthy, false);
  assert.equal(classifyLinkStatus({ status: 503 }).healthy, false);
});

test("classifyLinkStatus: 네트워크 오류·상태 코드 없음도 죽은 링크로 판정", () => {
  const errorResult = classifyLinkStatus({ error: "fetch failed: getaddrinfo ENOTFOUND" });
  assert.equal(errorResult.healthy, false);
  assert.match(errorResult.reason, /요청 실패/);

  const missingResult = classifyLinkStatus({});
  assert.equal(missingResult.healthy, false);
});

test("summarizeHealthcheck: 정상·죽은 링크·리다이렉트 개수를 집계한다", () => {
  const results = [
    { url: "https://ok.example.com", healthy: true, redirected: false },
    { url: "https://redirected.example.com", healthy: true, redirected: true },
    { url: "https://dead.example.com", healthy: false, redirected: false, reason: "404 없는 페이지" },
  ];
  const summary = summarizeHealthcheck(results);
  assert.equal(summary.total, 3);
  assert.equal(summary.healthy, 2);
  assert.equal(summary.dead, 1);
  assert.equal(summary.redirected, 1);
  assert.equal(summary.deadLinks.length, 1);
  assert.equal(summary.deadLinks[0].url, "https://dead.example.com");
});

test("summarizeHealthcheck: 빈 배열·비배열 입력도 안전하게 처리한다", () => {
  assert.deepEqual(summarizeHealthcheck([]), { total: 0, healthy: 0, dead: 0, redirected: 0, deadLinks: [] });
  assert.deepEqual(summarizeHealthcheck(undefined), { total: 0, healthy: 0, dead: 0, redirected: 0, deadLinks: [] });
});
