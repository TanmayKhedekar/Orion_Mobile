/**
 * Orion Voice AI & Speech-to-Text Abstraction Types
 */

export type VoiceState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'TRANSCRIBING' | 'READY' | 'ERROR';

export interface VoiceCapabilities {
    provider: 'whisper_npu' | 'android_ondevice' | 'webspeech' | 'none';
    name: string;
    model: string;
    onDevice: boolean;
    npuAccelerated: boolean;
    supportsPartial: boolean;
    supportedLanguages: string[];
}

export interface VoiceListenOptions {
    language?: string; // 'en-US', 'hi-IN', etc.
    continuous?: boolean;
    onPartial?: (partialText: string) => void;
    onStateChange?: (state: VoiceState) => void;
}

export interface SpeechToTextProvider {
    readonly id: string;
    readonly name: string;
    isAvailable(): Promise<boolean>;
    getCapabilities(): Promise<VoiceCapabilities>;
    startListening(options?: VoiceListenOptions): Promise<void>;
    stopListening(): Promise<string>;
    cancel(): Promise<void>;
}
