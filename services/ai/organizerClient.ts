import { organizerCloudProvider } from './providers/organizerProvider';
import { AIChatOptions, AIChatResponse, AIHealthStatus } from './types';

/**
 * OrganizerAIClient: Wrapper around OrganizerCloudProvider for backward compatibility.
 */
export class OrganizerAIClient {
    public isConfigured(): boolean {
        return organizerCloudProvider.isConfigured();
    }

    public getConfigurationSummary() {
        return organizerCloudProvider.getConfigurationSummary();
    }

    public async chatCompletion(options: AIChatOptions): Promise<AIChatResponse> {
        return organizerCloudProvider.generate(options);
    }

    public async checkHealth(): Promise<AIHealthStatus> {
        return organizerCloudProvider.checkHealth();
    }
}

export const organizerAIClient = new OrganizerAIClient();
