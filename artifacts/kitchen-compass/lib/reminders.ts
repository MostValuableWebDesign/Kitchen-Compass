export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export type ReminderScheduler = {
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  scheduleNotificationAsync: (input: {
    content: { title: string; body: string };
    trigger: { type: 'daily'; hour: number; minute: number; repeats: true };
  }) => Promise<string>;
};

export const defaultReminderSettings: ReminderSettings = { enabled: false, hour: 18, minute: 0 };

export async function syncDailyReminder(
  settings: ReminderSettings,
  scheduler: ReminderScheduler,
  requestPermission: boolean,
) {
  await scheduler.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return { enabled: false, permissionDenied: false };
  let permission = await scheduler.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) {
    permission = await scheduler.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') return { enabled: false, permissionDenied: true };
  await scheduler.scheduleNotificationAsync({
    content: {
      title: 'Kitchen Compass',
      body: 'Your planned meals are ready when you are.',
    },
    trigger: { type: 'daily', hour: settings.hour, minute: settings.minute, repeats: true },
  });
  return { enabled: true, permissionDenied: false };
}