import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useOfflineQueue } from '../store/offlineQueue';

/** Wires connectivity into React Query and flushes queued answers on reconnect. */
export function startNetworkSync() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(online);
      if (online && useOfflineQueue.getState().items.length) void useOfflineQueue.getState().flush();
    }),
  );
}

export function useIsOnline() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}
