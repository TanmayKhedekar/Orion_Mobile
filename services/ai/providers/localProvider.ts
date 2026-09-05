import { AIProvider, AIProviderType, AIRequest, AIResponse, AIHealthStatus } from '../types';

/**
 * LocalAIProvider: Stub & Interface implementation for Qualcomm Snapdragon NPU on-device inference.
 * This stub fulfills the common AIProvider contract and enables future zero-downtime activation.
 */
export class LocalAIProvider implements AIProvider {
    public readonly id: AIProviderType = 'local';
    public readonly name: string = 'Local Snapdragon AI Provider (On-Device NPU)';
    public readonly defaultModel: string = 'snapdragon-npu-local';

    public isConfigured(): boolean {
        // Reserved for on-device NPU runtime detection
        return false;
    }

    public async generate(request: AIRequest): Promise<AIResponse> {
        throw new Error(
            'Local Snapdragon NPU provider is currently in stub mode and not yet active for on-device inference.'
        );
    }

    public async checkHealth(): Promise<AIHealthStatus> {
        return {
            provider: this.id,
            status: 'unconfigured',
            model: this.defaultModel,
            message: 'Local Snapdragon NPU runtime stub registered. On-device execution interface is ready.'
        };
    }
}

export const localAIProvider = new LocalAIProvider();
