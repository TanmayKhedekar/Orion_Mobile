import { NextResponse } from 'next/server';
import { aiService, TaskType } from '@/services/ai';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, provider, model, routingMode } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: 'invalid_request', userMessage: 'messages array is required' },
                { status: 400 }
            );
        }

        const completion = await aiService.execute({
            taskType: TaskType.API_EXPLANATION,
            routingMode,
            provider,
            model,
            temperature: 0.7,
            maxTokens: 1024,
            messages: [
                {
                    role: 'system',
                    content: `You are an expert API integration specialist and developer assistant. 
Your goal is to help developers understand, integrate, and debug APIs based on OpenAPI specifications.
Always provide clean, modern, and production-ready code. Ensure correct authentication placeholders and error handling in your code examples.
You must return only the response directly, without formatting it in large code blocks if not necessary, but to wrap code inside markdown when providing code.`,
                },
                ...messages,
            ],
        });

        return NextResponse.json({
            content: completion.text || completion.content || '',
            provider: completion.provider,
            model: completion.model,
            routingDecision: completion.routingDecision,
            usage: completion.usage,
            latency: completion.latency
        });
    } catch (error: any) {
        console.error('Route error in /api/chat:', error);
        return aiService.formatErrorResponse(error);
    }
}
