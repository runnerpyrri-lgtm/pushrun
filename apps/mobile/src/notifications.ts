// 접수 시작 로컬 알림의 권한, 중복 제거, 예약을 안전하게 처리합니다.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Race } from './types';

const CHANNEL_ID = 'registration-start';

export type ScheduleResult =
  | { kind: 'scheduled'; identifier: string }
  | { kind: 'denied' }
  | { kind: 'past' }
  | { kind: 'time-unconfirmed' };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '접수 시작 알림',
    description: '선택한 러닝 대회의 접수 시작 시각을 알려줍니다.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#E35D52',
  });
}

async function notificationPermissionGranted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (allowsNotifications(current)) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return allowsNotifications(requested);
}

function allowsNotifications(status: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS !== 'ios') {
    return status.granted;
  }

  const iosStatus = status.ios?.status;
  return (
    status.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

export async function scheduleRegistrationNotification(race: Race): Promise<ScheduleResult> {
  if (!race.registrationTimeConfirmed) {
    return { kind: 'time-unconfirmed' };
  }

  const fireAt = new Date(race.registrationOpensAt);
  if (!Number.isFinite(fireAt.getTime()) || fireAt.getTime() <= Date.now()) {
    return { kind: 'past' };
  }

  if (!(await notificationPermissionGranted())) {
    return { kind: 'denied' };
  }

  await configureNotificationChannel();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const duplicates = scheduled.filter(
    (notification) => notification.content.data?.raceId === race.id,
  );
  await Promise.all(
    duplicates.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${race.name} 접수가 시작됐어요`,
      body: '러닝봄에서 공식 접수 페이지를 확인하세요.',
      sound: 'default',
      data: {
        raceId: race.id,
        deepLink: `runningbom://race/${race.id}`,
        officialUrl: race.officialUrl,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });

  return { kind: 'scheduled', identifier };
}
