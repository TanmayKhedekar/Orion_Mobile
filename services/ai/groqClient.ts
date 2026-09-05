import { groqProvider } from './providers/groqProvider';
import { AIChatOptions, AIChatResponse, AIHealthStatus } from './types';

/**
 * GroqClient: Wrapper around GroqProvider for backward compatibility.
 */
export class GroqClient {
    public isConfigured(): boolean {
        return groqProvider.isConfigured();
    }

    public async chatCompletion(options: AIChatOptions): Promise<AIChatResponse> {
        return groqProvider.generate(options);
    }

    public async checkHealth(): Promise<AIHealthStatus> {
        return groqProvider.checkHealth();
    }
}

export const groqClient = new GroqClient();
