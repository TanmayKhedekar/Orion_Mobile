import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { SpeechToTextProvider, VoiceCapabilities, VoiceListenOptions } from '../types';

interface OrionVoiceNativePlugin {
    isAvailable(): Promise<{ available: boolean; provider: string; model: string; onDevice: boolean; npuAccelerated: boolean }>;
    start(options?: { language?: string }): Promise<void>;
    stop(): Promise<{ transcript: string }>;
    cancel(): Promise<void>;
    addListener(eventName: 'voiceStarted', listenerFunc: () => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'voicePartial', listenerFunc: (data: { text: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'voiceCompleted', listenerFunc: (data: { text: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'voiceError', listenerFunc: (data: { error: string }) => void): Promise<PluginListenerHandle>;
}

const OrionVoiceNative = registerPlugin<OrionVoiceNativePlugin>('OrionVoice');

export class CapacitorVoiceProvider implements SpeechToTextProvider {
    public readonly id = 'capacitor_voice';
    public readonly name = 'On-Device Android Speech Recognizer (Snapdragon / NPU)';

    private handles: PluginListenerHandle[] = [];
    private currentTranscript: string = '';
    private onCompletedResolver: ((text: string) => void) | null = null;
    private onErrorRejecter: ((err: any) => void) | null = null;

    public async isAvailable(): Promise<boolean> {
        try {
            if (typeof window === 'undefined') return false;
            // Check if Capacitor native bridge is present
            const cap = (window as any).Capacitor;
            if (!cap || !cap.isNativePlatform()) return false;

            const res = await OrionVoiceNative.isAvailable();
            return !!res?.available;
        } catch {
            return false;
        }
    }

    public async getCapabilities(): Promise<VoiceCapabilities> {
        try {
            const res = await OrionVoiceNative.isAvailable();
            return {
                provider: res.npuAccelerated ? 'whisper_npu' : 'android_ondevice',
                name: res.provider || this.name,
                model: res.model || 'whisper-tiny / on-device ASR',
                onDevice: res.onDevice ?? true,
                npuAccelerated: res.npuAccelerated ?? false,
                supportsPartial: true,
                supportedLanguages: ['en-US', 'hi-IN', 'en-IN']
            };
        } catch {
            return {
                provider: 'android_ondevice',
                name: this.name,
                model: 'on-device ASR',
                onDevice: true,
                npuAccelerated: false,
                supportsPartial: true,
                supportedLanguages: ['en-US', 'hi-IN', 'en-IN']
            };
        }
    }

    public async startListening(options?: VoiceListenOptions): Promise<void> {
        this.currentTranscript = '';
        await this.cleanupListeners();

        const startedHandle = await OrionVoiceNative.addListener('voiceStarted', () => {
            options?.onStateChange?.('LISTENING');
        });

        const partialHandle = await OrionVoiceNative.addListener('voicePartial', (data) => {
            if (data?.text) {
                this.currentTranscript = data.text;
                options?.onPartial?.(data.text);
            }
        });

        const completedHandle = await OrionVoiceNative.addListener('voiceCompleted', (data) => {
            const final = data?.text || this.currentTranscript;
            this.currentTranscript = final;
            options?.onStateChange?.('READY');
            if (this.onCompletedResolver) {
                this.onCompletedResolver(final);
                this.onCompletedResolver = null;
            }
        });

        const errorHandle = await OrionVoiceNative.addListener('voiceError', (data) => {
            options?.onStateChange?.('ERROR');
            if (this.onErrorRejecter) {
                this.onErrorRejecter(new Error(data?.error || 'Voice recognition error'));
                this.onErrorRejecter = null;
            }
        });

        this.handles.push(startedHandle, partialHandle, completedHandle, errorHandle);

        await OrionVoiceNative.start({
            language: options?.language || 'en-US'
        });
    }

    public async stopListening(): Promise<string> {
        return new Promise(async (resolve, reject) => {
            this.onCompletedResolver = resolve;
            this.onErrorRejecter = reject;

            try {
                const res = await OrionVoiceNative.stop();
                if (res?.transcript) {
                    this.currentTranscript = res.transcript;
                    resolve(res.transcript);
                }
            } catch (e) {
                // If stop fails but we have transcript, resolve it
                if (this.currentTranscript) {
                    resolve(this.currentTranscript);
                } else {
                    reject(e);
                }
            }
        });
    }

    public async cancel(): Promise<void> {
        try {
            await OrionVoiceNative.cancel();
        } finally {
            await this.cleanupListeners();
        }
    }

    private async cleanupListeners(): Promise<void> {
        for (const h of this.handles) {
            try {
                await h.remove();
            } catch { }
        }
        this.handles = [];
    }
}

export const capacitorVoiceProvider = new CapacitorVoiceProvider();
