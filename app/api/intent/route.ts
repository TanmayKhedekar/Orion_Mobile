import { NextResponse } from 'next/server';
import { aiService, TaskType } from '@/services/ai';
import { aggressiveTrimSpec } from '@/lib/specTrimmer';
import { safeExtractJSON } from '@/lib/safeJson';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { goal, specs, provider, model, routingMode } = body;

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

        const completion = await aiService.execute({
            taskType: TaskType.AGENT_PLANNING,
            routingMode,
            provider,
            model,
            temperature: 0.2,
            maxTokens: 4096,
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
