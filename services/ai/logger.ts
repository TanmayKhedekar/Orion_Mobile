const SENSITIVE_KEY_PATTERNS = [
    /key/i,
    /token/i,
    /secret/i,
    /auth/i,
    /bearer/i,
    /password/i,
    /credential/i
];

/**
 * Sanitizes header objects or payloads by replacing sensitive values with [REDACTED].
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        const isSensitive = SENSITIVE_KEY_PATTERNS.some(p => p.test(k));
        sanitized[k] = isSensitive ? '[REDACTED]' : v;
    }
    return sanitized;
}

/**
 * Safe logging for AI requests without leaking API keys, private tokens, or full prompt bodies.
 */
export function logAIRequest(provider: string, model: string, messageCount: number, options?: Record<string, any>) {
    console.log(`[AI Request] Provider: ${provider} | Model: ${model} | Messages: ${messageCount} | Temp: ${options?.temperature ?? 'default'} | MaxTokens: ${options?.maxTokens ?? 'default'}`);
}

/**
 * Safe logging for AI responses.
 */
export function logAIResponse(provider: string, model: string, durationMs: number, status: number | string = 'OK') {
    console.log(`[AI Response] Provider: ${provider} | Model: ${model} | Status: ${status} | Latency: ${durationMs}ms`);
}

/**
 * Safe logging for AI errors without exposing keys or raw auth strings.
 */
export function logAIError(provider: string, error: any) {
    const safeMessage = error?.message || 'Unknown error';
    const status = error?.status || error?.statusCode || 500;
    console.error(`[AI Error] Provider: ${provider} | Status: ${status} | Message: ${safeMessage}`);
}
