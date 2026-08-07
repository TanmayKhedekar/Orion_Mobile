import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

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
        const { responseBody, nextEndpoint } = await req.json();

        if (!process.env.GROQ_API_KEY) {
            return NextResponse.json(
                { error: 'Groq API key not configured' },
                { status: 500 }
            );
        }

        const systemPrompt = `You are an AI API Chaining Assistant. Your task is to analyze the response JSON of a previous API call and a target next endpoint's parameter schema, then suggest how values from the previous response should map to the next endpoint's inputs (parameters or body fields).

Return a valid JSON object with the following schema:
{
  "suggestions": [
    {
      "from": "field_name_in_response", // key in response JSON (e.g. "id" or "access_token" or "token")
      "to": "target_param_name",        // parameter or body field name in nextEndpoint
      "confidence": 0.95,               // float between 0 and 1
      "rationale": "Brief reason for mapping"
    }
  ]
}

CRITICAL: Your entire response MUST be a single valid JSON object with no text before or after it. Do not include markdown code block syntax (\`\`\`json).`;

        const userContent = `Previous Response JSON:
${typeof responseBody === 'object' ? JSON.stringify(responseBody, null, 2) : responseBody}

Next Endpoint Parameters Schema:
Method: ${nextEndpoint?.method}
Path: ${nextEndpoint?.path}
Summary: ${nextEndpoint?.summary || ''}
Parameters: ${JSON.stringify(nextEndpoint?.parameters || [], null, 2)}
Request Body Schema: ${JSON.stringify(nextEndpoint?.requestBody || null, null, 2)}`;

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
            max_tokens: 1500,
        });

        const textContent = completion.choices[0]?.message?.content || '';

        let jsonResult: any;
        try {
            jsonResult = JSON.parse(textContent);
        } catch (e) {
            jsonResult = safeParseJSON(textContent);
        }

        if (!jsonResult.suggestions) {
            jsonResult.suggestions = [];
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

