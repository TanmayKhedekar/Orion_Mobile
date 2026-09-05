import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Configuration for Orion
 *
 * Package ID: com.orion.agentifai
 * App Name: Orion
 *
 * Security Note:
 * This mobile configuration deliberately does NOT contain any API keys,
 * Groq credentials, Organizer tokens, or secrets.
 * All AI inferences are securely routed through the remote Orion Next.js backend.
 */
const config: CapacitorConfig = {
  appId: 'com.orion.agentifai',
  appName: 'Orion',
  webDir: 'public',
  server: {
    // Environment-aware backend resolution:
    // Production defaults to the deployed HTTPS backend (https://agentif-ai.vercel.app)
    // Local dev can be overridden via CAPACITOR_SERVER_URL (e.g., http://10.0.2.2:3000)
    url: process.env.CAPACITOR_SERVER_URL || 'https://agentif-ai.vercel.app',
    cleartext: true,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production'
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    StatusBar: {
      overlaysWebView: false
    }
  }
};

export default config;
