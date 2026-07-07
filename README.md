# PushRun

러닝 대회 접수 시작 시간을 놓치지 않도록 알림을 설정하는 PushRun 웹 앱입니다.

## 편집 위치

- 메인 화면: `outputs/pushrun-site/index.html`
- 동작/대회 데이터: `outputs/pushrun-site/app.js`
- 디자인: `outputs/pushrun-site/styles.css`

## 실행

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/serve-pushrun.ps1 -Port 4173
```

브라우저에서 `http://127.0.0.1:4173/` 을 열면 됩니다.

## 배포

`vercel.json`은 `outputs/pushrun-site`를 정적 사이트 출력 폴더로 사용하도록 설정되어 있습니다.
