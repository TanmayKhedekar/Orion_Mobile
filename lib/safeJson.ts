/**
 * lib/safeJson.ts
 * Robust JSON extraction and parsing utility for LLM-generated structured outputs.
 */

/**
 * State-machine based sanitizer that escapes control characters (newlines/tabs)
 * ONLY inside JSON string literals, without corrupting formatting whitespace outside quotes.
 */
function sanitizeJsonStringLiterals(jsonStr: string): string {
    let result = '';
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];

        if (inString) {
            if (isEscaped) {
                result += char;
                isEscaped = false;
            } else if (char === '\\') {
                result += char;
                isEscaped = true;
            } else if (char === '"') {
                result += char;
                inString = false;
            } else if (char === '\n') {
                result += '\\n';
            } else if (char === '\r') {
                result += '\\r';
            } else if (char === '\t') {
                result += '\\t';
            } else {
                result += char;
            }
        } else {
            if (char === '"') {
                inString = true;
            }
            result += char;
        }
    }

    // Strip trailing commas before closing braces/brackets (common LLM artifact)
    result = result.replace(/,\s*([}\]])/g, '$1');

    return result;
}

/**
 * Safely extracts and parses JSON from an LLM response string.
 * Supports:
 * 1. Plain JSON ({ ... } or [ ... ])
 * 2. Markdown fenced JSON (```json ... ``` or ``` ... ```)
 * 3. JSON with surrounding conversational text or whitespace
 * 4. Safe recovery without crashing or corrupting valid JSON structures
 */
export function safeExtractJSON<T extends Record<string, any> = Record<string, any>>(raw: string | any, fallback: T = {} as T): T {
    if (!raw) return fallback;
    if (typeof raw === 'object') return raw as T;
    if (typeof raw !== 'string') return fallback;

    let text = raw.trim();

    // 1. Direct parse attempt
    try {
        return JSON.parse(text) as T;
    } catch {
        // Proceed to fence extraction
    }

    // 2. Markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
        const fencedText = fenceMatch[1].trim();
        try {
            return JSON.parse(fencedText) as T;
        } catch {
            text = fencedText;
        }
    }

    // 3. Find boundaries of outer JSON object { ... } or array [ ... ]
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');

    let start = -1;
    let end = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = lastBrace;
    } else if (firstBracket !== -1) {
        start = firstBracket;
        end = lastBracket;
    }

    if (start !== -1 && end > start) {
        const extracted = text.slice(start, end + 1).trim();
        try {
            return JSON.parse(extracted) as T;
        } catch {
            // 4. Sanitize unescaped newlines inside string literals
            try {
                const sanitized = sanitizeJsonStringLiterals(extracted);
                return JSON.parse(sanitized) as T;
            } catch (err: any) {
                console.warn('[safeExtractJSON] Parsing recovery failed:', err?.message);
                if (typeof fallback === 'object' && fallback !== null) {
                    return { ...fallback, rawContent: text } as T;
                }
                return fallback;
            }
        }
    }

    if (typeof fallback === 'object' && fallback !== null) {
        return { ...fallback, rawContent: text } as T;
    }
    return fallback;
}
