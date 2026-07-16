// 패밀리 분석 어댑터의 기본 비동의 noop과 최소 payload 전송을 검증한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function createContext() {
  const storage = new Map();
  const meta = new Map([
    ["application-version", "0.17.0"],
    ["robom-family-spec-version", "1.0.0"]
  ]);
  const context = {
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000017" },
    document: {
      querySelector: (selector) => {
        const name = selector.match(/meta\[name="([^"]+)"\]/)?.[1];
        return name && meta.has(name) ? { content: meta.get(name) } : null;
      }
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value))
    },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: "Mozilla/5.0", standalone: false }
  };
  context.window = context;
  return context;
}

test("기본 비동의 또는 공급자 없음 상태에서는 이벤트를 전송하지 않는다", () => {
  const context = createContext();
  vm.runInNewContext(readFileSync(new URL("../generated/robom-family/analytics-events.js", import.meta.url), "utf8"), context);
  vm.runInNewContext(readFileSync(new URL("../outputs/pushrun-site/family-analytics.js", import.meta.url), "utf8"), context);
  const analytics = context.RobomFamilyAnalytics;
  assert.equal(analytics.getConsent(), false);
  assert.equal(analytics.track("race_search_used", { surface: "home" }), false);
  analytics.setConsent(true);
  assert.equal(analytics.track("race_search_used", { surface: "home" }), false);
});

test("동의와 공급자가 있을 때 계약의 최소 필드만 비동기로 전달한다", async () => {
  const context = createContext();
  vm.runInNewContext(readFileSync(new URL("../generated/robom-family/analytics-events.js", import.meta.url), "utf8"), context);
  vm.runInNewContext(readFileSync(new URL("../outputs/pushrun-site/family-analytics.js", import.meta.url), "utf8"), context);
  const received = [];
  const analytics = context.RobomFamilyAnalytics;
  analytics.setConsent(true);
  analytics.registerProvider({ track: (payload) => received.push(payload) });

  assert.equal(analytics.track("official_registration_clicked", { surface: "home", detail: "discard-me" }), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(received.length, 1);
  assert.deepEqual(Object.keys(received[0]).sort(), [
    "anonymous_id",
    "app_id",
    "app_version",
    "campaign",
    "event_name",
    "family_spec_version",
    "platform",
    "session_kind",
    "surface",
    "timestamp"
  ]);
  assert.equal(received[0].app_version, "0.17.0");
  assert.equal(received[0].detail, undefined);
});

test("공급자 실패는 앱 흐름으로 전파되지 않는다", async () => {
  const context = createContext();
  vm.runInNewContext(readFileSync(new URL("../generated/robom-family/analytics-events.js", import.meta.url), "utf8"), context);
  vm.runInNewContext(readFileSync(new URL("../outputs/pushrun-site/family-analytics.js", import.meta.url), "utf8"), context);
  const analytics = context.RobomFamilyAnalytics;
  analytics.setConsent(true);
  analytics.registerProvider({ track: () => { throw new Error("provider-down"); } });
  assert.doesNotThrow(() => analytics.track("race_opened", { surface: "home" }));
  await new Promise((resolve) => setImmediate(resolve));
});
