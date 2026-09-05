import { NextResponse } from 'next/server';
import { aiService, organizerCloudProvider, TaskType } from '@/services/ai';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, model, temperature, maxTokens, streaming, taskType } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'invalid_request', userMessage: 'messages array is required' },
                { status: 400 }
            );
        }

        const completion = await aiService.execute({
            taskType: taskType || TaskType.API_EXPLANATION,
            provider: 'organizer',
            messages,
            model,
            temperature,
            maxTokens,
            streaming
        });

        return NextResponse.json({
            content: completion.text || completion.content,
            model: completion.model,
            provider: completion.provider,
            usage: completion.usage,
            latency: completion.latency
        });
    } catch (error: any) {
        return aiService.formatErrorResponse(error);
    }
}

export async function GET() {
    const config = organizerCloudProvider.getConfigurationSummary();
    return NextResponse.json({
        provider: 'organizer',
        configured: config.isConfigured,
        model: config.defaultModel,
        authHeader: config.authHeaderName,
        endpoint: config.baseUrl
    });
}
