import { NextResponse } from 'next/server';
import { aiService, TaskType } from '@/services/ai';

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
        const { responseBody, nextEndpoint, provider, model, routingMode } = body;

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

        const completion = await aiService.execute({
            taskType: TaskType.PARAMETER_EXPLANATION,
            routingMode,
            provider,
            model,
            temperature: 0.2,
            maxTokens: 1500,
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

        if (!jsonResult || !jsonResult.suggestions) {
            jsonResult = { suggestions: [] };
        }

        jsonResult.routingDecision = completion.routingDecision;

        return NextResponse.json(jsonResult);
    } catch (error: any) {
        console.error('Route error in /api/suggest-chain:', error);
        return aiService.formatErrorResponse(error);
    }
}
