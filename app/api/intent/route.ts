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
    // Extract JSON block between first { and last }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    let jsonStr = raw.slice(start, end + 1);
    // Remove control characters that break JSON.parse
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
        const { goal, specs } = await req.json();

        if (!process.env.GROQ_API_KEY) {
            return NextResponse.json(
                { error: 'Groq API key not configured' },
                { status: 500 }
            );
        }

        let trimmedSpecs = specs;
        if (specs) {
            if (Array.isArray(specs)) {
                trimmedSpecs = specs.map((s: any) => {
                    const obj = typeof s === 'string' ? JSON.parse(s) : s;
                    return aggressiveTrimSpec(obj);
                });
            } else {
                const obj = typeof specs === 'string' ? JSON.parse(specs) : specs;
                trimmedSpecs = aggressiveTrimSpec(obj);
            }
        }

        const systemPrompt = `You are a senior API integration engineer. The user will provide a natural language integration goal, and you must output a JSON response that fulfills this goal assuming you have an OpenAPI specification (which may or may not be provided). 
If 'specs' is provided, use the context from it. 

Provide a comprehensive multi-step integration plan, and generate complete working code.

You MUST respond with ONLY valid JSON and no markdown wrapping or additional text.
Format your JSON EXACTLY like this:
{
  "steps": [
    {
      "title": "Step title",
      "description": "Step description",
      "api": "API or endpoint name"
    }
  ],
  "code": "Complete, runnable Python code snippet implementing the full integration",
  "jsCode": "Complete, runnable JavaScript/fetch code snippet implementing the full integration",
  "curlCommands": [
    "curl command for step 1",
    "curl command for step 2"
  ],
  "authNotes": "Any auth/token notes the developer needs to know"
}
CRITICAL: Your entire response must be a single valid JSON object with no text before or after it. All code samples must have newlines escaped as \\n within the JSON string values. Do not use actual newlines inside JSON string values.`;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: `Goal: ${goal}\n\nSpecs provided: ${trimmedSpecs ? JSON.stringify(trimmedSpecs) : 'None'}`
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2,
            max_tokens: 4096,
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

