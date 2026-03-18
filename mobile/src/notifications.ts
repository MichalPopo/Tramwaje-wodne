/**
 * Local notifications service.
 * Schedules reminders for deadlines, task starts, and sync alerts.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification handling
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function setupNotifications(): Promise<boolean> {
    if (!Device.isDevice) {
        console.log('[Notifications] Emulator — skip setup');
        return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('[Notifications] Permission denied');
        return false;
    }

    // Android channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('tasks', {
            name: 'Zadania',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#0ea5e9',
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('sync', {
            name: 'Synchronizacja',
            importance: Notifications.AndroidImportance.LOW,
        });

        await Notifications.setNotificationChannelAsync('alerts', {
            name: 'Alerty',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 250, 500],
            lightColor: '#ef4444',
            sound: 'default',
        });
    }

    return true;
}

// ========== Scheduling ==========

export async function scheduleTaskReminder(
    taskId: number,
    title: string,
    body: string,
    triggerDate: Date,
): Promise<string> {
    const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: `📋 ${title}`,
            body,
            data: { type: 'task_reminder', taskId },
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
        },
    });
    return id;
}

export async function scheduleDeadlineAlert(
    taskId: number,
    title: string,
    deadline: Date,
): Promise<string> {
    // Alert 1 hour before deadline
    const alertTime = new Date(deadline.getTime() - 60 * 60 * 1000);
    if (alertTime <= new Date()) return ''; // Already past

    const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: `⚠️ Zbliża się deadline!`,
            body: `${title} — deadline za 1 godzinę`,
            data: { type: 'deadline_alert', taskId },
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: 'alerts' } : {}),
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: alertTime,
        },
    });
    return id;
}

export async function sendInstantNotification(
    title: string,
    body: string,
    data?: Record<string, any>,
): Promise<void> {
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data: data || {},
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
        },
        trigger: null, // immediate
    });
}

export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledCount(): Promise<number> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length;
}

// ========== Listeners ==========

export function addNotificationReceivedListener(
    handler: (notification: Notifications.Notification) => void,
): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
    handler: (response: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(handler);
}
