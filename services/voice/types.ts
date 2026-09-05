/**
 * Orion Voice AI & Speech-to-Text / Text-to-Speech Abstraction Types
 */

export type VoiceState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'TRANSCRIBING' | 'READY' | 'ERROR';

export type TTSState = 'IDLE' | 'SPEAKING' | 'PAUSED' | 'ERROR';

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
    onResult?: (finalText: string) => void;
    onStateChange?: (state: VoiceState) => void;
    onError?: (error: string) => void;
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

export interface TTSOptions {
    language?: string; // 'en-US', 'hi-IN', etc.
    rate?: number; // 0.5 to 2.0 (default: 1.0)
    pitch?: number; // 0.5 to 1.5 (default: 1.0)
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
}

export interface TextToSpeechProvider {
    readonly id: string;
    readonly name: string;
    isAvailable(): Promise<boolean>;
    speak(text: string, options?: TTSOptions): Promise<void>;
    stop(): Promise<void>;
    isSpeaking(): Promise<boolean>;
}
