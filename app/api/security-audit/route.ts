import { NextResponse } from 'next/server';
import { aiService, TaskType } from '@/services/ai';
import { aggressiveTrimSpec } from '@/lib/specTrimmer';
import { safeExtractJSON } from '@/lib/safeJson';

// Find all properties recursively in a schema
function extractPropertyNames(schema: any, names = new Set<string>()): Set<string> {
    if (!schema || typeof schema !== 'object') return names;
    if (schema.properties) {
        for (const key of Object.keys(schema.properties)) {
            names.add(key.toLowerCase());
            extractPropertyNames(schema.properties[key], names);
        }
    }
    if (schema.items) {
        extractPropertyNames(schema.items, names);
    }
    return names;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { spec, provider, model, routingMode } = body;

        let rawParsed: any;
        try {
            rawParsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON spec provided' }, { status: 400 });
        }

        const parsed = aggressiveTrimSpec(rawParsed);

        const noAuthEndpoints: { method: string, path: string }[] = [];
        const sensitiveDataExposed: { method: string, path: string, fields: string[] }[] = [];
        const missingHttps: string[] = [];
        const adminEndpointsUnprotected: { method: string, path: string }[] = [];

        // Check HTTPS
        if (parsed.servers && Array.isArray(parsed.servers)) {
            for (const server of parsed.servers) {
                if (server.url && server.url.startsWith('http://')) {
                    missingHttps.push(server.url);
                }
            }
        }

        const GlobalSecurity = parsed.security || [];

        const sensitiveKeywords = ['password', 'token', 'secret', 'ssn', 'creditcard', 'apikey', 'private_key'];

        if (parsed.paths) {
            for (const [path, methodsObj] of Object.entries(parsed.paths)) {
                for (const [method, operation] of Object.entries(methodsObj as any)) {
                    if (!['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(method.toLowerCase())) continue;

                    const op: any = operation;
                    const pathLower = path.toLowerCase();
                    const hasAdminKeyword = ['/admin', '/internal', '/debug', '/root'].some(kw => pathLower.includes(kw));

                    // Check auth
                    // Default to global if local is missing
                    const endpointSecurity = op.security !== undefined ? op.security : GlobalSecurity;
                    const isUnprotected = !endpointSecurity || endpointSecurity.length === 0 || endpointSecurity.some((sec: any) => Object.keys(sec).length === 0);

                    if (isUnprotected) {
                        noAuthEndpoints.push({ method: method.toUpperCase(), path });
                        if (hasAdminKeyword) {
                            adminEndpointsUnprotected.push({ method: method.toUpperCase(), path });
                        }
                    }

                    // Check response schema
                    if (op.responses) {
                        for (const [status, resObj] of Object.entries(op.responses)) {
                            const res: any = resObj;
                            if (res.content && res.content['application/json'] && res.content['application/json'].schema) {
                                const props = extractPropertyNames(res.content['application/json'].schema);
                                const exposed = Array.from(props).filter(p => sensitiveKeywords.some(kw => p.includes(kw)));
                                if (exposed.length > 0) {
                                    sensitiveDataExposed.push({
                                        method: method.toUpperCase(),
                                        path,
                                        fields: exposed
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        const programmaticFindings = {
            noAuthEndpoints,
            sensitiveDataExposed,
            missingHttps,
            adminEndpointsUnprotected
        };

        const systemPrompt = `You are an expert cybersecurity auditor. You are given programmatic findings of an OpenAPI specification scan.

Analyze the findings and provide a comprehensive security report. Format your JSON EXACTLY like this:
{
  "riskScore": 85, // Number 0-100 indicating risk (0=safe, 100=extreme danger)
  "riskLevel": "Critical", // "Critical", "High", "Medium", or "Low"
  "findings": [
    {
      "title": "Finding title",
      "description": "Detailed description of the issue based on programmatic data",
      "severity": "critical", // "critical", "high", "medium", or "low"
      "recommendation": "How the developers must fix this"
    }
  ],
  "summary": "2-3 sentence executive summary of the security posture"
}

CRITICAL: Your entire response must be a single valid JSON object with no text before or after it. All code samples must have newlines escaped as \\n within the JSON string values. Do not use actual newlines inside JSON string values.`;

        const completion = await aiService.execute({
            taskType: TaskType.LARGE_SPEC_ANALYSIS,
            routingMode,
            provider,
            model,
            temperature: 0.1,
            maxTokens: 4096,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: `Here are the programmatic findings:\n${JSON.stringify(programmaticFindings, null, 2)}`
                }
            ],
        });

        const textContent = completion.text || completion.content || '';
        const fallbackAudit = {
            riskScore: 60,
            summary: 'Security audit complete. Identified baseline security findings in API specification.',
            recommendations: ['Enable API Key or OAuth2 authentication across all public endpoints.']
        };

        const llmResult = safeExtractJSON(textContent, fallbackAudit);

        const finalResponse = {
            ...programmaticFindings,
            ...llmResult,
            routingDecision: completion.routingDecision
        };

        return NextResponse.json(finalResponse);
    } catch (error: any) {
        console.error('Route error in /api/security-audit:', error);
        return aiService.formatErrorResponse(error);
    }
}
