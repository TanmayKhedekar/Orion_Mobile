import { TextToSpeechProvider, TTSState, TTSOptions } from './types';
import { capacitorVoiceProvider } from './providers/capacitorVoiceProvider';
import { webSpeechProvider } from './providers/webSpeechProvider';

/**
 * Strips code blocks, markdown symbols, and technical syntax to create fluent,
 * natural-sounding text for speech synthesis.
 */
export function cleanTextForSpeech(markdown: string): string {
    if (!markdown) return '';

    let text = markdown;

    // Replace multi-line code blocks with a brief spoken placeholder
    text = text.replace(/```(?:[\w-]+)?\s*[\s\S]*?```/g, '. Code snippet provided in message. ');

    // Replace inline code blocks `code` with just code
    text = text.replace(/`([^`]+)`/g, '$1');

    // Replace markdown links [text](url) with just text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove markdown headers #, ##, ###
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Remove bold and italics formatting **text**, *text*, __text__, _text_
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');

    // Remove markdown list bullets and numbers
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // Remove markdown blockquotes >
    text = text.replace(/^\s*>\s*/gm, '');

    // Remove markdown horizontal rules
    text = text.replace(/^---+$/gm, '');

    // Remove markdown table syntax |
    text = text.replace(/\|/g, ' ');

    // Clean multiple line breaks and spaces
    text = text.replace(/\n+/g, ' ');
    text = text.replace(/\s{2,}/g, ' ');

    return text.trim();
}

export class TTSService {
    private providers: TextToSpeechProvider[] = [
        capacitorVoiceProvider,
        webSpeechProvider
    ];

    private activeProvider: TextToSpeechProvider | null = null;
    private state: TTSState = 'IDLE';
    private stateListeners: Array<(state: TTSState, activeTextId?: string) => void> = [];
    private currentUtteranceId: string | null = null;

    public getState(): TTSState {
        return this.state;
    }

    public getActiveUtteranceId(): string | null {
        return this.currentUtteranceId;
    }

    public onStateChange(listener: (state: TTSState, activeTextId?: string) => void): () => void {
        this.stateListeners.push(listener);
        return () => {
            this.stateListeners = this.stateListeners.filter(l => l !== listener);
        };
    }

    private setState(newState: TTSState, utteranceId?: string) {
        this.state = newState;
        if (newState === 'IDLE') {
            this.currentUtteranceId = null;
        } else if (utteranceId) {
            this.currentUtteranceId = utteranceId;
        }

        for (const listener of this.stateListeners) {
            try {
                listener(newState, this.currentUtteranceId || undefined);
            } catch { }
        }
    }

    public async getBestProvider(): Promise<TextToSpeechProvider> {
        for (const provider of this.providers) {
            if (await provider.isAvailable()) {
                return provider;
            }
        }
        return webSpeechProvider;
    }

    public async speak(rawText: string, utteranceId?: string, options?: TTSOptions): Promise<void> {
        // If already speaking the same text, toggle off (stop)
        if (this.state === 'SPEAKING' && this.currentUtteranceId === utteranceId) {
            await this.stop();
            return;
        }

        // Stop any active utterance first
        await this.stop();

        const cleanText = cleanTextForSpeech(rawText);
        if (!cleanText) return;

        this.activeProvider = await this.getBestProvider();
        const activeId = utteranceId || `tts_${Date.now()}`;
        this.setState('SPEAKING', activeId);

        console.log(`[TTS DEBUG] Provider: ${this.activeProvider.name} | Speaking ${cleanText.length} chars | Lang: ${options?.language || 'en-US'}`);

        try {
            await this.activeProvider.speak(cleanText, {
                ...options,
                onStart: () => {
                    this.setState('SPEAKING', activeId);
                    options?.onStart?.();
                },
                onEnd: () => {
                    this.setState('IDLE');
                    options?.onEnd?.();
                },
                onError: (err) => {
                    this.setState('ERROR');
                    options?.onError?.(err);
                    setTimeout(() => this.setState('IDLE'), 1000);
                }
            });
        } catch (error: any) {
            this.setState('ERROR');
            console.error(`[TTS DEBUG] Speech synthesis error: ${error?.message || 'Unknown error'}`);
            setTimeout(() => this.setState('IDLE'), 1000);
        }
    }

    public async stop(): Promise<void> {
        if (this.activeProvider) {
            try {
                await this.activeProvider.stop();
            } catch { }
        }
        // Also cancel web speech synthesis as a safeguard
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this.setState('IDLE');
    }

    public async isSpeaking(): Promise<boolean> {
        if (this.activeProvider) {
            return this.activeProvider.isSpeaking();
        }
        return this.state === 'SPEAKING';
    }
}

export const ttsService = new TTSService();
