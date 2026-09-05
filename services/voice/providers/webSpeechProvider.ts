import { SpeechToTextProvider, TextToSpeechProvider, VoiceCapabilities, VoiceListenOptions, TTSOptions } from '../types';

export class WebSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
    public readonly id = 'webspeech';
    public readonly name = 'Browser Web Speech & Synthesis API';

    private recognition: any = null;
    private isRunning = false;
    private isFinalized = false;
    private currentTranscript = '';
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private onCompletedResolver: ((text: string) => void) | null = null;
    private onErrorRejecter: ((err: any) => void) | null = null;

    private getSpeechRecognitionClass(): any {
        if (typeof window === 'undefined') return null;
        return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
    }

    public async isAvailable(): Promise<boolean> {
        return !!this.getSpeechRecognitionClass() || (typeof window !== 'undefined' && !!window.speechSynthesis);
    }

    public async getCapabilities(): Promise<VoiceCapabilities> {
        return {
            provider: 'webspeech',
            name: this.name,
            model: 'Browser Built-in Speech Engine',
            onDevice: false,
            npuAccelerated: false,
            supportsPartial: true,
            supportedLanguages: ['en-US', 'hi-IN', 'en-IN']
        };
    }

    public async startListening(options?: VoiceListenOptions): Promise<void> {
        const SpeechClass = this.getSpeechRecognitionClass();
        if (!SpeechClass) {
            throw new Error('Web Speech API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or the Orion Android APK.');
        }

        if (this.isRunning) {
            await this.cancel();
        }

        this.currentTranscript = '';
        this.isFinalized = false;
        this.recognition = new SpeechClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.lang = options?.language || 'en-US';

        this.recognition.onstart = () => {
            this.isRunning = true;
            options?.onStateChange?.('LISTENING');
        };

        this.recognition.onresult = (event: any) => {
            let interimText = '';
            let finalText = '';

            for (let i = 0; i < event.results.length; ++i) {
                const item = event.results[i];
                if (item && item[0]) {
                    if (item.isFinal) {
                        finalText += item[0].transcript + ' ';
                    } else {
                        interimText += item[0].transcript;
                    }
                }
            }

            const activeText = (finalText + interimText).trim();
            if (activeText) {
                this.currentTranscript = activeText;
                options?.onPartial?.(activeText);
            }
        };

        this.recognition.onerror = (event: any) => {
            console.warn('[VOICE DEBUG] Web Speech recognition notice:', event?.error);
            // Handle silence or no-speech gracefully
            if (event?.error === 'no-speech' || event?.error === 'aborted') {
                const text = this.currentTranscript.trim();
                if (text && !this.isFinalized) {
                    this.isFinalized = true;
                    options?.onResult?.(text);
                }
                options?.onStateChange?.('READY');
                return;
            }

            this.isRunning = false;
            options?.onStateChange?.('ERROR');
            options?.onError?.(event?.error || 'Speech recognition error');
            if (this.onErrorRejecter) {
                this.onErrorRejecter(new Error(event?.error || 'Speech recognition error'));
                this.onErrorRejecter = null;
            }
        };

        this.recognition.onend = () => {
            this.isRunning = false;
            options?.onStateChange?.('READY');
            const final = this.currentTranscript.trim();
            if (final && !this.isFinalized) {
                this.isFinalized = true;
                options?.onResult?.(final);
            }
            if (this.onCompletedResolver) {
                this.onCompletedResolver(final);
                this.onCompletedResolver = null;
            }
        };

        try {
            this.recognition.start();
        } catch (e: any) {
            this.isRunning = false;
            throw e;
        }
    }

    public async stopListening(): Promise<string> {
        return new Promise((resolve) => {
            const final = this.currentTranscript.trim();
            if (!this.isRunning || !this.recognition) {
                resolve(final);
                return;
            }

            this.onCompletedResolver = resolve;
            try {
                this.recognition.stop();
            } catch {
                resolve(final);
            }
        });
    }

    public async cancel(): Promise<void> {
        if (this.recognition) {
            try {
                this.recognition.abort();
            } catch { }
            this.recognition = null;
        }
        this.isRunning = false;
    }

    // ==========================================
    // TEXT-TO-SPEECH (SPEECH SYNTHESIS)
    // ==========================================

    public async speak(text: string, options?: TTSOptions): Promise<void> {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            throw new Error('SpeechSynthesis is not supported in this environment.');
        }

        // Cancel and resume speech synthesis (required by mobile Chrome)
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utterance;
        utterance.lang = options?.language || 'en-US';
        utterance.rate = options?.rate || 1.0;
        utterance.pitch = options?.pitch || 1.0;

        // Try to pick a natural voice if available
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
            const langPrefix = (options?.language || 'en').split('-')[0];
            const matchingVoice = voices.find(v => v.lang.startsWith(langPrefix) && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium')))
                || voices.find(v => v.lang.startsWith(langPrefix));
            if (matchingVoice) {
                utterance.voice = matchingVoice;
            }
        }

        utterance.onstart = () => {
            options?.onStart?.();
        };

        utterance.onend = () => {
            this.currentUtterance = null;
            options?.onEnd?.();
        };

        utterance.onerror = (e) => {
            console.error('[TTS DEBUG] Web Speech synthesis error:', e);
            this.currentUtterance = null;
            options?.onError?.(e);
        };

        window.speechSynthesis.speak(utterance);

        // Workaround for mobile browsers where speak might be paused initially
        setTimeout(() => {
            if (window.speechSynthesis && window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
        }, 100);
    }

    public async stop(): Promise<void> {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            this.currentUtterance = null;
        }
    }

    public async isSpeaking(): Promise<boolean> {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            return window.speechSynthesis.speaking;
        }
        return false;
    }
}

export const webSpeechProvider = new WebSpeechProvider();
