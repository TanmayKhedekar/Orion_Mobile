import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { SpeechToTextProvider, TextToSpeechProvider, VoiceCapabilities, VoiceListenOptions, TTSOptions } from '../types';

interface OrionVoiceNativePlugin {
    isAvailable(): Promise<{ available: boolean; provider: string; model: string; onDevice: boolean; npuAccelerated: boolean; ttsAvailable?: boolean }>;
    start(options?: { language?: string }): Promise<void>;
    stop(): Promise<{ transcript: string }>;
    cancel(): Promise<void>;
    speak(options: { text: string; language?: string; rate?: number; pitch?: number }): Promise<{ status: string; utteranceId: string }>;
    stopSpeaking(): Promise<{ status: string }>;
    isSpeaking(): Promise<{ speaking: boolean }>;
    addListener(eventName: 'voiceStarted', listenerFunc: () => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'voicePartial', listenerFunc: (data: { text: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'voiceCompleted', listenerFunc: (data: { text: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'voiceError', listenerFunc: (data: { error: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'ttsStarted', listenerFunc: (data: { utteranceId: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'ttsDone', listenerFunc: (data: { utteranceId: string }) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'ttsError', listenerFunc: (data: { utteranceId: string }) => void): Promise<PluginListenerHandle>;
}

const OrionVoiceNative = registerPlugin<OrionVoiceNativePlugin>('OrionVoice');

export class CapacitorVoiceProvider implements SpeechToTextProvider, TextToSpeechProvider {
    public readonly id = 'capacitor_voice';
    public readonly name = 'On-Device Android Speech & TTS Engine (Snapdragon / NPU)';

    private handles: PluginListenerHandle[] = [];
    private ttsHandles: PluginListenerHandle[] = [];
    private currentTranscript: string = '';
    private onCompletedResolver: ((text: string) => void) | null = null;
    private onErrorRejecter: ((err: any) => void) | null = null;

    public async isAvailable(): Promise<boolean> {
        try {
            if (typeof window === 'undefined') return false;
            const cap = (window as any).Capacitor;
            if (!cap) return false;

            const isNative = typeof cap.isNativePlatform === 'function'
                ? cap.isNativePlatform()
                : (cap.platform === 'android' || cap.platform === 'ios');
            const isPluginRegistered = typeof cap.isPluginAvailable === 'function'
                ? cap.isPluginAvailable('OrionVoice')
                : true;

            if (isNative || isPluginRegistered) {
                try {
                    const res = await OrionVoiceNative.isAvailable();
                    return res ? !!res.available : isNative;
                } catch {
                    return isNative;
                }
            }
            return false;
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
            const final = (data?.text || this.currentTranscript || '').trim();
            this.currentTranscript = final;
            options?.onStateChange?.('READY');
            if (final) {
                options?.onResult?.(final);
            }
            if (this.onCompletedResolver) {
                this.onCompletedResolver(final);
                this.onCompletedResolver = null;
            }
        });

        const errorHandle = await OrionVoiceNative.addListener('voiceError', (data) => {
            options?.onStateChange?.('ERROR');
            options?.onError?.(data?.error || 'Voice error');
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
                const text = (res?.transcript || this.currentTranscript || '').trim();
                this.currentTranscript = text;
                resolve(text);
            } catch (e) {
                if (this.currentTranscript) {
                    resolve(this.currentTranscript.trim());
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

    // ==========================================
    // TEXT-TO-SPEECH (VOICE OUTPUT)
    // ==========================================

    public async speak(text: string, options?: TTSOptions): Promise<void> {
        await this.cleanupTtsListeners();

        if (options?.onStart) {
            const startH = await OrionVoiceNative.addListener('ttsStarted', () => {
                options.onStart?.();
            });
            this.ttsHandles.push(startH);
        }

        if (options?.onEnd) {
            const endH = await OrionVoiceNative.addListener('ttsDone', () => {
                options.onEnd?.();
            });
            this.ttsHandles.push(endH);
        }

        if (options?.onError) {
            const errH = await OrionVoiceNative.addListener('ttsError', (data) => {
                options.onError?.(data);
            });
            this.ttsHandles.push(errH);
        }

        await OrionVoiceNative.speak({
            text,
            language: options?.language || 'en-US',
            rate: options?.rate || 1.0,
            pitch: options?.pitch || 1.0
        });
    }

    public async stop(): Promise<void> {
        await OrionVoiceNative.stopSpeaking();
        await this.cleanupTtsListeners();
    }

    public async isSpeaking(): Promise<boolean> {
        try {
            const res = await OrionVoiceNative.isSpeaking();
            return !!res?.speaking;
        } catch {
            return false;
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

    private async cleanupTtsListeners(): Promise<void> {
        for (const h of this.ttsHandles) {
            try {
                await h.remove();
            } catch { }
        }
        this.ttsHandles = [];
    }
}

export const capacitorVoiceProvider = new CapacitorVoiceProvider();
