// 중앙 패밀리 메타데이터와 PWA 설치·업데이트·분석 동의 설정을 화면에 연결한다.
(function initializeFamilyShell(root) {
  const script = root.document.currentScript;
  const metaUrl = script?.dataset.familyMetaUrl || "./family/app-meta.json";
  const iconUrl = "./family/icons.svg";
  let deferredInstallPrompt = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function icon(name) {
    return `<svg class="family-line-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${iconUrl}#family-icon-${name}"></use></svg>`;
  }

  function setText(id, value) {
    const target = root.document.getElementById(id);
    if (target) target.textContent = value;
  }

  function setLink(id, value) {
    const target = root.document.getElementById(id);
    const href = safeHttpsUrl(value);
    if (target && href) target.href = href;
  }

  function renderFamilyApps(meta) {
    const target = root.document.getElementById("familyAppsList");
    if (!target || !Array.isArray(meta.familyApps)) return;
    // 스토어 출시 전이라 형제 앱은 준비 중 안내와 로봄 안정 설치 경로(robom.kr/get)만 노출한다.
    target.innerHTML = meta.familyApps
      .filter((app) => app.id !== meta.id)
      .map((app) => {
        const href = safeHttpsUrl(app.installUrl);
        return `<a class="settings-row" data-family-app="${escapeHtml(app.id)}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span class="settings-row-icon" aria-hidden="true">${icon("family")}</span><span><strong>${escapeHtml(app.name)}</strong><small>준비 중 · 2026년 8월 초 출시 예정</small></span><em>준비 중</em></a>`;
      })
      .join("");
  }

  function renderFamilyMeta(meta) {
    renderFamilyApps(meta);
    setLink("supportLink", meta.supportUrl);
    setLink("privacyLink", meta.privacyUrl);
    setText("familySpecVersionText", meta.familySpecVersion || "확인 전");
    setText("lastVerifiedText", meta.lastVerifiedAt || "확인 전");
    setText("appMetaLastVerifiedText", meta.lastVerifiedAt || "확인 전");
    setText("deploymentProviderText", meta.deployProvider || "확인 전");
    const status = root.document.getElementById("familyMetaStatus");
    if (status) status.hidden = true;
  }

  async function loadFamilyMeta() {
    try {
      const response = await root.fetch(metaUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("family-meta-load-failed");
      const meta = await response.json();
      if (meta.id !== "runningbom" || !Array.isArray(meta.familyApps) || meta.familyApps.length !== 4) {
        throw new Error("family-meta-invalid");
      }
      renderFamilyMeta(meta);
    } catch {
      const status = root.document.getElementById("familyMetaStatus");
      if (status) {
        status.hidden = false;
        status.textContent = "패밀리 앱 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.";
      }
    }
  }

  async function checkForUpdate() {
    const button = root.document.getElementById("checkUpdateButton");
    const status = root.document.getElementById("updateStatusText");
    if (!button || !status) return;
    button.disabled = true;
    status.textContent = "업데이트를 확인하고 있습니다.";
    try {
      if (!("serviceWorker" in root.navigator)) throw new Error("service-worker-unsupported");
      const registration = await root.navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("service-worker-not-ready");
      await registration.update();
      status.textContent = registration.waiting
        ? "새 버전이 준비됐습니다. 잠시 후 화면이 새로고침됩니다."
        : "현재 배포된 최신 버전을 확인했습니다.";
    } catch {
      status.textContent = "자동 확인을 완료하지 못했어요. 네트워크 연결 후 화면을 새로고침해 주세요.";
    } finally {
      button.disabled = false;
    }
  }

  function renderAnalyticsConsent() {
    const toggle = root.document.getElementById("analyticsConsentToggle");
    const status = root.document.getElementById("analyticsConsentStatus");
    const analytics = root.RobomFamilyAnalytics;
    if (!toggle || !status || !analytics) return;
    toggle.checked = analytics.getConsent();
    const updateStatus = () => {
      if (!toggle.checked) {
        status.textContent = "기본값은 꺼짐이며 분석 이벤트를 전송하지 않습니다.";
      } else if (!analytics.hasProvider()) {
        status.textContent = "동의는 저장됐지만 현재 연결된 분석 공급자가 없어 전송되는 데이터는 없습니다.";
      } else {
        status.textContent = "동의한 최소 익명 이벤트만 전송합니다. 검색어·위치·연락처는 보내지 않습니다.";
      }
    };
    toggle.addEventListener("change", () => {
      analytics.setConsent(toggle.checked);
      updateStatus();
    });
    updateStatus();
  }

  // 스토어 출시 전이라 설치 유도 UI는 노출하지 않지만, beforeinstallprompt를 가로채는
  // PWA·TWA 플러밍은 유지해 브라우저 기본 설치 배너를 억제한다.
  root.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });
  root.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });

  root.document.getElementById("checkUpdateButton")?.addEventListener("click", checkForUpdate);
  renderAnalyticsConsent();
  void loadFamilyMeta();
})(window);
