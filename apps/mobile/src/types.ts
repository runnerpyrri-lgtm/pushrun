// 러닝봄 번들 대회와 필터가 공유하는 타입을 정의합니다.
export type RaceDistance = '5K' | '10K' | 'Half' | 'Full' | 'Trail' | string;

export type Race = {
  id: string;
  name: string;
  region: string;
  venue: string;
  raceDate: string;
  distances: RaceDistance[];
  registrationOpensAt: string;
  registrationClosesAt?: string;
  registrationTimeConfirmed: boolean;
  registrationWindows?: Array<{
    label?: string;
    distance?: string;
    opensAt: string;
    closesAt?: string;
    timeConfirmed?: boolean;
  }>;
  registrationStatus?: 'open' | 'scheduled' | 'closed' | 'sold_out' | 'cancelled' | 'unknown' | string;
  registrationPeriodLabel?: string;
  note?: string;
  capacity?: number;
  organizer?: string;
  verifiedAt?: string;
  officialUrl: string;
  sourceName: string;
};

export type RegionFilter = '전체' | string;
export type DistanceFilter = '전체' | RaceDistance;
