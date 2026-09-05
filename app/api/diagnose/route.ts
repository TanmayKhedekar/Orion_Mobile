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
        const { status, responseBody, requestHeaders, requestUrl, requestMethod, requestBody, spec, provider, model, routingMode } = body;

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

        const completion = await aiService.execute({
            taskType: TaskType.ERROR_ANALYSIS,
            routingMode,
            provider,
            model,
            temperature: 0.2,
            maxTokens: 2000,
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
        });

        const textContent = completion.text || completion.content || '';

        let jsonResult: any;
        try {
            jsonResult = JSON.parse(textContent);
        } catch (e) {
            jsonResult = safeParseJSON(textContent);
        }

        jsonResult.routingDecision = completion.routingDecision;

        return NextResponse.json(jsonResult);
    } catch (error: any) {
        console.error('Route error in /api/diagnose:', error);
        return aiService.formatErrorResponse(error);
    }
}
