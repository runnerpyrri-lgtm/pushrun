// 사용자 동의와 공급자 유무를 확인한 뒤 최소 필드만 전달하는 패밀리 분석 어댑터다.
(function createFamilyAnalytics(root) {
  const CONSENT_KEY = "robom:analytics-consent:v1";
  const ANONYMOUS_ID_KEY = "robom:analytics-anonymous-id:v1";
  const contract = root.RobomFamilyAnalyticsContract || { appId: "runningbom", events: [], forbiddenFields: [] };
  let provider = null;
  let memoryConsent = false;

  function readStorage(key) {
    try {
      return root.localStorage?.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function writeStorage(key, value) {
    try {
      root.localStorage?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      root.localStorage?.removeItem(key);
    } catch {
      // 저장소가 차단된 환경에서는 메모리 상태만 사용한다.
    }
  }

  function getMeta(name, fallback = "") {
    return root.document?.querySelector(`meta[name="${name}"]`)?.content || fallback;
  }

  function getConsent() {
    const stored = readStorage(CONSENT_KEY);
    if (stored === "granted") return true;
    if (stored === "denied") return false;
    return memoryConsent;
  }

  function setConsent(granted) {
    memoryConsent = granted === true;
    writeStorage(CONSENT_KEY, memoryConsent ? "granted" : "denied");
    if (!memoryConsent) removeStorage(ANONYMOUS_ID_KEY);
    return memoryConsent;
  }

  function anonymousId() {
    const existing = readStorage(ANONYMOUS_ID_KEY);
    if (existing) return existing;
    const value = root.crypto?.randomUUID?.() || `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    writeStorage(ANONYMOUS_ID_KEY, value);
    return value;
  }

  function platform() {
    const userAgent = String(root.navigator?.userAgent || "").toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
    if (userAgent.includes("android")) return "android";
    return "web";
  }

  function sessionKind() {
    const standalone = root.matchMedia?.("(display-mode: standalone)")?.matches || root.navigator?.standalone === true;
    return standalone ? "standalone" : "browser";
  }

  function registerProvider(nextProvider) {
    provider = nextProvider && typeof nextProvider.track === "function" ? nextProvider : null;
    return Boolean(provider);
  }

  function track(eventName, context = {}) {
    if (!contract.events.includes(eventName) || !getConsent() || !provider) return false;
    const surface = ["home", "alerts", "settings"].includes(context.surface) ? context.surface : "home";
    const payload = Object.freeze({
      event_name: eventName,
      app_id: contract.appId,
      app_version: getMeta("application-version", "unknown"),
      platform: platform(),
      surface,
      session_kind: sessionKind(),
      anonymous_id: anonymousId(),
      timestamp: new Date().toISOString(),
      campaign: "",
      family_spec_version: getMeta("robom-family-spec-version", "unknown")
    });
    Promise.resolve()
      .then(() => provider.track(payload))
      .catch(() => undefined);
    return true;
  }

  root.RobomFamilyAnalytics = Object.freeze({
    getConsent,
    hasProvider: () => Boolean(provider),
    registerProvider,
    setConsent,
    track
  });
})(window);
