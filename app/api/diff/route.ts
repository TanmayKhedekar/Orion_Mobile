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

// Helper to extract a minimal, flat representation of endpoints
function extractEndpoints(specObj: any) {
    const endpoints: Record<string, any> = {};
    if (!specObj.paths) return endpoints;

    for (const [path, methodsObj] of Object.entries(specObj.paths)) {
        for (const [method, operationDetails] of Object.entries(methodsObj as any)) {
            // Some keys under path might be properties like $ref or servers, just keep common HTTP methods
            if (!['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(method.toLowerCase())) continue;

            endpoints[`${method.toUpperCase()} ${path}`] = operationDetails;
        }
    }
    return endpoints;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { specA, specB, provider, model, routingMode } = body;

        let parsedA, parsedB;
        try {
            parsedA = typeof specA === 'string' ? JSON.parse(specA) : specA;
            parsedB = typeof specB === 'string' ? JSON.parse(specB) : specB;
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON spec provided' }, { status: 400 });
        }

        const trimmedA = aggressiveTrimSpec(parsedA);
        const trimmedB = aggressiveTrimSpec(parsedB);

        const endpointsA = extractEndpoints(trimmedA);
        const endpointsB = extractEndpoints(trimmedB);

        const addedEndpoints: { method: string, path: string }[] = [];
        const removedEndpoints: { method: string, path: string }[] = [];
        const modifiedEndpoints: { method: string, path: string, changes: string }[] = [];
        const breakingChanges: string[] = [];

        for (const key of Object.keys(endpointsB)) {
            const [method, path] = key.split(' ', 2);
            if (!endpointsA[key]) {
                addedEndpoints.push({ method, path });
            } else {
                const strA = JSON.stringify(endpointsA[key]);
                const strB = JSON.stringify(endpointsB[key]);
                if (strA !== strB) {
                    modifiedEndpoints.push({ method, path, changes: "Parameters or responses changed" });

                    const paramsA = endpointsA[key].parameters || [];
                    const paramsB = endpointsB[key].parameters || [];

                    const reqB = paramsB.filter((p: any) => p.required).map((p: any) => p.name);
                    const reqA = paramsA.filter((p: any) => p.required).map((p: any) => p.name);

                    for (const reqParam of reqB) {
                        if (!reqA.includes(reqParam)) {
                            breakingChanges.push(`Endpoint ${key} added a new required parameter '${reqParam}'.`);
                        }
                    }
                }
            }
        }

        for (const key of Object.keys(endpointsA)) {
            if (!endpointsB[key]) {
                const [method, path] = key.split(' ', 2);
                removedEndpoints.push({ method, path });
                breakingChanges.push(`Endpoint ${key} was completely removed.`);
            }
        }

        const diffSummary = {
            addedEndpoints,
            removedEndpoints,
            modifiedEndpoints,
            breakingChanges
        };

        const systemPrompt = `You are a senior API migration specialist. You are given a programmatic diff between two versions of an API. Generate a complete migration guide for developers.

Format your JSON EXACTLY like this:
{
  "summary": "2-3 sentence plain English summary of what changed overall globally",
  "migrationSteps": [
    "Step 1 to migrate...",
    "Step 2..."
  ],
  "codePatches": [
    {
      "before": "Old code snippet showing how it used to be called",
      "after": "New code snippet showing how to call it now",
      "description": "Why this code changed"
    }
  ] // If no code changes are strictly needed, leave array empty
}

CRITICAL: Your entire response must be a single valid JSON object with no text before or after it. All code samples must have newlines escaped as \\n within the JSON string values. Do not use actual newlines inside JSON string values.`;

        const userContent = `Here is the programmatic diff:\n${JSON.stringify(diffSummary, null, 2)}`;

        const completion = await aiService.execute({
            taskType: TaskType.API_SUMMARY,
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
                    content: userContent
                }
            ],
        });

        const textContent = completion.text || completion.content || '';

        let llmResult: any;
        try {
            llmResult = JSON.parse(textContent);
        } catch (e) {
            llmResult = safeParseJSON(textContent);
        }

        const finalResponse = {
            ...diffSummary,
            ...llmResult,
            routingDecision: completion.routingDecision
        };

        return NextResponse.json(finalResponse);
    } catch (error: any) {
        console.error('Route error in /api/diff:', error);
        return aiService.formatErrorResponse(error);
    }
}
