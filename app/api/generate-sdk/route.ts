import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { aggressiveTrimSpec } from '@/lib/specTrimmer';

let groq: Groq;
try {
    groq = new Groq({
        apiKey: process.env.GROQ_API_KEY || 'dummy_key_for_build',
    });
} catch (e) { }

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
        const { spec, language } = await req.json();

        if (!process.env.GROQ_API_KEY) {
            return NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 });
        }

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

        const metaCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: metaSystemPrompt },
                { role: 'user', content: userContent }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 2000,
        });

        const metaText = metaCompletion.choices[0]?.message?.content || '';
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

        const codeCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: codeSystemPrompt },
                { role: 'user', content: userContent }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 6000,
        });

        let rawCode = codeCompletion.choices[0]?.message?.content || '';

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
            className: metadata.className,
            usageExample: metadata.usageExample,
            dependencies: metadata.dependencies,
            code: rawCode
        };

        return NextResponse.json(llmResult);
    } catch (error: any) {
        console.error('Route error:', error);

        const errorMessage = error?.message || error?.error?.message || '';
        const status = error?.status || 500;

        // Token limit exceeded
        if (status === 413 || errorMessage.includes('Request too large') || errorMessage.includes('tokens per minute')) {
            return NextResponse.json({
                error: 'spec_too_large',
                userMessage: 'This API spec is too large to process on our current plan. We\'ve loaded the first 15 endpoints for you — try using a smaller spec or a specific section of this API.',
                tip: 'Large specs like Spotify or OpenAI work best with targeted queries on specific endpoint groups.'
            }, { status: 413 });
        }

        // Context length exceeded
        if (status === 400 && errorMessage.includes('reduce the length')) {
            return NextResponse.json({
                error: 'context_too_long',
                userMessage: 'This API spec has too many endpoints to generate a complete SDK at once. Showing results for the first 15 endpoints.',
                tip: 'Try loading a smaller API spec for full SDK generation.'
            }, { status: 400 });
        }

        // Rate limit
        if (status === 429) {
            return NextResponse.json({
                error: 'rate_limit',
                userMessage: 'Daily AI quota reached. Please try again in a few minutes.',
                tip: 'Our free-tier AI plan resets every hour.'
            }, { status: 429 });
        }

        // Generic fallback
        return NextResponse.json({
            error: 'ai_error',
            userMessage: 'Something went wrong with the AI response. Please try again.',
        }, { status: 500 });
    }
}
