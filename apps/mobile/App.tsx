// 러닝봄 네이티브 앱의 필터, 알림, 딥 링크 핵심 화면을 구성합니다.
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  bundledRevision,
  distances,
  filterRaces,
  formatRaceDate,
  formatRegistrationTime,
  raceIdFromDeepLink,
  races,
  regions,
} from './src/races';
import {
  configureNotificationChannel,
  scheduleRegistrationNotification,
} from './src/notifications';
import type { DistanceFilter, Race, RegionFilter } from './src/types';

const SUPPORT_URL = process.env.EXPO_PUBLIC_SUPPORT_URL ?? 'https://robom.kr/support';
const PRIVACY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://robom.kr/privacy/runningbom';

type ChoiceRowProps<T extends string> = {
  label: string;
  choices: readonly T[];
  selected: T;
  onSelect: (choice: T) => void;
};

function ChoiceRow<T extends string>({
  label,
  choices,
  selected,
  onSelect,
}: ChoiceRowProps<T>) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.choiceRow}
      >
        {choices.map((choice) => {
          const active = choice === selected;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(choice)}
              style={({ pressed }) => [
                styles.choice,
                active && styles.choiceActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{choice}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AppScreen() {
  const deepLinkUrl = Linking.useLinkingURL();
  const [region, setRegion] = useState<RegionFilter>('전체');
  const [distance, setDistance] = useState<DistanceFilter>('전체');
  const [focusedRaceId, setFocusedRaceId] = useState<string | null>(null);
  const [busyRaceId, setBusyRaceId] = useState<string | null>(null);
  const [scheduledRaceIds, setScheduledRaceIds] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState(
    '알림 권한이 없어도 지역·거리 선택과 공식 대회 링크는 계속 사용할 수 있어요.',
  );

  const revealRace = useCallback((raceId: string) => {
    if (!races.some((race) => race.id === raceId)) {
      return;
    }

    setRegion('전체');
    setDistance('전체');
    setFocusedRaceId(raceId);
    setNotice('딥 링크로 선택한 대회를 목록 맨 위에 표시했어요.');
  }, []);

  useEffect(() => {
    void configureNotificationChannel().catch(() => {
      setNotice('알림 채널을 준비하지 못했지만 대회 탐색과 공식 링크는 계속 사용할 수 있어요.');
    });

    let active = true;
    void Notifications.getAllScheduledNotificationsAsync()
      .then((scheduled) => {
        if (!active) {
          return;
        }

        const next: Record<string, string> = {};
        for (const notification of scheduled) {
          const raceId = notification.content.data?.raceId;
          if (typeof raceId === 'string') {
            next[raceId] = notification.identifier;
          }
        }
        setScheduledRaceIds(next);
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const raceId = response.notification.request.content.data?.raceId;
      if (typeof raceId === 'string') {
        revealRace(raceId);
      }
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const raceId = response?.notification.request.content.data?.raceId;
        if (typeof raceId === 'string') {
          revealRace(raceId);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      subscription.remove();
    };
  }, [revealRace]);

  useEffect(() => {
    if (!deepLinkUrl) {
      return;
    }

    const raceId = raceIdFromDeepLink(deepLinkUrl);
    if (raceId) {
      revealRace(raceId);
    }
  }, [deepLinkUrl, revealRace]);

  const visibleRaces = useMemo(() => {
    const filtered = filterRaces(region, distance);
    if (!focusedRaceId) {
      return filtered;
    }

    return filtered.sort((left, right) => {
      if (left.id === focusedRaceId) return -1;
      if (right.id === focusedRaceId) return 1;
      return 0;
    });
  }, [distance, focusedRaceId, region]);

  const openExternalUrl = useCallback(async (url: string, label: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error('unsupported URL');
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(`${label}을 열 수 없어요`, '네트워크 연결과 주소를 확인한 뒤 다시 시도해 주세요.');
    }
  }, []);

  const scheduleAlert = useCallback(async (race: Race) => {
    setBusyRaceId(race.id);
    try {
      const result = await scheduleRegistrationNotification(race);
      if (result.kind === 'scheduled') {
        setScheduledRaceIds((current) => ({ ...current, [race.id]: result.identifier }));
        setNotice(`${race.name} 접수 시작 알림을 ${formatRegistrationTime(race)}에 예약했어요.`);
        return;
      }
      if (result.kind === 'denied') {
        setNotice('알림 권한이 거부되어 예약하지 않았어요. 대회 탐색과 공식 링크는 정상 동작합니다.');
        return;
      }
      if (result.kind === 'time-unconfirmed') {
        setNotice('공식 접수 시작 시각이 확인된 뒤에만 정확한 알림을 예약할 수 있어요.');
        return;
      }
      setNotice('접수 시작 시각이 이미 지나 알림을 예약하지 않았어요. 공식 페이지에서 상태를 확인해 주세요.');
    } catch {
      setNotice('알림 예약 중 오류가 발생했어요. 대회 탐색과 공식 링크는 계속 사용할 수 있어요.');
    } finally {
      setBusyRaceId(null);
    }
  }, []);

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.wordmark}>
            러닝<Text style={styles.wordmarkAccent}>봄</Text>
          </Text>
          <Text style={styles.version}>Native 0.17.0</Text>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>접수 시작을 놓치지 않게</Text>
          <Text style={styles.title}>달리고 싶은 대회를 골라보세요</Text>
          <Text style={styles.subtitle}>
            번들 샘플을 지역과 거리로 좁히고, 공식 시각이 확인된 대회는 기기 로컬 알림으로 예약합니다.
          </Text>
        </View>

        <View style={styles.filters}>
          <ChoiceRow
            label="지역"
            choices={regions}
            selected={region}
            onSelect={(choice) => {
              setFocusedRaceId(null);
              setRegion(choice);
            }}
          />
          <ChoiceRow
            label="거리"
            choices={distances}
            selected={distance}
            onSelect={(choice) => {
              setFocusedRaceId(null);
              setDistance(choice);
            }}
          />
        </View>

        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>

        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>대회 {visibleRaces.length}개</Text>
          <Text style={styles.revision}>데이터 {bundledRevision}</Text>
        </View>

        <View style={styles.raceList}>
          {visibleRaces.map((race) => {
            const focused = race.id === focusedRaceId;
            const scheduled = Boolean(scheduledRaceIds[race.id]);
            const busy = race.id === busyRaceId;
            return (
              <View key={race.id} style={[styles.raceCard, focused && styles.raceCardFocused]}>
                <View style={styles.raceTopline}>
                  <Text style={styles.region}>{race.region}</Text>
                  <Text style={styles.distances}>{race.distances.join(' · ')}</Text>
                </View>
                <Text style={styles.raceName}>{race.name}</Text>
                <Text style={styles.raceMeta}>{formatRaceDate(race)} · {race.venue}</Text>

                <View style={styles.registrationBox}>
                  <Text style={styles.registrationLabel}>접수 시작</Text>
                  <Text style={styles.registrationValue}>{formatRegistrationTime(race)}</Text>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void scheduleAlert(race)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      scheduled && styles.scheduledButton,
                      busy && styles.disabledButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {busy ? '예약 중' : scheduled ? '알림 예약됨' : race.registrationTimeConfirmed ? '접수 알림 예약' : '시각 확인 후 예약'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void openExternalUrl(race.officialUrl, '공식 대회 페이지')}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryButtonText}>공식 대회 페이지</Text>
                  </Pressable>
                </View>

                <Text style={styles.source}>출처 {race.sourceName}</Text>
              </View>
            );
          })}
        </View>

        {visibleRaces.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>조건에 맞는 샘플이 없어요</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setRegion('전체');
                setDistance('전체');
              }}
              style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
            >
              <Text style={styles.resetButtonText}>전체 대회 보기</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>운영 정보</Text>
          <Text style={styles.footerText}>
            로컬 알림은 기기 권한과 운영체제 정책에 따라 동작합니다. 정확한 접수 시각이 확인되지 않은 대회는 예약하지 않습니다.
          </Text>
          <View style={styles.footerLinks}>
            <Pressable
              accessibilityRole="link"
              onPress={() => void openExternalUrl(SUPPORT_URL, '지원 페이지')}
              style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
            >
              <Text style={styles.footerLinkText}>지원</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => void openExternalUrl(PRIVACY_URL, '개인정보 페이지')}
              style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
            >
              <Text style={styles.footerLinkText}>개인정보</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}

const colors = {
  background: '#FFF8F4',
  surface: '#FFFFFF',
  surfaceSoft: '#FFF0EB',
  ink: '#172033',
  muted: '#667085',
  line: '#E7DDD8',
  coral: '#D94F45',
  coralDark: '#A93631',
  navy: '#203354',
  mint: '#DDF4EC',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  page: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  wordmarkAccent: {
    color: colors.coral,
  },
  version: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  intro: {
    paddingTop: 22,
    paddingBottom: 24,
  },
  eyebrow: {
    color: colors.coralDark,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
  },
  filters: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 16,
    gap: 16,
  },
  filterGroup: {
    gap: 9,
  },
  filterLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 16,
  },
  choiceRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  choice: {
    minHeight: 48,
    minWidth: 58,
    paddingHorizontal: 17,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  choiceActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  choiceText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  choiceTextActive: {
    color: colors.surface,
  },
  notice: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: '#FFF1D9',
    padding: 14,
  },
  noticeText: {
    color: '#6E4A18',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  resultHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  revision: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  raceList: {
    gap: 14,
  },
  raceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    padding: 18,
  },
  raceCardFocused: {
    borderColor: colors.coral,
    borderWidth: 2,
    backgroundColor: '#FFFCFA',
  },
  raceTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  region: {
    color: colors.coralDark,
    fontSize: 13,
    fontWeight: '900',
  },
  distances: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '800',
  },
  raceName: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  raceMeta: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  registrationBox: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  registrationLabel: {
    color: colors.coralDark,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 5,
  },
  registrationValue: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  actions: {
    gap: 10,
    marginTop: 16,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scheduledButton: {
    backgroundColor: '#247A64',
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFC7D4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
  source: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 14,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  resetButton: {
    minHeight: 48,
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  resetButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    marginTop: 28,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.mint,
  },
  footerTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  footerText: {
    color: '#3F5F57',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  footerLink: {
    minHeight: 48,
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  footerLinkText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
});
