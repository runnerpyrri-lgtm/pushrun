// 러닝봄 모바일의 SDK, 식별자, EAS 프로필, 번들 데이터 계약을 정적으로 검증합니다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const [packageJson, rootPackageJson, appJson, easJson, raceData] = await Promise.all([
  readJson('package.json'),
  readJson('../../package.json'),
  readJson('app.json'),
  readJson('eas.json'),
  readJson('src/data/races.json'),
]);

assert(packageJson.version === rootPackageJson.version, '웹·모바일 앱 버전이 일치해야 합니다.');
assert(packageJson.dependencies.expo === '~57.0.6', 'Expo SDK 57 버전이 고정되지 않았습니다.');
assert(packageJson.dependencies.react === '19.2.3', 'React 19.2.3이 필요합니다.');
assert(packageJson.dependencies['react-native'] === '0.86.0', 'React Native 0.86.0이 필요합니다.');
assert(!packageJson.dependencies['react-native-webview'], 'WebView 의존성은 허용하지 않습니다.');
assert(appJson.expo.scheme === 'runningbom', '앱 scheme은 runningbom이어야 합니다.');
assert(appJson.expo.android.package === 'kr.robom.runningbom', 'Android package가 일치하지 않습니다.');
assert(appJson.expo.ios.bundleIdentifier === 'kr.robom.runningbom', 'iOS bundleIdentifier가 일치하지 않습니다.');
assert(appJson.expo.orientation === 'default', '휴대폰·태블릿 회전을 모두 지원해야 합니다.');
assert(appJson.expo.ios.supportsTablet === true, 'iPad 지원이 켜져 있어야 합니다.');
assert(typeof appJson.expo.description === 'string' && appJson.expo.description.length >= 20, '스토어 설명이 필요합니다.');
assert(appJson.expo.plugins.includes('expo-notifications'), 'expo-notifications 플러그인이 필요합니다.');
const buildProperties = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
assert(packageJson.dependencies['expo-build-properties']?.startsWith('~57.0.'), 'expo-build-properties는 Expo SDK 57 호환 버전이어야 합니다.');
assert(buildProperties?.[1]?.android?.compileSdkVersion >= 36, 'Android compileSdkVersion은 36 이상이어야 합니다.');
assert(buildProperties?.[1]?.android?.targetSdkVersion === 36, 'Android targetSdkVersion은 36이어야 합니다.');
assert(appJson.expo.owner === 'robom-labs', 'EAS owner는 robom-labs여야 합니다.');
assert(
  !appJson.expo.android.permissions.includes('android.permission.SCHEDULE_EXACT_ALARM'),
  '스토어 심사 부담이 큰 정확 알람 특수 권한을 선언하면 안 됩니다.',
);
assert(!appJson.expo.ios.associatedDomains?.includes('applinks:robom.kr'), '실제 Apple Team ID 검증 전에는 Universal Link 도메인을 선언하면 안 됩니다.');
assert(!appJson.expo.android.intentFilters.some((filter) => filter.autoVerify === true), '실제 Play 앱 서명 검증 전에는 Android App Link autoVerify를 선언하면 안 됩니다.');

for (const profile of ['development', 'preview', 'production']) {
  assert(easJson.build[profile], `EAS ${profile} 프로필이 없습니다.`);
}
assert(easJson.build.development.developmentClient === true, 'developmentClient가 필요합니다.');
assert(easJson.build.preview.distribution === 'internal', 'preview는 internal 배포여야 합니다.');
assert(easJson.build.production.android?.buildType === 'app-bundle', 'production Android는 AAB여야 합니다.');
assert(!easJson.submit, '스토어 자동 제출 설정을 두면 안 됩니다.');

assert(raceData.races.length >= 50, '모바일 번들에는 검증된 대회 50개 이상이 필요합니다.');
assert(!raceData.source.includes('샘플'), '출시 모바일 데이터에 샘플 표시가 남아 있으면 안 됩니다.');
assert(new Set(raceData.races.map((race) => race.id)).size === raceData.races.length, '대회 ID가 중복됩니다.');
assert(raceData.races.some((race) => race.registrationTimeConfirmed), '정확한 접수 시작 알림 샘플이 필요합니다.');
for (const race of raceData.races) {
  assert(race.region && race.distances.length > 0, `${race.id}의 지역 또는 거리가 없습니다.`);
  assert(Number.isFinite(Date.parse(race.registrationOpensAt)), `${race.id}의 접수 시각이 잘못됐습니다.`);
  assert(/^https?:\/\//.test(race.officialUrl), `${race.id}의 공식 URL이 잘못됐습니다.`);
}

const sourceFiles = [
  'App.tsx',
  'index.ts',
  'src/notifications.ts',
  'src/races.ts',
  'src/types.ts',
  'scripts/verify-config.mjs',
];
for (const sourceFile of sourceFiles) {
  const source = await readFile(path.join(root, sourceFile), 'utf8');
  assert(/[가-힣]/.test(source.split(/\r?\n/, 1)[0]), `${sourceFile} 첫 줄에 한국어 역할 주석이 없습니다.`);
  if (sourceFile !== 'scripts/verify-config.mjs') {
    assert(!/\bWebView\b/.test(source), `${sourceFile}에 WebView 구현이 포함돼 있습니다.`);
  }
}

console.log(`모바일 정적 검증 통과: Expo 57 · 대회 ${raceData.races.length}개 · EAS 3개 프로필`);
