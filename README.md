# 러닝봄

러닝 대회 접수 시작 시간을 놓치지 않도록 알림을 설정하는 로봄의 러닝 대회 앱입니다.
기존 PushRun의 기능과 알림 설정을 그대로 이어받습니다.

## 편집 위치

- 메인 화면: `outputs/pushrun-site/index.html`
- 동작/대회 데이터: `outputs/pushrun-site/app.js`
- 대회 데이터: `outputs/pushrun-site/races.json`
- 디자인: `outputs/pushrun-site/styles.css`
- 독립 Android·iOS 앱: `apps/mobile`

## 실행

```bash
npm start
```

브라우저에서 `http://127.0.0.1:4173/` 을 열면 됩니다.

설정에서는 로봄 패밀리의 다른 앱, 앱 메타데이터, 설치·업데이트, 문의, 개인정보 및 분석 동의 상태를 확인할 수 있습니다. 설치 버튼은 지원 브라우저의 PWA 설치 창을 열고, iOS Safari에서는 홈 화면 추가 방법을 안내합니다.

웹 알림의 브라우저 타이머는 RunningBom이 열려 실행 중일 때만 확인합니다. 서버 푸시 알림은 제공하지 않습니다.

## 로봄 패밀리 정본

패밀리 생성물은 로봄 중앙 정본의 immutable commit `f999781fa534183ecf15b5045df4179b020a338f`에서 동기화합니다.

```bash
node ../robom/ops/scripts/family/sync-app.mjs \
  --app runningbom \
  --target "$PWD/generated/robom-family" \
  --lock "$PWD/family.lock.json" \
  --flavor vanilla \
  --source-commit f999781fa534183ecf15b5045df4179b020a338f
npm run build
```

`npm run build`는 생성물 해시를 확인한 뒤 실제 정적 사이트의 `outputs/pushrun-site/family`로 복사합니다. 패밀리 계약 CI도 같은 immutable commit의 reusable workflow를 사용합니다.

## 네이티브 앱

`apps/mobile`은 Expo SDK 57 기반의 독립 React Native 프로젝트입니다. 번들 대회를 지역·거리로 고르고, 정확한 접수 시작 시각이 확인된 대회는 기기 로컬 알림을 예약하며, 공식 대회 페이지를 운영체제 브라우저로 엽니다. 실행·EAS 프로필·스토어 제출 전 절차는 `apps/mobile/README.md`에 정리되어 있습니다.

## 배포

GitHub Pages 배포 주소:

https://robom-labs.github.io/runningbom/

현재 공개 사이트는 `main` 변경 시 GitHub Actions가 검증한 뒤 `gh-pages` 브랜치로 자동 배포합니다. 사람이 같은 파일을 별도로 복사하지 않습니다.

`vercel.json`은 Vercel에서도 `outputs/pushrun-site`를 정적 사이트 출력 폴더로 사용하도록 설정되어 있습니다.

## 대회 데이터 기준

- 1차 확인: 마라톤온라인 대회 일정
- 접수 링크/상세 보강: 공식 대회 사이트, 러너블, 마라톤GO
- 카드에는 접수 기간, 대회일, D-day, 지역, 거리, 대회 페이지 상태만 짧게 표시합니다.
