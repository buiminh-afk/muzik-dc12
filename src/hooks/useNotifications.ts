'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    permissionRef.current = Notification.permission;

    // Xin quyền ngay khi hook mount nếu chưa granted/denied
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    }
  }, []);

  const sendNotification = useCallback((title: string, body: string, tag?: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const isTabHidden = document.visibilityState === 'hidden';

    // Chỉ bắn Browser Notification khi tab đang bị ẩn
    if (isTabHidden && Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body,
        tag: tag ?? title,
        icon: '/favicon.ico',
        requireInteraction: false,
      });

      // Click vào notification → focus tab lại
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const perm = await Notification.requestPermission();
    permissionRef.current = perm;
  }, []);

  return { sendNotification, requestPermission };
}
