import Constants from "expo-constants";
import * as Location from "expo-location";
import { api } from "./api";
import { getSessionId } from "./session";

// Expo Go (SDK 53+) removed Android push support and will throw the moment
// `expo-notifications` is imported. Detect that BEFORE touching the module
// so the rest of the app keeps working in Expo Go for preview/demo.
const isExpoGo = Constants.appOwnership === "expo";

type PushModule = typeof import("expo-notifications");

let pushModule: PushModule | null = null;
let handlerInstalled = false;

function loadPushModule(): PushModule | null {
  if (isExpoGo) return null;
  if (pushModule) return pushModule;
  try {
    pushModule = require("expo-notifications") as PushModule;
    if (!handlerInstalled && pushModule) {
      pushModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerInstalled = true;
    }
    return pushModule;
  } catch {
    return null;
  }
}

export async function registerForPush(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  if (isExpoGo) {
    return {
      ok: false,
      error:
        "Push notifications require a development build. They are disabled in Expo Go.",
    };
  }
  const Notifications = loadPushModule();
  if (!Notifications) {
    return { ok: false, error: "expo-notifications module unavailable." };
  }
  try {
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      return { ok: false, error: "Notification permission denied." };
    }
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (!token) return { ok: false, error: "No Expo push token returned." };

    const sid = await getSessionId();

    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const loc = await Location.getLastKnownPositionAsync();
      lat = loc?.coords.latitude;
      lng = loc?.coords.longitude;
    } catch {
      // optional
    }

    await api.registerDevice({
      sessionId: sid,
      expoPushToken: token,
      lat,
      lng,
    });
    return { ok: true, token };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
