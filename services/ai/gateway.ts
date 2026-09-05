import { aiService } from './service';
import { AIChatOptions, AIChatResponse, AIProviderType, AIHealthStatus } from './types';
import { NextResponse } from 'next/server';

/**
 * AIGateway bridges legacy calls to the new AIService provider architecture.
 */
export class AIGateway {
    public getActiveProvider(): AIProviderType {
        return aiService.getActiveProviderType();
    }

    public async generateChatCompletion(options: AIChatOptions): Promise<AIChatResponse> {
        return aiService.execute(options);
    }

    public async getHealthReport(): Promise<{
        activeProvider: AIProviderType;
        timestamp: string;
        providers: Record<AIProviderType, AIHealthStatus>;
    }> {
        return aiService.getHealthReport();
    }

    public formatErrorResponse(error: any): NextResponse {
        return aiService.formatErrorResponse(error);
    }
}

export const aiGateway = new AIGateway();
