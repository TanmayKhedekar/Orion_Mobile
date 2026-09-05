export type AIProviderType = 'groq' | 'organizer' | 'local';

export type RoutingMode = 'auto' | 'local' | 'cloud' | 'groq';

export enum TaskType {
    API_SEARCH = 'API_SEARCH',
    API_EXPLANATION = 'API_EXPLANATION',
    PARAMETER_EXPLANATION = 'PARAMETER_EXPLANATION',
    ERROR_ANALYSIS = 'ERROR_ANALYSIS',
    CODE_GENERATION = 'CODE_GENERATION',
    API_SUMMARY = 'API_SUMMARY',
    VOICE_COMMAND = 'VOICE_COMMAND',
    AGENT_PLANNING = 'AGENT_PLANNING',
    LARGE_SPEC_ANALYSIS = 'LARGE_SPEC_ANALYSIS',
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface RoutingDecision {
    provider: AIProviderType;
    reason: string;
    taskType: TaskType;
    model: string;
    fallbackAllowed: boolean;
    mode: RoutingMode;
    fallbackApplied?: boolean;
    originalTarget?: AIProviderType;
}

export interface AIRequest {
    messages: AIMessage[];
    systemPrompt?: string;
    context?: string | Record<string, any>;
    taskType?: TaskType;
    routingMode?: RoutingMode;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
    timeoutMs?: number;
    metadata?: Record<string, any>;
    provider?: AIProviderType;
}

// Backward compatibility alias for AIChatOptions
export type AIChatOptions = AIRequest;

export interface AIResponse {
    text: string;
    content: string; // Alias for text for compatibility
    provider: AIProviderType;
    model: string;
    routingDecision?: RoutingDecision;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    latency?: number;
    finishReason?: string;
    metadata?: Record<string, any>;
}

// Backward compatibility alias for AIChatResponse
export type AIChatResponse = AIResponse;

export interface AIHealthStatus {
    provider: AIProviderType;
    status: 'healthy' | 'configured' | 'unconfigured' | 'error';
    model: string;
    message?: string;
    latencyMs?: number;
}

export interface AIProvider {
    readonly id: AIProviderType;
    readonly name: string;
    isConfigured(): boolean;
    generate(request: AIRequest): Promise<AIResponse>;
    checkHealth(): Promise<AIHealthStatus>;
}
