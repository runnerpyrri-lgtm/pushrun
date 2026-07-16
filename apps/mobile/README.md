# RunningBom Mobile

러닝봄의 Android·iOS 독립 네이티브 앱입니다. Expo SDK 57, React Native 0.86, React 19.2.3을 사용하며 웹 화면을 감싸지 않습니다.

## 포함 범위

- 번들 대회 샘플 5개의 지역·거리 필터
- 정확한 접수 시작 시각이 확인된 대회의 `expo-notifications` 로컬 알림 예약
- 알림 권한 거부·오류에서도 유지되는 필터와 공식 대회 링크
- `runningbom://race/{raceId}` 딥 링크와 알림 탭 시 대회 선택
- Android package와 iOS bundle identifier `kr.robom.runningbom`
- custom scheme `runningbom`
- EAS `development`, `preview`, `production` 빌드 프로필

SDK 57은 Node.js 22.13 이상이 필요합니다. 이 프로젝트는 Expo 공식 SDK 57 TypeScript 템플릿의 호환 버전을 사용합니다.

## 로컬 실행

```bash
cd apps/mobile
npm ci
cp .env.example .env
npm run start:go
```

로컬 알림은 Expo Go에서도 확인할 수 있습니다. custom scheme과 실제 네이티브 설정은 development build에서 검증합니다.

```bash
npm start
```

`.env`의 `EXPO_PUBLIC_*` 값은 앱 번들에 공개됩니다. 비밀키, 서명 인증서, 스토어 자격 증명을 넣지 않습니다.

## 핵심 동작

정확한 접수 시작 시각이 확인된 샘플에서 `접수 알림 예약`을 누르면 기기 권한을 요청하고 해당 시각에 한 번 울리는 로컬 알림을 예약합니다. 같은 대회를 다시 예약하면 기존 예약을 취소하고 최신 예약 하나만 남깁니다.

권한이 거부되면 예약만 생략하며 지역·거리 필터와 공식 대회 페이지 열기는 계속 동작합니다. 시작 날짜만 있고 정확한 시각이 확인되지 않은 샘플도 알림을 임의 시각에 예약하지 않습니다.

Android 알림은 운영체제 절전 정책에 따라 조금 늦어질 수 있습니다. 러닝봄은 전용 알람·캘린더 앱이 아니므로 `SCHEDULE_EXACT_ALARM` 특수 권한을 선언하지 않으며, 일반 알림 권한을 거부해도 다른 기능은 중단하지 않습니다.

딥 링크 예시는 다음과 같습니다.

```bash
npx uri-scheme open "runningbom://race/wyd-life-run-2026" --android
npx uri-scheme open "runningbom://race/wyd-life-run-2026" --ios
```

공식 대회 페이지는 운영체제 기본 브라우저로 엽니다.

## 검증

```bash
npm run check
npx expo-doctor
npm run export:native
```

`npm run check`는 TypeScript, SDK·식별자·EAS 프로필·번들 대회 계약, Expo 공개 config를 확인합니다. `export:native`는 Android와 iOS Hermes 번들을 각각 생성합니다. 생성된 `dist`는 Git에서 제외됩니다.

## EAS 빌드 프로필

- `development`는 `expo-dev-client`가 포함된 내부 배포용 개발 빌드입니다.
- `preview`는 개발 도구가 없는 내부 검증 빌드이며 Android는 설치 가능한 APK를 생성합니다.
- `production`은 스토어용 기본 형식을 사용합니다.

EAS 프로젝트 연결과 빌드는 저장소 소유자가 다음 순서로 실행합니다.

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform all
npx eas-cli build --profile production --platform all
```

## 스토어 제출 전 절차

1. Apple Developer와 Google Play Console에서 `kr.robom.runningbom` 식별자 소유권을 확인합니다.
2. `app.json`의 앱 버전, Android `versionCode`, iOS `buildNumber`를 출시 값으로 올립니다.
3. 개인정보 URL, 지원 URL, 대회 데이터 revision과 권한 거부 동작을 실기기에서 확인합니다.
4. `npm run check`, `npx expo-doctor`, `npm run export:native`를 다시 통과시킵니다.
5. `production` 빌드를 만든 뒤 스토어 메타데이터와 스크린샷을 사람이 검토합니다.
6. 승인된 빌드만 `npx eas-cli submit --platform android --latest` 또는 `npx eas-cli submit --platform ios --latest`로 제출합니다.

서명키와 스토어 자격 증명은 EAS 또는 각 스토어의 보안 저장소에서 관리하고 저장소나 `.env`에 넣지 않습니다. 이 구현 작업에서는 EAS 연결, 서명, 빌드 업로드, 스토어 제출을 실행하지 않았습니다.

## 공식 참고

- [Expo SDK 버전 표](https://docs.expo.dev/versions/latest/)
- [Expo Notifications SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- [Expo Linking](https://docs.expo.dev/linking/into-other-apps/)
- [EAS build profiles](https://docs.expo.dev/build/eas-json/)
