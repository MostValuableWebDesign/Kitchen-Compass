import assert from 'node:assert/strict';
import test from 'node:test';
import { syncDailyReminder, type ReminderScheduler } from '../lib/reminders';

function fakeScheduler(permission = 'granted') {
  const calls: string[] = [];
  const scheduler: ReminderScheduler = {
    getPermissionsAsync: async () => ({ status: permission }),
    requestPermissionsAsync: async () => { calls.push('request'); return { status: permission === 'undetermined' ? 'granted' : permission }; },
    cancelAllScheduledNotificationsAsync: async () => { calls.push('cancel'); },
    scheduleNotificationAsync: async (input) => { calls.push(`schedule:${input.trigger.hour}:${input.trigger.minute}`); return 'reminder-id'; },
  };
  return { scheduler, calls };
}

test('enabling reminders requests permission and schedules the selected daily time', async () => {
  const { scheduler, calls } = fakeScheduler('undetermined');
  const result = await syncDailyReminder({ enabled: true, hour: 7, minute: 30 }, scheduler, true);
  assert.deepEqual(result, { enabled: true, permissionDenied: false });
  assert.deepEqual(calls, ['cancel', 'request', 'schedule:7:30']);
});

test('disabling reminders cancels without requesting permission', async () => {
  const { scheduler, calls } = fakeScheduler('denied');
  const result = await syncDailyReminder({ enabled: false, hour: 18, minute: 0 }, scheduler, true);
  assert.deepEqual(result, { enabled: false, permissionDenied: false });
  assert.deepEqual(calls, ['cancel']);
});

test('denied permission does not leave reminders enabled', async () => {
  const { scheduler, calls } = fakeScheduler('denied');
  const result = await syncDailyReminder({ enabled: true, hour: 20, minute: 0 }, scheduler, true);
  assert.deepEqual(result, { enabled: false, permissionDenied: true });
  assert.deepEqual(calls, ['cancel', 'request']);
});