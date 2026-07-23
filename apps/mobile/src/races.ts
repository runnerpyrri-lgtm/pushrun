// 번들 대회를 검증 가능한 필터와 한국 시간 표시 값으로 변환합니다.
import bundledData from './data/races.json';
import type { DistanceFilter, Race, RegionFilter } from './types';

const registrationFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const raceDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

export const bundledRevision = bundledData.revision;
const todayKst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const REMOTE_RACES_URL =
  process.env.EXPO_PUBLIC_RACE_DATA_URL ??
  'https://raw.githubusercontent.com/robom-labs/runningbom/main/apps/mobile/src/data/races.json';

function isRace(value: unknown): value is Race {
  if (!value || typeof value !== 'object') return false;
  const race = value as Partial<Race>;
  return (
    typeof race.id === 'string' &&
    typeof race.name === 'string' &&
    typeof race.region === 'string' &&
    typeof race.venue === 'string' &&
    typeof race.raceDate === 'string' &&
    Array.isArray(race.distances) &&
    typeof race.registrationOpensAt === 'string' &&
    typeof race.registrationTimeConfirmed === 'boolean' &&
    typeof race.officialUrl === 'string' &&
    typeof race.sourceName === 'string'
  );
}

function isVisibleRace(race: Race, now = Date.now()): boolean {
  const status = race.registrationStatus ?? '';
  const closesAt = race.registrationClosesAt ? new Date(race.registrationClosesAt).getTime() : Number.NaN;
  return (
    race.raceDate >= todayKst &&
    !['cancelled', 'postponed', 'sold_out', 'closed'].includes(status) &&
    (!Number.isFinite(closesAt) || closesAt >= now)
  );
}

function visibleRaces(values: Race[]): Race[] {
  const seen = new Set<string>();
  return values.filter((race) => {
    if (!isRace(race) || seen.has(race.id) || !isVisibleRace(race)) return false;
    seen.add(race.id);
    return true;
  });
}

export const races = visibleRaces(bundledData.races as Race[]);
export function regionsFor(values: Race[]): RegionFilter[] {
  return ['전체', ...new Set(values.map((race) => race.region))];
}
export const distances: DistanceFilter[] = ['전체', '5K', '10K', 'Half', 'Full', 'Trail'];

export function filterRaces(region: RegionFilter, distance: DistanceFilter, values = races): Race[] {
  return values.filter((race) => {
    const regionMatches = region === '전체' || race.region === region;
    const distanceMatches = distance === '전체' || race.distances.includes(distance);
    return regionMatches && distanceMatches;
  });
}

export type RaceFeed = {
  revision: string;
  races: Race[];
};

// 운영 Pages의 검증된 JSON을 읽되 실패하면 번들 데이터를 그대로 사용합니다.
export async function fetchLatestRaces(): Promise<RaceFeed> {
  const response = await fetch(REMOTE_RACES_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`race feed HTTP ${response.status}`);
  const payload = (await response.json()) as { revision?: unknown; races?: unknown };
  if (typeof payload.revision !== 'string' || !Array.isArray(payload.races)) {
    throw new Error('race feed schema invalid');
  }

  const next = visibleRaces(payload.races.filter(isRace));
  if (next.length === 0) throw new Error('race feed has no active races');
  return { revision: payload.revision, races: next };
}

export function formatRegistrationTime(race: Race): string {
  if (race.registrationPeriodLabel) {
    return race.registrationPeriodLabel;
  }
  if (!race.registrationTimeConfirmed) {
    return `${race.registrationOpensAt.slice(0, 10)} · 시작 시각 확인 전`;
  }

  return registrationFormatter.format(new Date(race.registrationOpensAt));
}

export function registrationStatusLabel(race: Race, now = Date.now()): string {
  const status = race.registrationStatus;
  const closesAt = race.registrationClosesAt ? new Date(race.registrationClosesAt).getTime() : Number.NaN;
  const opensAt = new Date(race.registrationOpensAt).getTime();
  if (status === 'cancelled') return '취소';
  if (status === 'sold_out') return '매진';
  if (status === 'closed' || (Number.isFinite(closesAt) && closesAt < now)) return '접수 마감';
  if (Number.isFinite(opensAt) && opensAt <= now) return '접수 중';
  return '접수 예정';
}

export function canScheduleRegistrationAlert(race: Race, now = Date.now()): boolean {
  const status = registrationStatusLabel(race, now);
  return status === '접수 예정' && race.registrationTimeConfirmed;
}

export function formatRaceDate(race: Race): string {
  return raceDateFormatter.format(new Date(`${race.raceDate}T00:00:00+09:00`));
}

export function raceIdFromDeepLink(url: string): string | null {
  const match = url.match(/(?:^|\/)race\/([^/?#]+)/i);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
