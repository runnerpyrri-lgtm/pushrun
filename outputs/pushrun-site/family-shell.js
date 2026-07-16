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
    target.innerHTML = meta.familyApps
      .map((app) => {
        const href = safeHttpsUrl(app.installUrl || app.webUrl);
        const current = app.id === meta.id;
        return `<a class="settings-row" data-family-app="${escapeHtml(app.id)}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span class="settings-row-icon" aria-hidden="true">${icon("family")}</span><span><strong>${escapeHtml(app.name)}</strong><small>${current ? "현재 사용 중인 앱" : "안정 설치 경로 열기"}</small></span><em>${current ? "현재 앱" : "설치 안내"}</em></a>`;
      })
      .join("");
  }

  function renderFamilyMeta(meta) {
    renderFamilyApps(meta);
    setLink("stableInstallLink", meta.stableInstallUrl);
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
      if (meta.id !== "runningbom" || !Array.isArray(meta.familyApps) || meta.familyApps.length !== 5) {
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

  function isStandalone() {
    return root.matchMedia?.("(display-mode: standalone)")?.matches || root.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(root.navigator.userAgent) || (root.navigator.platform === "MacIntel" && root.navigator.maxTouchPoints > 1);
  }

  function renderInstallState(message = "") {
    const button = root.document.getElementById("installAppButton");
    const status = root.document.getElementById("installStatusText");
    if (!button || !status) return;
    button.disabled = false;
    if (isStandalone()) {
      button.textContent = "설치됨";
      button.disabled = true;
      status.textContent = message || "러닝봄이 홈 화면 앱으로 실행 중입니다.";
    } else if (deferredInstallPrompt) {
      button.textContent = "러닝봄 설치";
      status.textContent = message || "이 기기에 러닝봄을 앱처럼 설치할 수 있습니다.";
    } else if (isIos()) {
      button.textContent = "iPhone 설치 방법";
      status.textContent = message || "Safari에서 홈 화면에 추가할 수 있습니다.";
    } else {
      button.textContent = "설치 방법 보기";
      status.textContent = message || "설치 지원 브라우저에서는 주소창이나 메뉴에서 앱 설치를 선택할 수 있습니다.";
    }
  }

  async function requestInstall() {
    if (isStandalone()) return;
    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        renderInstallState(choice?.outcome === "accepted" ? "설치 요청을 완료했습니다." : "설치를 취소했습니다. 원할 때 다시 시도할 수 있습니다.");
      } catch {
        renderInstallState("설치 창을 열지 못했어요. 브라우저 메뉴의 앱 설치를 이용해 주세요.");
      }
      return;
    }
    if (isIos()) {
      renderInstallState("Safari의 공유 메뉴를 열고 홈 화면에 추가를 선택하세요.");
      return;
    }
    renderInstallState("브라우저 주소창 또는 메뉴에서 앱 설치나 홈 화면에 추가를 선택하세요.");
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

  root.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstallState();
  });
  root.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    renderInstallState("러닝봄 설치를 완료했습니다.");
  });

  root.document.getElementById("installAppButton")?.addEventListener("click", requestInstall);
  root.document.getElementById("checkUpdateButton")?.addEventListener("click", checkForUpdate);
  renderInstallState();
  renderAnalyticsConsent();
  void loadFamilyMeta();
})(window);
