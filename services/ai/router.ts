import {
    AIProvider,
    AIProviderType,
    AIRequest,
    RoutingDecision,
    RoutingMode,
    TaskType
} from './types';

const COMPLEX_TASKS: Set<TaskType> = new Set([
    TaskType.CODE_GENERATION,
    TaskType.LARGE_SPEC_ANALYSIS,
    TaskType.AGENT_PLANNING,
    TaskType.ERROR_ANALYSIS
]);

const LOCAL_CANDIDATE_TASKS: Set<TaskType> = new Set([
    TaskType.VOICE_COMMAND,
    TaskType.API_SEARCH,
    TaskType.PARAMETER_EXPLANATION,
    TaskType.API_EXPLANATION,
    TaskType.API_SUMMARY
]);

// Threshold in characters beyond which a task is directed to Cloud due to context volume
const LOCAL_CONTEXT_CHAR_LIMIT = 2500;

export class AIRouter {
    /**
     * Estimates the character length of the request payload.
     */
    private estimatePayloadSize(request: AIRequest): number {
        let size = 0;
        if (request.systemPrompt) size += request.systemPrompt.length;
        if (typeof request.context === 'string') {
            size += request.context.length;
        } else if (request.context) {
            size += JSON.stringify(request.context).length;
        }
        for (const m of request.messages) {
            size += (m.content || '').length;
        }
        return size;
    }

    /**
     * Resolves the primary Cloud provider (Organizer AI if configured, otherwise Groq).
     */
    private resolveCloudProvider(providers: Map<AIProviderType, AIProvider>): AIProviderType {
        const organizer = providers.get('organizer');
        if (organizer && organizer.isConfigured()) {
            return 'organizer';
        }
        return 'groq';
    }

    /**
     * Deterministically routes an incoming AI request to the appropriate provider.
     */
    public route(
        request: AIRequest,
        providers: Map<AIProviderType, AIProvider>
    ): RoutingDecision {
        const mode: RoutingMode = request.routingMode || 'auto';
        const taskType: TaskType = request.taskType || TaskType.API_EXPLANATION;
        const requestedModel = request.model || 'default';
        const payloadSize = this.estimatePayloadSize(request);

        // 1. Explicit provider override in request
        if (request.provider) {
            return {
                provider: request.provider,
                mode,
                taskType,
                model: requestedModel,
                reason: `Explicit provider '${request.provider}' specified in request.`,
                fallbackAllowed: true
            };
        }

        // 2. Mode Override: GROQ
        if (mode === 'groq') {
            return {
                provider: 'groq',
                mode: 'groq',
                taskType,
                model: requestedModel,
                reason: 'Explicit GROQ mode selected by user configuration.',
                fallbackAllowed: false
            };
        }

        // 3. Mode Override: CLOUD
        if (mode === 'cloud') {
            const cloudProvider = this.resolveCloudProvider(providers);
            const isOrganizer = cloudProvider === 'organizer';
            return {
                provider: cloudProvider,
                mode: 'cloud',
                taskType,
                model: requestedModel,
                reason: isOrganizer
                    ? 'CLOUD mode selected: Routed to Organizer Cloud AI API.'
                    : 'CLOUD mode selected: Organizer unconfigured; routed to Groq Cloud.',
                fallbackAllowed: true
            };
        }

        // 4. Mode Override: LOCAL
        if (mode === 'local') {
            const localProvider = providers.get('local');
            const isLocalReady = localProvider ? localProvider.isConfigured() : false;

            if (isLocalReady) {
                return {
                    provider: 'local',
                    mode: 'local',
                    taskType,
                    model: requestedModel,
                    reason: 'LOCAL mode selected: Routed to Qualcomm Snapdragon On-Device NPU.',
                    fallbackAllowed: false
                };
            }

            // Local is in stub mode -> fallback to Cloud/Groq with explicit note
            const fallbackProvider = this.resolveCloudProvider(providers);
            return {
                provider: fallbackProvider,
                originalTarget: 'local',
                fallbackApplied: true,
                mode: 'local',
                taskType,
                model: requestedModel,
                reason: `LOCAL mode requested, but On-Device NPU is in stub mode; safely fell back to ${fallbackProvider.toUpperCase()} Cloud.`,
                fallbackAllowed: true
            };
        }

        // 5. AUTO Mode (Default Deterministic Task Classification)
        // Rule A: Complex reasoning / high token generation -> Cloud
        if (COMPLEX_TASKS.has(taskType)) {
            const cloudProvider = this.resolveCloudProvider(providers);
            return {
                provider: cloudProvider,
                mode: 'auto',
                taskType,
                model: requestedModel,
                reason: `AUTO mode: Complex task '${taskType}' requiring multi-step reasoning / code generation routed to Cloud (${cloudProvider}).`,
                fallbackAllowed: true
            };
        }

        // Rule B: Large context payload -> Cloud
        if (payloadSize > LOCAL_CONTEXT_CHAR_LIMIT) {
            const cloudProvider = this.resolveCloudProvider(providers);
            return {
                provider: cloudProvider,
                mode: 'auto',
                taskType,
                model: requestedModel,
                reason: `AUTO mode: Payload size (${payloadSize} chars) exceeds local on-device limit (${LOCAL_CONTEXT_CHAR_LIMIT} chars); routed to Cloud (${cloudProvider}).`,
                fallbackAllowed: true
            };
        }

        // Rule C: Lightweight on-device candidate
        const localProvider = providers.get('local');
        const isLocalReady = localProvider ? localProvider.isConfigured() : false;

        if (isLocalReady) {
            return {
                provider: 'local',
                mode: 'auto',
                taskType,
                model: requestedModel,
                reason: `AUTO mode: Lightweight task '${taskType}' routed to On-Device Snapdragon NPU for ultra-low latency.`,
                fallbackAllowed: true
            };
        }

        // Local is in stub mode -> gracefully route to Cloud fallback
        const autoFallbackProvider = this.resolveCloudProvider(providers);
        return {
            provider: autoFallbackProvider,
            originalTarget: 'local',
            fallbackApplied: true,
            mode: 'auto',
            taskType,
            model: requestedModel,
            reason: `AUTO mode: Lightweight task '${taskType}' is a candidate for On-Device NPU (stub mode active; routed to ${autoFallbackProvider.toUpperCase()} Cloud).`,
            fallbackAllowed: true
        };
    }

    /**
     * Sanitized telemetry logging for routing decisions without leaking sensitive payloads.
     */
    public logDecision(decision: RoutingDecision): void {
        console.log(
            `[AI Router] Mode: ${decision.mode.toUpperCase()} | Task: ${decision.taskType} | Provider: ${decision.provider.toUpperCase()}` +
            (decision.fallbackApplied ? ` (Fallback from ${decision.originalTarget?.toUpperCase()})` : '') +
            ` | Reason: ${decision.reason}`
        );
    }
}

export const aiRouter = new AIRouter();
