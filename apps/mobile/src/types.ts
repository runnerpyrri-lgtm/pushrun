// 러닝봄 번들 대회와 필터가 공유하는 타입을 정의합니다.
export type RaceDistance = '5K' | '10K' | 'Half';

export type Race = {
  id: string;
  name: string;
  region: string;
  venue: string;
  raceDate: string;
  distances: RaceDistance[];
  registrationOpensAt: string;
  registrationTimeConfirmed: boolean;
  officialUrl: string;
  sourceName: string;
};

export type RegionFilter = '전체' | string;
export type DistanceFilter = '전체' | RaceDistance;
