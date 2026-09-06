// Detects if running inside Orion Android app
export function isAndroidApp(): boolean {
  return typeof window !== 'undefined' && 
         !!(window as any).LocalAI;
}

// Check if local NPU AI is ready
export function isLocalAIReady(): boolean {
  if (!isAndroidApp()) return false;
  return (window as any).LocalAI.isReady();
}

// Generate using local NPU - returns a Promise
export function generateLocal(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isAndroidApp()) {
      reject(new Error('Not running in Android app'));
      return;
    }

    const callbackId = `cb_${Date.now()}_${Math.random()
      .toString(36).substr(2, 9)}`;

    // Set up the callback
    (window as any).onLocalAIResponse = (
      id: string, 
      response: string
    ) => {
      if (id === callbackId) {
        delete (window as any).onLocalAIResponse;
        resolve(response);
      }
    };

    // Call the Android bridge
    (window as any).LocalAI.generate(prompt, callbackId);

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Local AI timeout'));
    }, 30000);
  });
}

// Start voice input
export function startVoiceInput(): void {
  if (isAndroidApp()) {
    (window as any).LocalAI.startVoiceInput();
  }
}
