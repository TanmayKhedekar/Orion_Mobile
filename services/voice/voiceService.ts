import { SpeechToTextProvider, VoiceState, VoiceCapabilities, VoiceListenOptions } from './types';
import { capacitorVoiceProvider } from './providers/capacitorVoiceProvider';
import { webSpeechProvider } from './providers/webSpeechProvider';

export class VoiceService {
    private providers: SpeechToTextProvider[] = [
        capacitorVoiceProvider,
        webSpeechProvider
    ];

    private activeProvider: SpeechToTextProvider | null = null;
    private state: VoiceState = 'IDLE';
    private stateListeners: Array<(state: VoiceState) => void> = [];
    private startTime: number = 0;

    public getState(): VoiceState {
        return this.state;
    }

    public onStateChange(listener: (state: VoiceState) => void): () => void {
        this.stateListeners.push(listener);
        return () => {
            this.stateListeners = this.stateListeners.filter(l => l !== listener);
        };
    }

    private setState(newState: VoiceState) {
        this.state = newState;
        for (const listener of this.stateListeners) {
            try {
                listener(newState);
            } catch { }
        }
    }

    public async getBestProvider(): Promise<SpeechToTextProvider> {
        for (const provider of this.providers) {
            if (await provider.isAvailable()) {
                return provider;
            }
        }
        // Fallback to webSpeechProvider by default
        return webSpeechProvider;
    }

    public async isVoiceSupported(): Promise<boolean> {
        for (const provider of this.providers) {
            if (await provider.isAvailable()) {
                return true;
            }
        }
        return false;
    }

    public async getCapabilities(): Promise<VoiceCapabilities> {
        const provider = await this.getBestProvider();
        return provider.getCapabilities();
    }

    public async startListening(options?: VoiceListenOptions): Promise<void> {
        if (this.state === 'LISTENING') return;

        this.startTime = Date.now();
        this.activeProvider = await this.getBestProvider();
        const caps = await this.activeProvider.getCapabilities();

        console.log(`[VOICE DEBUG] Provider: ${caps.name} | Model: ${caps.model} | OnDevice: ${caps.onDevice} | NPU: ${caps.npuAccelerated ? 'VERIFIED' : 'NOT VERIFIED'} | Language: ${options?.language || 'en-US'} | Recording: started`);

        this.setState('LISTENING');

        try {
            await this.activeProvider.startListening({
                ...options,
                onStateChange: (s) => {
                    this.setState(s);
                    options?.onStateChange?.(s);
                },
                onPartial: (partial) => {
                    if (this.state !== 'TRANSCRIBING') {
                        this.setState('TRANSCRIBING');
                    }
                    options?.onPartial?.(partial);
                }
            });
        } catch (error: any) {
            this.setState('ERROR');
            console.error(`[VOICE DEBUG] Recording failed: ${error?.message || 'Unknown error'}`);
            throw error;
        }
    }

    public async stopListening(): Promise<string> {
        if (!this.activeProvider) {
            this.setState('IDLE');
            return '';
        }

        this.setState('PROCESSING');
        try {
            const transcript = await this.activeProvider.stopListening();
            const latency = Date.now() - this.startTime;
            const caps = await this.activeProvider.getCapabilities();

            console.log(`[VOICE DEBUG] Provider: ${caps.name} | Model: ${caps.model} | Latency: ${latency}ms | Status: complete | Words: ${transcript ? transcript.split(' ').length : 0}`);

            this.setState('READY');
            return transcript;
        } catch (error: any) {
            this.setState('ERROR');
            console.error(`[VOICE DEBUG] Transcription error: ${error?.message || 'Unknown error'}`);
            throw error;
        } finally {
            setTimeout(() => {
                if (this.state === 'READY' || this.state === 'ERROR') {
                    this.setState('IDLE');
                }
            }, 800);
        }
    }

    public async cancel(): Promise<void> {
        if (this.activeProvider) {
            try {
                await this.activeProvider.cancel();
            } catch { }
        }
        this.setState('IDLE');
    }
}

export const voiceService = new VoiceService();
