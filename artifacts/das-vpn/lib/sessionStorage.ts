import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const TOKEN_KEY = "das.vpn.device-token";
export const RECOVERY_KEY = "das.vpn.recovery-key";
export const RECOVERY_PIN_KEY = "das.vpn.recovery-pin";
export const RECOVERY_SEEN_KEY = "das.vpn.recovery-viewed";

function getBrowserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is not available");
  }
  return window.localStorage;
}

export async function getSessionValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return getBrowserStorage().getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setSessionValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    getBrowserStorage().setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
