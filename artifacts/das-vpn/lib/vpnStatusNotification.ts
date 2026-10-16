import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const CHANNEL_ID = "vpn-connection";
const NOTIFICATION_KIND = "vpn-connection";

let channelConfigured = false;
let permissionRequested = false;
let notificationQueue = Promise.resolve();

if (Platform.OS === "android") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function updateVpnStatusNotification(connected: boolean): Promise<void> {
  if (Platform.OS !== "android") return;

  const presented = await Notifications.getPresentedNotificationsAsync();
  const vpnNotifications = presented.filter(
    (notification) => notification.request.content.data?.kind === NOTIFICATION_KIND,
  );

  if (!connected) {
    await Promise.all(
      vpnNotifications.map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier),
      ),
    );
    return;
  }

  if (vpnNotifications.length) return;

  if (!channelConfigured) {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "VPN connection",
      description: "Quiet status icon while DAS VPN is connected.",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [],
      sound: null,
      showBadge: false,
    });
    channelConfigured = true;
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    if (!permission.canAskAgain || permissionRequested) return;
    permissionRequested = true;
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "DAS VPN",
      body: "Connected securely",
      data: { kind: NOTIFICATION_KIND },
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
    },
    trigger: null,
  });
}

export function syncVpnStatusNotification(connected: boolean): Promise<void> {
  notificationQueue = notificationQueue
    .catch(() => undefined)
    .then(() => updateVpnStatusNotification(connected))
    .catch((error: unknown) => {
      console.warn("Could not update the VPN status notification.", error);
    });
  return notificationQueue;
}
