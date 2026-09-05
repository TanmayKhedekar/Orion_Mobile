import { AIProvider, AIProviderType, AIRequest, AIResponse, AIHealthStatus } from '../types';
import { logAIRequest, logAIResponse, logAIError } from '../logger';

export class OrganizerCloudProvider implements AIProvider {
    public readonly id: AIProviderType = 'organizer';
    public readonly name: string = 'Organizer Cloud Provider (OpenRouter/Qwen)';

    private defaultTimeoutMs: number = 30000;

    private getBaseUrl(): string {
        return (process.env.ORGANIZER_AI_BASE_URL || '').trim().replace(/^["']|["']$/g, '');
    }

    private getApiKey(): string {
        return (process.env.ORGANIZER_AI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
    }

    private getAuthHeaderName(): string {
        const raw = (process.env.ORGANIZER_AI_AUTH_HEADER || 'Authorization').trim().replace(/^["']|["']$/g, '');
        if (raw.startsWith('sk-') || raw.length > 30) {
            return 'Authorization';
        }
        return raw || 'Authorization';
    }

    private getDefaultModel(): string {
        return (process.env.ORGANIZER_AI_MODEL || 'qwen/qwen-max').trim().replace(/^["']|["']$/g, '');
    }

    public isConfigured(): boolean {
        return !!(this.getBaseUrl() && this.getApiKey());
    }

    public getConfigurationSummary() {
        return {
            isConfigured: this.isConfigured(),
            baseUrl: this.getBaseUrl() || '(Not set)',
            authHeaderName: this.getAuthHeaderName(),
            defaultModel: this.getDefaultModel(),
        };
    }

    public getEndpointUrl(): string {
        const cleanBase = this.getBaseUrl().replace(/\/+$/, '');
        if (cleanBase.endsWith('/chat/completions')) {
            return cleanBase;
        }
        if (cleanBase.endsWith('/v1')) {
            return `${cleanBase}/chat/completions`;
        }
        if (cleanBase.endsWith('/api')) {
            return `${cleanBase}/v1/chat/completions`;
        }
        return `${cleanBase}/chat/completions`;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'HTTP-Referer': 'https://orion-ai.internal',
            'X-Title': 'Orion API Intelligence',
        };

        const headerKey = this.getAuthHeaderName();
        const rawKey = this.getApiKey();

        if (headerKey.toLowerCase() === 'authorization') {
            headers['Authorization'] = rawKey.startsWith('Bearer ') ? rawKey : `Bearer ${rawKey}`;
        } else {
            headers[headerKey] = rawKey;
        }

        return headers;
    }

    private resolveModel(requestedModel?: string): string {
        let model = (requestedModel || this.getDefaultModel() || 'qwen/qwen3.7-max').trim();
        if (model === 'qwen/qwen-max' || model === 'qwen-max' || model === 'organizer-default') {
            model = 'qwen/qwen3.7-max';
        }
        return model;
    }

    public async generate(request: AIRequest): Promise<AIResponse> {
        if (!this.isConfigured()) {
            throw new Error('Organizer AI API is not configured. Missing ORGANIZER_AI_BASE_URL or ORGANIZER_AI_API_KEY.');
        }

        const model = this.resolveModel(request.model);
        const endpointUrl = this.getEndpointUrl();
        const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;

        // Assemble messages
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

        const payload: Record<string, any> = {
            model: model,
            messages: formattedMessages
        };

        if (typeof request.temperature === 'number') {
            payload.temperature = request.temperature;
        }
        if (typeof request.maxTokens === 'number') {
            payload.max_tokens = request.maxTokens;
        }
        if (request.streaming) {
            payload.stream = true;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const startTime = Date.now();

        logAIRequest(this.id, model, formattedMessages.length, {
            taskType: request.taskType,
            temperature: request.temperature,
            maxTokens: request.maxTokens
        });

        // Safe Diagnostic Logging (Never exposes keys or secrets)
        console.log('[Organizer Debug]');
        console.log('Base URL:', this.getBaseUrl());
        console.log('Final Endpoint:', endpointUrl);
        console.log('Auth Header:', this.getAuthHeaderName());
        console.log('API Key Present:', !!this.getApiKey());
        console.log('Model:', model);
        console.log('Method: POST');

        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errText = await response.text();
                let errJson: any = null;
                try {
                    errJson = JSON.parse(errText);
                } catch { }

                const message = errJson?.error?.message || errJson?.message || errText || `Organizer AI request failed with status ${response.status}`;
                logAIResponse(this.id, model, latency, response.status);

                const errorObj: any = new Error(message);
                errorObj.status = response.status;
                errorObj.error = errJson?.error || message;
                throw errorObj;
            }

            const data = await response.json();
            logAIResponse(this.id, model, latency, 200);

            const choiceMsg = data?.choices?.[0]?.message;
            const textOutput = choiceMsg?.content || choiceMsg?.reasoning || choiceMsg?.reasoning_details?.[0]?.text || data?.content || (typeof data === 'string' ? data : JSON.stringify(data));
            const finishReason = data?.choices?.[0]?.finish_reason || 'stop';

            return {
                text: textOutput || '',
                content: textOutput || '',
                model: data?.model || model,
                provider: this.id,
                latency,
                finishReason,
                usage: {
                    promptTokens: data?.usage?.prompt_tokens,
                    completionTokens: data?.usage?.completion_tokens,
                    totalTokens: data?.usage?.total_tokens
                },
                metadata: {
                    taskType: request.taskType,
                    ...request.metadata
                }
            };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                const timeoutError: any = new Error(`Organizer AI request timed out after ${timeoutMs}ms.`);
                timeoutError.status = 504;
                logAIError(this.id, timeoutError);
                throw timeoutError;
            }

            logAIError(this.id, error);
            throw error;
        }
    }

    public async checkHealth(): Promise<AIHealthStatus> {
        const model = this.getDefaultModel();
        if (!this.isConfigured()) {
            return {
                provider: this.id,
                status: 'unconfigured',
                model,
                message: 'ORGANIZER_AI_BASE_URL or ORGANIZER_AI_API_KEY not set in environment.'
            };
        }

        const startTime = Date.now();
        try {
            await this.generate({
                messages: [{ role: 'user', content: 'health_check_ping' }],
                maxTokens: 5,
                timeoutMs: 8000
            });

            return {
                provider: this.id,
                status: 'healthy',
                model,
                latencyMs: Date.now() - startTime,
                message: 'Organizer AI API is reachable and operating normally.'
            };
        } catch (error: any) {
            return {
                provider: this.id,
                status: 'error',
                model,
                latencyMs: Date.now() - startTime,
                message: error.message || 'Failed to connect to Organizer AI API.'
            };
        }
    }
}

export const organizerCloudProvider = new OrganizerCloudProvider();
