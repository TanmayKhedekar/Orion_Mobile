export interface ApiEndpoint {
    path: string;
    method: string;
    summary?: string;
    description?: string;
    operationId?: string;
    parameters: ApiParameter[];
    requestBody?: any;
    responses: any;
}

export interface ApiParameter {
    name: string;
    in: "query" | "header" | "path" | "cookie";
    description?: string;
    required?: boolean;
    schema?: any;
}

export interface ApiSpec {
    title: string;
    description: string;
    version: string;
    baseUrl: string;
    endpoints: ApiEndpoint[];
}

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
    isCode?: boolean;
    provider?: string;
    model?: string;
    routingDecision?: {
        provider: string;
        mode: string;
        reason: string;
        taskType: string;
        fallbackApplied?: boolean;
        originalTarget?: string;
    };
}
