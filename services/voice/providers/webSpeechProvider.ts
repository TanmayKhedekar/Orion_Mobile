import { SpeechToTextProvider, VoiceCapabilities, VoiceListenOptions } from '../types';

export class WebSpeechProvider implements SpeechToTextProvider {
    public readonly id = 'webspeech';
    public readonly name = 'Browser Web Speech API';

    private recognition: any = null;
    private isRunning = false;
    private currentTranscript = '';
    private onCompletedResolver: ((text: string) => void) | null = null;
    private onErrorRejecter: ((err: any) => void) | null = null;

    private getSpeechRecognitionClass(): any {
        if (typeof window === 'undefined') return null;
        return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
    }

    public async isAvailable(): Promise<boolean> {
        return !!this.getSpeechRecognitionClass();
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
            throw new Error('Web Speech API is not supported in this browser.');
        }

        if (this.isRunning) {
            await this.cancel();
        }

        this.currentTranscript = '';
        this.recognition = new SpeechClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = options?.language || 'en-US';

        this.recognition.onstart = () => {
            this.isRunning = true;
            options?.onStateChange?.('LISTENING');
        };

        this.recognition.onresult = (event: any) => {
            let interimText = '';
            let finalText = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalText += transcript;
                } else {
                    interimText += transcript;
                }
            }

            const activeText = (finalText + ' ' + interimText).trim() || this.currentTranscript;
            if (activeText) {
                this.currentTranscript = activeText;
                options?.onPartial?.(activeText);
            }
        };

        this.recognition.onerror = (event: any) => {
            this.isRunning = false;
            options?.onStateChange?.('ERROR');
            if (this.onErrorRejecter) {
                this.onErrorRejecter(new Error(event.error || 'Speech recognition error'));
                this.onErrorRejecter = null;
            }
        };

        this.recognition.onend = () => {
            this.isRunning = false;
            options?.onStateChange?.('READY');
            if (this.onCompletedResolver) {
                this.onCompletedResolver(this.currentTranscript.trim());
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
            if (!this.isRunning || !this.recognition) {
                resolve(this.currentTranscript.trim());
                return;
            }

            this.onCompletedResolver = resolve;
            try {
                this.recognition.stop();
            } catch {
                resolve(this.currentTranscript.trim());
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
}

export const webSpeechProvider = new WebSpeechProvider();
