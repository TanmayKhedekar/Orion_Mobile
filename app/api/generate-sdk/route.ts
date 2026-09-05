import { NextResponse } from 'next/server';
import { aiService, TaskType } from '@/services/ai';
import { aggressiveTrimSpec } from '@/lib/specTrimmer';

function safeParseJSON(raw: string) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    let jsonStr = raw.slice(start, end + 1);
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
    });
    return JSON.parse(jsonStr);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { spec, language, provider, model, routingMode } = body;

        let trimmedSpec = spec;
        if (spec) {
            try {
                const parsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
                trimmedSpec = aggressiveTrimSpec(parsed);
            } catch (e) { }
        }

        const userContent = `Target Language: ${language}
OpenAPI Specification:
${typeof trimmedSpec === 'string' ? trimmedSpec : JSON.stringify(trimmedSpec, null, 2)}`;

        // Call 1: Metadata
        const metaSystemPrompt = `You are a senior SDK engineer. You must extract metadata for building an SDK in ${language}.
Return ONLY a JSON object with these fields:
- className (string)
- usageExample (string) — a short 5-10 line usage snippet, escape all newlines as \\n
- dependencies (array of strings)

No code field. No markdown. Pure JSON only.
CRITICAL: Your entire response must be a single valid JSON object with no text before or after it.`;

        const metaCompletion = await aiService.execute({
            taskType: TaskType.CODE_GENERATION,
            routingMode,
            provider,
            model,
            temperature: 0.1,
            maxTokens: 2000,
            messages: [
                { role: 'system', content: metaSystemPrompt },
                { role: 'user', content: userContent }
            ],
        });

        const metaText = metaCompletion.text || metaCompletion.content || '';
        let metadata: any;
        try {
            metadata = JSON.parse(metaText);
        } catch (e) {
            metadata = safeParseJSON(metaText);
        }

        // Call 2: Raw SDK Code
        const codeSystemPrompt = `You are a senior SDK engineer. Generate a highly professional, modern, and production-ready SDK class for the provided OpenAPI specification in ${language}.

CRITICAL INSTRUCTIONS for SDK Code:
- Implement a single class containing all the methods.
- The constructor MUST accept a baseUrl and an apiKey.
- Create exactly one method per endpoint identified in the specification. 
- Implement Built-in retry logic (3 retries with exponential backoff) natively.
- Use native standard libraries where possible. For Python: use 'requests' or 'httpx'. For TS: use 'fetch' or 'axios'.
- Provide Descriptive error handling checking the response status.
- Add comprehensive JSDoc (for TS) or docstrings (for Python) for EVERY method.

Return ONLY the raw ${language} code for the SDK class. No JSON wrapper. No markdown fences. No explanation. Just the pure code starting from the import statements or class definition.`;

        const codeCompletion = await aiService.execute({
            taskType: TaskType.CODE_GENERATION,
            routingMode,
            provider,
            model,
            temperature: 0.1,
            maxTokens: 6000,
            messages: [
                { role: 'system', content: codeSystemPrompt },
                { role: 'user', content: userContent }
            ],
        });

        let rawCode = codeCompletion.text || codeCompletion.content || '';

        // Minor cleanup just in case LLM still returns markdown fences despite instructions
        rawCode = rawCode.trim();
        if (rawCode.startsWith('```')) {
            const firstNewline = rawCode.indexOf('\n');
            if (firstNewline !== -1) {
                rawCode = rawCode.slice(firstNewline + 1);
            }
        }
        if (rawCode.endsWith('```')) {
            rawCode = rawCode.slice(0, -3).trim();
        }

        const llmResult = {
            className: metadata?.className || 'ApiClient',
            usageExample: metadata?.usageExample || '',
            dependencies: metadata?.dependencies || [],
            code: rawCode,
            routingDecision: codeCompletion.routingDecision
        };

        return NextResponse.json(llmResult);
    } catch (error: any) {
        console.error('Route error in /api/generate-sdk:', error);
        return aiService.formatErrorResponse(error);
    }
}
