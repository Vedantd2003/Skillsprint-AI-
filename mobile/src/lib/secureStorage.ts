import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session secrets live in the OS keystore (Keychain / Android Keystore) via
 * expo-secure-store. The web build (development only) falls back to
 * sessionStorage because browsers have no equivalent secure store.
 */
const isWeb = Platform.OS === 'web';

export async function getSecure(key: string): Promise<string | null> {
  if (isWeb) return globalThis.sessionStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setSecure(key: string, value: string): Promise<void> {
  if (isWeb) return void globalThis.sessionStorage?.setItem(key, value);
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function deleteSecure(key: string): Promise<void> {
  if (isWeb) return void globalThis.sessionStorage?.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}
