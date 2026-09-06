import { NextResponse } from 'next/server';
import { aiService, TaskType } from '@/services/ai';
import { aggressiveTrimSpec } from '@/lib/specTrimmer';
import { safeExtractJSON } from '@/lib/safeJson';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { goal, specs, provider, model, routingMode, useLocal } = body;

        if (useLocal) {
            return NextResponse.json({
                useLocalBridge: true,
                message: 'Local AI requested. Please route request through the on-device LocalAI bridge.'
            });
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

        const systemPrompt = `You are a senior API integration engineer. The user will provide a natural language integration goal, and you must output a structured JSON response that fulfills this goal.
If 'specs' is provided, use the context from it. 

Provide a comprehensive multi-step integration plan with real endpoints, and generate complete working code for Python, JavaScript, and cURL commands.

You MUST respond with ONLY valid JSON and no markdown formatting outside the JSON.
Format your JSON EXACTLY like this:
{
  "steps": [
    {
      "title": "Step 1: Description title",
      "description": "Detailed explanation of what this step does",
      "api": "Target API / Endpoint"
    }
  ],
  "code": "# Complete runnable Python script implementing the integration\\nimport requests\\n...",
  "jsCode": "// Complete runnable JavaScript script\\nasync function main() { ... }\\nmain();",
  "curlCommands": [
    "curl -X GET 'https://api.example.com/...' -H 'Authorization: Bearer ...'",
    "curl -X POST 'https://api.example.com/...' -H 'Content-Type: application/json' -d '{\"key\":\"value\"}'"
  ],
  "authNotes": "Authentication instructions, required API keys, headers, or tokens."
}
CRITICAL: 
- Escape all double quotes inside JSON string values as \\".
- Escape newlines as \\n within string values.
- Do NOT output any conversational text or markdown fences outside the JSON object.`;

        const completion = await aiService.execute({
            taskType: TaskType.AGENT_PLANNING,
            routingMode,
            provider,
            model,
            temperature: 0.2,
            maxTokens: 6000,
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
        });

        const textContent = completion.text || completion.content || '';
        const fallbackPlan: { steps: any[]; code: string; jsCode: string; curlCommands: string[]; authNotes: string; routingDecision?: any } = {
            steps: [{ title: 'Execute API Flow', description: `Integration plan for ${goal}`, api: 'Target API' }],
            code: '# API Integration Code\nimport requests\n',
            jsCode: '// API Integration Code\n',
            curlCommands: ['curl -X GET "https://api.example.com"'],
            authNotes: 'Ensure necessary API keys are passed in request headers.'
        };

        const jsonResult = safeExtractJSON(textContent, fallbackPlan);
        jsonResult.routingDecision = completion.routingDecision;

        return NextResponse.json(jsonResult);
    } catch (error: any) {
        console.error('Route error in /api/intent:', error);
        return aiService.formatErrorResponse(error);
    }
}
