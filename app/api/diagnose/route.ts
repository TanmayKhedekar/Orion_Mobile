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
        const body = await req.json();
        const { status, responseBody, requestHeaders, requestUrl, requestMethod, requestBody, spec } = body;

        if (!process.env.GROQ_API_KEY) {
            return NextResponse.json(
                { error: 'Groq API key not configured' },
                { status: 500 }
            );
        }

        let trimmedSpec = null;
        if (spec) {
            try {
                const parsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
                trimmedSpec = aggressiveTrimSpec(parsed);
            } catch (e) { }
        }

        const systemPrompt = `You are an expert API debugging assistant. You must analyze the provided API error details and return a JSON response diagnosing the problem.

Format your JSON EXACTLY like this:
{
  "diagnosis": "One sentence stating what went wrong",
  "rootCause": "Explanation of why it happened",
  "fix": "Exact actionable fix in plain English",
  "fixedCode": "If the fix involves a code change, show the corrected snippet. Otherwise leave blank.",
  "severity": "critical" // One of: "critical", "warning", "info"
}

CRITICAL: Your entire response must be a single valid JSON object with no text before or after it. All code samples must have newlines escaped as \\n within the JSON string values. Do not use actual newlines inside JSON string values.`;

        const userContent = `Status: ${status}
Method: ${requestMethod}
URL: ${requestUrl}
Headers: ${JSON.stringify(requestHeaders)}
Request Body: ${requestBody || 'None'}
Response Body: ${responseBody}${trimmedSpec ? `\nOpenAPI Spec Context: ${JSON.stringify(trimmedSpec)}` : ''}`;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: userContent
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2,
            max_tokens: 2000,
        });

        const textContent = completion.choices[0]?.message?.content || '';

        let jsonResult: any;
        try {
            jsonResult = JSON.parse(textContent);
        } catch (e) {
            jsonResult = safeParseJSON(textContent);
        }

        return NextResponse.json(jsonResult);
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

