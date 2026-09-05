'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('Orion SW registered:', registration.scope);
          })
          .catch((error) => {
            console.log('Orion SW registration failed:', error);
          });
      });
    }
  }, []);

  return null;
}
