'use client';

import { useEffect } from 'react';

const UPDATE_INTERVAL = 60 * 60 * 1000;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    let refreshing = false;
    let updateTimer: ReturnType<typeof setInterval> | undefined;
    const hadController = Boolean(navigator.serviceWorker.controller);

    const refreshOnControllerChange = () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, {
          scope: `${BASE_PATH}/`,
          updateViaCache: 'none',
        });
        await registration.update();
        updateTimer = setInterval(() => registration.update(), UPDATE_INTERVAL);
      } catch (error) {
        console.warn('PWA service worker registration failed:', error);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', refreshOnControllerChange);
    void register();

    return () => {
      if (updateTimer) clearInterval(updateTimer);
      navigator.serviceWorker.removeEventListener('controllerchange', refreshOnControllerChange);
    };
  }, []);

  return null;
}
