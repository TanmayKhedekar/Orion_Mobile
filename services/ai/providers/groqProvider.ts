import Groq from 'groq-sdk';
import { AIProvider, AIProviderType, AIRequest, AIResponse, AIHealthStatus } from '../types';
import { logAIRequest, logAIResponse, logAIError } from '../logger';

export class GroqProvider implements AIProvider {
    public readonly id: AIProviderType = 'groq';
    public readonly name: string = 'Groq Cloud Provider';

    private groqInstance: Groq | null = null;
    private apiKey: string;
    private defaultModel: string;
    private defaultTimeoutMs: number;

    constructor() {
        this.apiKey = (process.env.GROQ_API_KEY || '').trim();
        this.defaultModel = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
        this.defaultTimeoutMs = 30000;

        if (this.apiKey) {
            try {
                this.groqInstance = new Groq({ apiKey: this.apiKey });
            } catch (e) {
                this.groqInstance = null;
            }
        }
    }

    public isConfigured(): boolean {
        return !!(this.apiKey && this.apiKey !== 'dummy_key_for_build');
    }

    public async generate(request: AIRequest): Promise<AIResponse> {
        if (!this.isConfigured()) {
            throw new Error('Groq API key is not configured in GROQ_API_KEY.');
        }

        if (!this.groqInstance) {
            this.groqInstance = new Groq({ apiKey: this.apiKey });
        }

        const model = request.model || this.defaultModel;
        const startTime = Date.now();

        // Assemble messages including optional systemPrompt or context
        const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

        if (request.systemPrompt) {
            formattedMessages.push({ role: 'system', content: request.systemPrompt });
        }

        if (request.context) {
            const contextText = typeof request.context === 'string'
                ? request.context
                : JSON.stringify(request.context);
            formattedMessages.push({
                role: 'system',
                content: `Additional Context:\n${contextText}`
            });
        }

        formattedMessages.push(...request.messages);

        logAIRequest(this.id, model, formattedMessages.length, {
            taskType: request.taskType,
            temperature: request.temperature,
            maxTokens: request.maxTokens
        });

        try {
            const completion = await this.groqInstance.chat.completions.create({
                messages: formattedMessages as any,
                model: model,
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens ?? 2048,
            });

            const latency = Date.now() - startTime;
            logAIResponse(this.id, model, latency, 200);

            const textOutput = completion.choices[0]?.message?.content || '';
            const finishReason = completion.choices[0]?.finish_reason || 'stop';

            return {
                text: textOutput,
                content: textOutput,
                model: completion.model || model,
                provider: this.id,
                latency,
                finishReason,
                usage: {
                    promptTokens: completion.usage?.prompt_tokens,
                    completionTokens: completion.usage?.completion_tokens,
                    totalTokens: completion.usage?.total_tokens,
                },
                metadata: {
                    taskType: request.taskType,
                    ...request.metadata
                }
            };
        } catch (error: any) {
            logAIError(this.id, error);
            throw error;
        }
    }

    public async checkHealth(): Promise<AIHealthStatus> {
        if (!this.isConfigured()) {
            return {
                provider: this.id,
                status: 'unconfigured',
                model: this.defaultModel,
                message: 'GROQ_API_KEY is not configured in environment.'
            };
        }

        const startTime = Date.now();
        try {
            await this.generate({
                messages: [{ role: 'user', content: 'health_check' }],
                maxTokens: 5,
                timeoutMs: 8000
            });

            return {
                provider: this.id,
                status: 'healthy',
                model: this.defaultModel,
                latencyMs: Date.now() - startTime,
                message: 'Groq API is operating normally.'
            };
        } catch (error: any) {
            return {
                provider: this.id,
                status: 'error',
                model: this.defaultModel,
                latencyMs: Date.now() - startTime,
                message: error.message || 'Groq API health check failed.'
            };
        }
    }
}

export const groqProvider = new GroqProvider();
