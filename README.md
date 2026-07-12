# 러닝봄

러닝 대회 접수 시작 시간을 놓치지 않도록 알림을 설정하는 로봄의 러닝 대회 앱입니다.
기존 PushRun의 기능과 알림 설정을 그대로 이어받습니다.

## 편집 위치

- 메인 화면: `outputs/pushrun-site/index.html`
- 동작/대회 데이터: `outputs/pushrun-site/app.js`
- 대회 데이터: `outputs/pushrun-site/races.json`
- 디자인: `outputs/pushrun-site/styles.css`

## 실행

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/serve-pushrun.ps1 -Port 4173
```

브라우저에서 `http://127.0.0.1:4173/` 을 열면 됩니다.

## 배포

GitHub Pages 배포 주소:

https://robom-labs.github.io/runningbom/

현재 공개 사이트는 `main` 변경 시 GitHub Actions가 검증한 뒤 `gh-pages` 브랜치로 자동 배포합니다. 사람이 같은 파일을 별도로 복사하지 않습니다.

`vercel.json`은 Vercel에서도 `outputs/pushrun-site`를 정적 사이트 출력 폴더로 사용하도록 설정되어 있습니다.

## 대회 데이터 기준

- 1차 확인: 마라톤온라인 대회 일정
- 접수 링크/상세 보강: 공식 대회 사이트, 러너블, 마라톤GO
- 카드에는 접수 기간, 대회일, D-day, 지역, 거리, 대회 페이지 상태만 짧게 표시합니다.
