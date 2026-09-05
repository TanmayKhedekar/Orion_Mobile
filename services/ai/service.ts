import { AIProvider, AIProviderType, AIRequest, AIResponse, AIHealthStatus } from './types';
import { groqProvider } from './providers/groqProvider';
import { organizerCloudProvider } from './providers/organizerProvider';
import { localAIProvider } from './providers/localProvider';
import { AIRouter, aiRouter } from './router';
import { NextResponse } from 'next/server';

export class AIService {
    private providers: Map<AIProviderType, AIProvider> = new Map();
    private router: AIRouter;

    constructor() {
        this.router = aiRouter;

        // Register standard providers
        this.registerProvider(groqProvider);
        this.registerProvider(organizerCloudProvider);
        this.registerProvider(localAIProvider);
    }

    public registerProvider(provider: AIProvider): void {
        this.providers.set(provider.id, provider);
    }

    /**
     * Resolves the active default provider ID from environment variable or fallback.
     */
    public getActiveProviderType(): AIProviderType {
        const envVal = (process.env.AI_PROVIDER || 'groq').toLowerCase().trim();
        if (envVal === 'organizer') return 'organizer';
        if (envVal === 'local') return 'local';
        return 'groq';
    }

    /**
     * Retrieves provider by ID or resolves the current active default provider.
     */
    public getProvider(id?: AIProviderType): AIProvider {
        const targetId = id || this.getActiveProviderType();
        const provider = this.providers.get(targetId);

        if (!provider) {
            throw new Error(`AI Provider '${targetId}' is not registered in the AI Service.`);
        }

        return provider;
    }

    /**
     * Executes an AI request through deterministic AI Router selection.
     */
    public async execute(request: AIRequest): Promise<AIResponse> {
        // 1. Determine optimal provider via deterministic AI Router
        const decision = this.router.route(request, this.providers);
        this.router.logDecision(decision);

        // 2. Fetch the target provider
        const provider = this.getProvider(decision.provider);

        try {
            // 3. Generate completion
            const response = await provider.generate(request);

            // 4. Attach routing decision telemetry
            response.routingDecision = decision;
            return response;
        } catch (error: any) {
            // Graceful fallback to Groq if allowed and primary target is not already Groq
            const groqProvider = this.providers.get('groq');
            if (
                decision.fallbackAllowed &&
                decision.provider !== 'groq' &&
                groqProvider &&
                groqProvider.isConfigured()
            ) {
                console.warn(
                    `[AI Service Fallback] Provider '${decision.provider}' failed (${error?.message || error?.status || 'Error'}). Falling back to GROQ.`
                );

                const fallbackResponse = await groqProvider.generate(request);
                fallbackResponse.routingDecision = {
                    ...decision,
                    originalTarget: decision.provider,
                    fallbackApplied: true,
                    provider: 'groq',
                    reason: `${decision.reason} -> Runtime fallback to GROQ Cloud after ${decision.provider} failure: ${error?.message || 'Error'}`
                };
                return fallbackResponse;
            }

            throw error;
        }
    }

    /**
     * Backward-compatible alias for execute.
     */
    public async generateChatCompletion(request: AIRequest): Promise<AIResponse> {
        return this.execute(request);
    }

    /**
     * Gathers real-time health diagnostic status across all registered providers.
     */
    public async getHealthReport(): Promise<{
        activeProvider: AIProviderType;
        timestamp: string;
        router: {
            defaultMode: string;
            supportedModes: string[];
            deterministicRulesCount: number;
        };
        providers: Record<AIProviderType, AIHealthStatus>;
    }> {
        const activeProvider = this.getActiveProviderType();
        const healthEntries = await Promise.all(
            Array.from(this.providers.values()).map(async (p) => {
                const status = await p.checkHealth();
                return [p.id, status] as const;
            })
        );

        const providersRecord = Object.fromEntries(healthEntries) as Record<AIProviderType, AIHealthStatus>;

        return {
            activeProvider,
            timestamp: new Date().toISOString(),
            router: {
                defaultMode: 'auto',
                supportedModes: ['auto', 'local', 'cloud', 'groq'],
                deterministicRulesCount: 9
            },
            providers: providersRecord
        };
    }

    /**
     * Standardized error response formatter for API routes.
     */
    public formatErrorResponse(error: any): NextResponse {
        const errorMessage = error?.message || error?.error?.message || '';
        const status = error?.status || error?.statusCode || 500;

        // Token / Spec size limit exceeded
        if (status === 413 || errorMessage.includes('Request too large') || errorMessage.includes('tokens per minute')) {
            return NextResponse.json({
                error: 'spec_too_large',
                userMessage: 'This API spec is too large to process on our current plan. We\'ve loaded the first 15 endpoints for you — try using a smaller spec or a specific section of this API.',
                tip: 'Large specs work best with targeted queries on specific endpoint groups.'
            }, { status: 413 });
        }

        // Context length exceeded
        if (status === 400 && errorMessage.includes('reduce the length')) {
            return NextResponse.json({
                error: 'context_too_long',
                userMessage: 'This API spec has too many endpoints to generate a complete response at once.',
                tip: 'Try loading a smaller API spec or focusing on specific paths.'
            }, { status: 400 });
        }

        // Rate limit
        if (status === 429) {
            return NextResponse.json({
                error: 'rate_limit',
                userMessage: 'AI quota/rate limit reached. Please try again shortly.',
                tip: 'Provider rate limits reset periodically.'
            }, { status: 429 });
        }

        // Timeout
        if (status === 504 || error?.name === 'AbortError') {
            return NextResponse.json({
                error: 'timeout',
                userMessage: 'The AI provider took too long to respond.',
                tip: 'Please retry or verify network connectivity to the provider endpoint.'
            }, { status: 504 });
        }

        // Missing configuration
        if (errorMessage.includes('not configured')) {
            return NextResponse.json({
                error: 'provider_not_configured',
                userMessage: errorMessage,
                tip: 'Check your server environment variables in .env or .env.local.'
            }, { status: 500 });
        }

        // Generic fallback
        return NextResponse.json({
            error: 'ai_error',
            userMessage: errorMessage || 'Something went wrong with the AI response. Please try again.',
        }, { status: 500 });
    }
}

export const aiService = new AIService();
