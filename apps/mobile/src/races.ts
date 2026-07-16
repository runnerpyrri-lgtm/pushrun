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
export const races = bundledData.races as Race[];
export const regions = ['전체', ...new Set(races.map((race) => race.region))];
export const distances: DistanceFilter[] = ['전체', '5K', '10K', 'Half'];

export function filterRaces(region: RegionFilter, distance: DistanceFilter): Race[] {
  return races.filter((race) => {
    const regionMatches = region === '전체' || race.region === region;
    const distanceMatches = distance === '전체' || race.distances.includes(distance);
    return regionMatches && distanceMatches;
  });
}

export function formatRegistrationTime(race: Race): string {
  if (!race.registrationTimeConfirmed) {
    return `${race.registrationOpensAt.slice(0, 10)} · 시작 시각 확인 전`;
  }

  return registrationFormatter.format(new Date(race.registrationOpensAt));
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
