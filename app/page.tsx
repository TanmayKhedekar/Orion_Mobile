"use client";

import React, { useState, useEffect } from "react";
import { parseOpenApiUrl } from "@/services/openapi";
import { fetchAndParseSpec, fetchRawSpecJSON } from "@/app/actions/openapi";
import { ApiSpec, ApiEndpoint, ChatMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Link, Send, Code, Play, AlertCircle, ChevronRight, Check, Search, Shield, Copy, Sun, Moon, X, Download, Link2, Sparkles, Plus, Trash2, Save, PlusCircle, MinusCircle, RefreshCw, Terminal, AlertTriangle } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useAuth } from "@/context/AuthContext";
import { LogOut } from "lucide-react";
import { extractTargetVariables, substituteVariables, ExtractedVar } from "@/lib/chainVariables";
import { VariableInput } from "@/components/VariableInput";
import { VariableStorePanel } from "@/components/VariableStorePanel";
import { ApiMetaphorAnimation } from "@/components/ApiMetaphorAnimation";

const MessageContent = ({ content, theme }: { content: string, theme: "dark" | "light" }) => {
    // Split text by markdown code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
        <div className="space-y-3 leading-relaxed whitespace-pre-wrap font-sans">
            {parts.map((part, index) => {
                if (part.startsWith('```')) {
                    const match = part.match(/```([\w-]*)\n([\s\S]*?)```/);
                    if (match) {
                        const language = match[1] || 'text';
                        const code = match[2];
                        return (
                            <div key={index} className={`relative rounded-xl overflow-hidden border my-3 w-full shadow-lg ${theme === 'dark' ? 'border-white/10 bg-[#0d0d12]' : 'border-black/10 bg-gray-50'
                                }`}>
                                <div className={`flex items-center justify-between px-3 py-1.5 border-b ${theme === 'dark' ? 'border-white/5 bg-black/60' : 'border-black/5 bg-gray-200'
                                    }`}>
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{language}</span>
                                    <button
                                        className="text-[10px] flex items-center space-x-1 text-muted-foreground hover:text-white transition-colors px-1 py-0.5 rounded"
                                        onClick={(e) => {
                                            navigator.clipboard.writeText(code);
                                            const btn = e.currentTarget;
                                            const originalText = btn.innerHTML;
                                            btn.innerHTML = '<svg class="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="text-green-400">Copied</span>';
                                            setTimeout(() => btn.innerHTML = originalText, 2000);
                                        }}
                                    >
                                        <Copy className="w-3 h-3" />
                                        <span>Copy</span>
                                    </button>
                                </div>
                                <div className={`p-4 overflow-x-auto text-[12px] font-mono leading-normal ${theme === 'dark' ? 'text-emerald-300 bg-black/40' : 'text-blue-700 bg-white'
                                    }`}>
                                    <code>{code}</code>
                                </div>
                            </div>
                        );
                    }
                }

                // For non-code blocks, parse single backticks for inline code
                const inlineParts = part.split(/`([^`]+)`/g);
                return (
                    <span key={index} className="text-[13px] block">
                        {inlineParts.map((chunk, i) =>
                            i % 2 === 1 ? (
                                <code key={i} className={`px-1 py-0.5 rounded font-mono text-[11px] font-bold mx-0.5 border ${theme === 'dark' ? 'bg-black/30 border-white/10 text-blue-300' : 'bg-gray-100 border-black/10 text-blue-700'
                                    }`}>{chunk}</code>
                            ) : chunk
                        )}
                    </span>
                );
            })}
        </div>
    );
};

interface FriendlyErrorData {
    error?: string;
    userMessage?: string;
    tip?: string;
}

function FriendlyErrorBox({ error }: { error: string | FriendlyErrorData | null }) {
    if (!error) return null;

    const errorObj: FriendlyErrorData = typeof error === 'string' ? { userMessage: error } : error;
    const isSpecTooLarge = errorObj.error === 'spec_too_large';

    if (isSpecTooLarge) {
        return (
            <div className="p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-1 text-left animate-in fade-in">
                <div className="flex items-start space-x-3">
                    <span className="text-lg flex-shrink-0 leading-none">⚠️</span>
                    <div className="space-y-1">
                        <div className="text-white font-bold text-sm leading-snug">
                            Spec too large for full processing
                        </div>
                        <div className="text-white text-xs leading-relaxed">
                            We&apos;ve analyzed the first 15 endpoints of this API. For complete coverage, try a more focused API spec.
                        </div>
                        {errorObj.tip && (
                            <div className="text-[11px] text-amber-200/70 pt-1 border-t border-amber-500/20 mt-1">
                                💡 {errorObj.tip}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-1 text-left animate-in fade-in">
            <div className="flex items-start space-x-3">
                <span className="text-lg flex-shrink-0 leading-none">⚠️</span>
                <div className="space-y-1">
                    <div className="text-white text-xs font-medium leading-relaxed">
                        {errorObj.userMessage || errorObj.error || "An unexpected error occurred."}
                    </div>
                    {errorObj.tip && (
                        <div className="text-[11px] text-amber-200/70 pt-1 border-t border-amber-500/20 mt-1">
                            💡 {errorObj.tip}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Home() {
    const { user, logout } = useAuth();
    const [url, setUrl] = useState("https://petstore.swagger.io/v2/swagger.json");
    const [spec, setSpec] = useState<ApiSpec | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | FriendlyErrorData | null>(null);

    const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);

    const [testParams, setTestParams] = useState<Record<string, string>>({});
    const [testResponse, setTestResponse] = useState<any>(null);
    const [testLoading, setTestLoading] = useState(false);

    // Error Detective Mode
    const [diagnosisLoading, setDiagnosisLoading] = useState(false);
    const [diagnosisResult, setDiagnosisResult] = useState<any>(null);

    // Intent Mode
    const [mode, setMode] = useState<"explorer" | "intent" | "diff" | "audit">("explorer");
    const [intentGoal, setIntentGoal] = useState("");
    const [intentLoading, setIntentLoading] = useState(false);
    const [intentResult, setIntentResult] = useState<any>(null);
    const [intentError, setIntentError] = useState<string | FriendlyErrorData | null>(null);
    const [activeCodeTab, setActiveCodeTab] = useState<"python" | "js" | "curl">("python");

    // Diff Mode
    const [diffUrlA, setDiffUrlA] = useState("");
    const [diffUrlB, setDiffUrlB] = useState("");
    const [diffLoading, setDiffLoading] = useState(false);
    const [diffResult, setDiffResult] = useState<any>(null);
    const [diffError, setDiffError] = useState<string | FriendlyErrorData | null>(null);

    // Audit Mode
    const [auditUrl, setAuditUrl] = useState("");
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditResult, setAuditResult] = useState<any>(null);
    const [auditError, setAuditError] = useState<string | FriendlyErrorData | null>(null);

    // SDK Generator Mode
    const [sdkModalOpen, setSdkModalOpen] = useState(false);
    const [sdkLang, setSdkLang] = useState<"python" | "typescript">("python");
    const [sdkLoading, setSdkLoading] = useState(false);
    const [sdkResult, setSdkResult] = useState<any>(null);
    const [sdkError, setSdkError] = useState<string | FriendlyErrorData | null>(null);

    // Chain Variables State
    const [variableStore, setVariableStore] = useState<Record<string, string>>({});
    const [extractedVars, setExtractedVars] = useState<ExtractedVar[]>([]);
    const [chainSuggestions, setChainSuggestions] = useState<Array<{ from: string; to: string; confidence: number; rationale?: string }>>([]);
    const [suggestLoading, setSuggestLoading] = useState(false);
    const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([
        { key: "", value: "" }
    ]);
    const [isVarStoreOpen, setIsVarStoreOpen] = useState(true);

    const variableStoreRef = React.useRef(variableStore);
    useEffect(() => {
        variableStoreRef.current = variableStore;
    }, [variableStore]);

    const [theme, setTheme] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const saved = localStorage.getItem("orion_theme") as "dark" | "light" | null;
        if (saved) {
            setTheme(saved);
        } else if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
            setTheme("light");
        }
    }, []);

    useEffect(() => {
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        localStorage.setItem("orion_theme", theme);
    }, [theme]);

    const handleParse = async (overrideUrl?: string) => {
        const targetUrl = overrideUrl || url;
        if (!targetUrl) return;

        setLoading(true);
        setError(null);
        try {
            const parsedSpec = await fetchAndParseSpec(targetUrl);
            setSpec(parsedSpec);
            if (parsedSpec.endpoints.length > 0) {
                setSelectedEndpoint(parsedSpec.endpoints[0]);
            }
        } catch (err: any) {
            setError(err.message || "Failed to parse API");
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateIntent = async () => {
        if (!intentGoal.trim()) return;
        setIntentLoading(true);
        setIntentError(null);
        try {
            const res = await fetch("/api/intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ goal: intentGoal, specs: spec ? [spec] : [] })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setIntentError(data.userMessage ? data : { userMessage: data.error || "Failed to generate integration." });
                return;
            }
            setIntentResult(data);
        } catch (err: any) {
            setIntentError({ userMessage: err.message || "Failed to generate integration." });
        } finally {
            setIntentLoading(false);
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        // Add user message
        const newMessages = [...messages, { role: "user" as const, content: text }];
        setMessages(newMessages);
        setChatInput("");
        setChatLoading(true);

        try {
            const systemContext = selectedEndpoint
                ? `Context: The user is currently looking at the endpoint ${selectedEndpoint.method} ${selectedEndpoint.path}. 
           Base URL: ${spec?.baseUrl}. Parameters: ${JSON.stringify(selectedEndpoint.parameters)}.
           They might ask for code generation, explanation, or help debugging.`
                : "";

            const reqMessages = [
                ...newMessages.map(m => ({ role: m.role, content: m.content })),
                { role: "system", content: systemContext }
            ];

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: reqMessages })
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                const errorMsg = data.error === 'spec_too_large'
                    ? "⚠️ Spec too large for full processing\nWe've analyzed the first 15 endpoints of this API. For complete coverage, try a more focused API spec."
                    : `⚠️ ${data.userMessage || data.error || "An error occurred during chat."}${data.tip ? `\n\n💡 ${data.tip}` : ''}`;
                setMessages([...newMessages, { role: "assistant", content: errorMsg }]);
                return;
            }

            setMessages([...newMessages, { role: "assistant", content: data.content }]);
        } catch (err: any) {
            setMessages([...newMessages, { role: "assistant", content: `Error: ${err.message}` }]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleEditorMount = (editor: any, monaco: any) => {
        monaco.languages.registerCompletionItemProvider('json', {
            triggerCharacters: ['{', '"'],
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };
                const suggestions = Object.keys(variableStoreRef.current).map(key => ({
                    label: `{{${key}}}`,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: `{{${key}}}`,
                    detail: `Value: ${variableStoreRef.current[key]}`,
                    documentation: `Chain variable: ${key} = ${variableStoreRef.current[key]}`,
                    range: range
                }));
                return { suggestions };
            }
        });
    };

    const handleTestApi = async () => {
        if (!selectedEndpoint || !spec) return;

        setTestLoading(true);
        try {
            let finalUrl = selectedEndpoint.path;
            const queryParams = new URLSearchParams();
            const requestHeaders: Record<string, string> = {
                "Accept": "application/json"
            };

            // Substitute variables in parameters
            selectedEndpoint.parameters.forEach(p => {
                let val = testParams[p.name];
                if (!val) return;

                val = substituteVariables(val, variableStore);

                if (p.in === "path") {
                    finalUrl = finalUrl.replace(`{${p.name}}`, val);
                } else if (p.in === "query") {
                    queryParams.append(p.name, val);
                } else if (p.in === "header") {
                    requestHeaders[p.name] = val;
                }
            });

            // Process custom headers with variable substitution
            customHeaders.forEach(h => {
                if (h.key.trim() && h.value.trim()) {
                    requestHeaders[h.key.trim()] = substituteVariables(h.value.trim(), variableStore);
                }
            });

            const qString = queryParams.toString();
            const fullUrl = `${spec.baseUrl}${finalUrl}${qString ? `?${qString}` : ''}`;

            let fetchOpts: RequestInit = {
                method: selectedEndpoint.method,
                headers: requestHeaders
            };

            let bodyData = testParams.body || '';
            if (selectedEndpoint.requestBody && bodyData) {
                bodyData = substituteVariables(bodyData, variableStore);
                fetchOpts.body = bodyData;
                // @ts-ignore
                fetchOpts.headers["Content-Type"] = "application/json";
            }

            const res = await fetch(fullUrl, fetchOpts);
            const data = await res.text();

            let parsedData = data;
            try {
                parsedData = JSON.parse(data);
            } catch (e) { }

            setTestResponse({
                status: res.status,
                statusText: res.statusText,
                data: parsedData,
            });

            // Auto-extract variables on successful response (status 200-299)
            if (res.status >= 200 && res.status < 300) {
                const extracted = extractTargetVariables(parsedData);
                setExtractedVars(extracted);
            } else {
                setExtractedVars([]);
                // Automatically ask AI for help
                setMessages(prev => [...prev, {
                    role: "system",
                    content: `API Error: ${res.status} ${res.statusText}. Response: ${data}. Provide friendly explanation and suggest likely fixes.`
                }]);

                const autoExplainText = `The API call failed with status ${res.status}. Can you explain why and suggest fixes?`;
                handleSendMessage(autoExplainText);
            }

        } catch (err: any) {
            setTestResponse({ error: err.message });
            setExtractedVars([]);
        } finally {
            setTestLoading(false);
        }
    };

    const handleSuggestChain = async () => {
        if (!testResponse?.data || !selectedEndpoint) return;
        setSuggestLoading(true);
        try {
            const res = await fetch("/api/suggest-chain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    responseBody: testResponse.data,
                    nextEndpoint: selectedEndpoint
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setChainSuggestions(data.suggestions || []);
        } catch (err: any) {
            console.error("Suggest Chain error:", err);
            setChainSuggestions([]);
        } finally {
            setSuggestLoading(false);
        }
    };

    const applySuggestion = (s: { from: string; to: string }) => {
        const paramMatch = selectedEndpoint?.parameters.find(p => p.name.toLowerCase() === s.to.toLowerCase());
        if (paramMatch) {
            setTestParams(prev => ({ ...prev, [paramMatch.name]: `{{${s.from}}}` }));
        } else if (s.to.toLowerCase().includes("auth") || s.to.toLowerCase().includes("token") || s.to.toLowerCase().includes("header")) {
            setCustomHeaders(prev => {
                const exists = prev.some(h => h.key.toLowerCase() === s.to.toLowerCase());
                if (exists) {
                    return prev.map(h => h.key.toLowerCase() === s.to.toLowerCase() ? { ...h, value: `{{${s.from}}}` } : h);
                }
                return [...prev, { key: s.to, value: `{{${s.from}}}` }];
            });
        } else {
            setTestParams(prev => ({ ...prev, [s.to]: `{{${s.from}}}` }));
        }
    };

    const handleGenerateDiff = async () => {
        if (!diffUrlA || !diffUrlB) return;
        setDiffLoading(true);
        setDiffError(null);
        try {
            const specAStr = await fetchRawSpecJSON(diffUrlA);
            const specBStr = await fetchRawSpecJSON(diffUrlB);

            const res = await fetch("/api/diff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ specA: specAStr, specB: specBStr })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setDiffError(data.userMessage ? data : { userMessage: data.error || "Failed to generate API Diff." });
                return;
            }
            setDiffResult(data);
        } catch (err: any) {
            setDiffError({ userMessage: err.message || "Failed to generate API Diff." });
        } finally {
            setDiffLoading(false);
        }
    };

    const handleRunAudit = async () => {
        if (!auditUrl) return;
        setAuditLoading(true);
        setAuditError(null);
        try {
            const specStr = await fetchRawSpecJSON(auditUrl);

            const res = await fetch("/api/security-audit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spec: specStr })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setAuditError(data.userMessage ? data : { userMessage: data.error || "Failed to run Security Audit." });
                return;
            }
            setAuditResult(data);
        } catch (err: any) {
            setAuditError({ userMessage: err.message || "Failed to run Security Audit." });
        } finally {
            setAuditLoading(false);
        }
    };

    const handleDiagnose = async () => {
        if (!testResponse || testResponse.status < 400 || !selectedEndpoint) return;
        setDiagnosisLoading(true);
        try {
            let finalUrl = selectedEndpoint.path;
            const queryParams = new URLSearchParams();
            selectedEndpoint.parameters.forEach(p => {
                const val = testParams[p.name];
                if (!val) return;
                if (p.in === "path") {
                    finalUrl = finalUrl.replace(`{${p.name}}`, val);
                } else if (p.in === "query") {
                    queryParams.append(p.name, val);
                }
            });
            const qString = queryParams.toString();
            const fullUrl = `${spec?.baseUrl}${finalUrl}${qString ? `?${qString}` : ''}`;

            const res = await fetch("/api/diagnose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: testResponse.status,
                    responseBody: typeof testResponse.data === 'object' ? JSON.stringify(testResponse.data) : testResponse.data,
                    requestHeaders: { "Accept": "application/json", ...(selectedEndpoint.requestBody && testParams.body ? { "Content-Type": "application/json" } : {}) },
                    requestUrl: fullUrl,
                    requestMethod: selectedEndpoint.method,
                    requestBody: selectedEndpoint.requestBody ? testParams.body : undefined
                })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setDiagnosisResult({
                    diagnosis: "AI Diagnosis error",
                    rootCause: data.userMessage || data.error || "Failed to diagnose issue",
                    fix: data.tip || "Try a smaller spec or specific endpoint.",
                    severity: "warning"
                });
                return;
            }
            setDiagnosisResult(data);
        } catch (err: any) {
            console.error("Diagnosis error:", err);
        } finally {
            setDiagnosisLoading(false);
        }
    };

    const handleGenerateSDK = async () => {
        if (!url) return;
        setSdkLoading(true);
        setSdkError(null);
        try {
            const specStr = await fetchRawSpecJSON(url);

            const res = await fetch("/api/generate-sdk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spec: specStr, language: sdkLang })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setSdkError(data.userMessage ? data : { userMessage: data.error || "Failed to generate SDK." });
                return;
            }
            setSdkResult(data);
        } catch (err: any) {
            setSdkError({ userMessage: err.message || "Failed to generate SDK." });
        } finally {
            setSdkLoading(false);
        }
    };

    const downloadSdkFile = () => {
        if (!sdkResult?.code) return;
        const blob = new Blob([sdkResult.code], { type: 'text/plain' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        const ext = sdkLang === 'python' ? 'py' : 'ts';
        a.download = `${sdkResult.className?.toLowerCase() || 'client'}_sdk.${ext}`;
        a.click();
        URL.revokeObjectURL(href);
    };

    const getMethodColor = (method: string) => {
        switch (method.toUpperCase()) {
            case 'GET': return 'bg-blue-500/20 text-blue-500 border-blue-500/50';
            case 'POST': return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50';
            case 'PUT': return 'bg-amber-500/20 text-amber-500 border-amber-500/50';
            case 'DELETE': return 'bg-red-500/20 text-red-500 border-red-500/50';
            default: return 'bg-slate-500/20 text-slate-500 border-slate-500/50';
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background relative">

            {/* SDK Generation Modal */}
            {sdkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl relative">
                        <div className="p-6 border-b border-border flex items-center justify-between bg-black/20">
                            <div>
                                <h3 className="text-2xl font-bold flex items-center"><Code className="w-6 h-6 mr-3 text-primary" /> Generate SDK</h3>
                                <p className="text-muted-foreground text-sm mt-1">Instantly build a production-ready client SDK for this API.</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setSdkModalOpen(false)}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto">
                            {!sdkResult ? (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Target Language</label>
                                        <div className="flex space-x-3">
                                            <button
                                                onClick={() => setSdkLang("python")}
                                                className={`px-6 py-3 rounded-xl border flex items-center font-bold transition-all ${sdkLang === 'python' ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border text-muted-foreground hover:bg-white/5'}`}
                                            >
                                                Python
                                            </button>
                                            <button
                                                onClick={() => setSdkLang("typescript")}
                                                className={`px-6 py-3 rounded-xl border flex items-center font-bold transition-all ${sdkLang === 'typescript' ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border text-muted-foreground hover:bg-white/5'}`}
                                            >
                                                TypeScript
                                            </button>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={handleGenerateSDK}
                                        disabled={sdkLoading}
                                        size="lg"
                                        className="w-full h-14 text-lg font-bold"
                                    >
                                        {sdkLoading ? "Building your SDK..." : "Generate SDK"}
                                    </Button>
                                    <FriendlyErrorBox error={sdkError} />
                                </div>
                            ) : (
                                <div className="space-y-8 animate-in fade-in">
                                    {/* Code Block */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">SDK Source Code</h4>
                                            <div className="flex space-x-2">
                                                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(sdkResult.code)}>
                                                    <Copy className="w-4 h-4 mr-2" /> Copy
                                                </Button>
                                                <Button size="sm" onClick={downloadSdkFile}>
                                                    <Download className="w-4 h-4 mr-2" /> Download .{sdkLang === 'python' ? 'py' : 'ts'}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="h-96 border border-border rounded-xl overflow-hidden">
                                            <Editor
                                                height="100%"
                                                language={sdkLang}
                                                theme={theme === "dark" ? "vs-dark" : "light"}
                                                value={sdkResult.code}
                                                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                                            />
                                        </div>
                                    </div>

                                    {/* Usage & Dependencies */}
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-3 border border-border p-4 rounded-xl bg-card">
                                            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Usage Example</h4>
                                            <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto p-2 bg-black/40 rounded">
                                                {sdkResult.usageExample}
                                            </pre>
                                        </div>

                                        <div className="space-y-3 border border-border p-4 rounded-xl bg-card">
                                            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Dependencies</h4>
                                            <div className="space-y-2">
                                                <div className="text-[11px] font-mono text-muted-foreground bg-black/40 p-2 rounded relative group cursor-pointer" onClick={() => navigator.clipboard.writeText(sdkLang === 'python' ? `pip install ${sdkResult.dependencies.join(' ')}` : `npm install ${sdkResult.dependencies.join(' ')}`)}>
                                                    <span className="text-green-500 mr-2">$</span>
                                                    {sdkLang === 'python' ? 'pip install ' : 'npm install '}
                                                    {sdkResult.dependencies?.join(' ')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* SIDEBAR - Endpoints & Variable Store */}
            {spec && mode === "explorer" && (
                <>
                    <div className="w-80 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col h-full z-10 relative">
                        <div className="p-6 border-b border-border">
                            <h2 className="font-bold text-xl truncate" title={spec.title}>{spec.title}</h2>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{spec.baseUrl}</p>

                            <Button
                                onClick={() => setSdkModalOpen(true)}
                                variant="outline"
                                className="w-full mt-4 border-primary/50 text-primary hover:bg-primary/10 transition-colors flex items-center justify-center space-x-2"
                            >
                                <Code className="w-4 h-4" />
                                <span>Generate SDK</span>
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {spec.endpoints.map((ep, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setSelectedEndpoint(ep);
                                        setTestResponse(null);
                                        setTestParams({});
                                        setDiagnosisResult(null);
                                        setChainSuggestions([]);
                                    }}
                                    className={`w-full text-left p-3 rounded-lg border transition-all text-sm flex items-center space-x-3 
                      ${selectedEndpoint === ep
                                            ? 'bg-surface-raised border-border border-l-2 border-l-accent shadow-theme'
                                            : 'border-transparent hover:bg-surface-raised/60 dark:hover:bg-white/5'}`}
                                >
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getMethodColor(ep.method)}`}>
                                        {ep.method}
                                    </span>
                                    <span className={`font-mono text-xs truncate flex-1 ${selectedEndpoint === ep ? 'text-foreground font-semibold' : 'text-foreground/70'}`}>{ep.path}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <VariableStorePanel
                        variables={variableStore}
                        onSaveVariable={(k, v) => setVariableStore(prev => ({ ...prev, [k]: v }))}
                        onDeleteVariable={(k) => setVariableStore(prev => {
                            const copy = { ...prev };
                            delete copy[k];
                            return copy;
                        })}
                        isOpen={isVarStoreOpen}
                        onToggleOpen={() => setIsVarStoreOpen(!isVarStoreOpen)}
                    />
                </>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">

                {/* Header / Landing Input */}
                <header className="flex-none p-6 border-b border-border bg-background z-10 grid grid-cols-3 items-center">
                    <div className="flex justify-start">
                        <div
                            className="flex items-center space-x-3 cursor-pointer transition-opacity hover:opacity-80 group"
                            onClick={() => { setSpec(null); setUrl(""); setMode("explorer"); }}
                            title="Go back to Home"
                        >
                            <img src="/Orion.png" alt="Orion" className="h-[36px] w-auto object-contain dark:invert-0 invert flex-shrink-0" />
                            <span className="font-display font-bold text-xl text-foreground tracking-tight group-hover:text-accent transition-colors">Orion</span>
                        </div>
                    </div>
                    <div className="flex justify-center -ml-8 md:-ml-16">
                        <div className="hidden md:flex bg-secondary rounded-xl p-1.5 border border-border w-[600px] gap-1">
                            <button
                                onClick={() => setMode("explorer")}
                                className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'explorer' ? 'bg-background shadow-sm text-foreground scale-100' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 scale-[0.98]'}`}
                            >
                                Explorer Mode
                            </button>
                            <button
                                onClick={() => setMode("intent")}
                                className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'intent' ? 'bg-background shadow-sm text-foreground scale-100' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 scale-[0.98]'}`}
                            >
                                Intent Mode
                            </button>
                            <button
                                onClick={() => setMode("diff")}
                                className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'diff' ? 'bg-background shadow-sm text-foreground scale-100' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 scale-[0.98]'}`}
                            >
                                API Diff
                            </button>
                            <button
                                onClick={() => setMode("audit")}
                                className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'audit' ? 'bg-background shadow-sm text-foreground scale-100' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 scale-[0.98]'}`}
                            >
                                Security Audit
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-end items-center space-x-2">
                        {user && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={logout}
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            >
                                <LogOut className="w-4 h-4 mr-2" /> Logout
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            className="rounded-full w-9 h-9"
                        >
                            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>
                    </div>
                </header>

                <main className="flex-1 overflow-hidden relative">
                    {mode === "diff" ? (
                        <div className="h-full overflow-y-auto w-full bg-background p-8">
                            <div className="max-w-5xl mx-auto space-y-8 pb-24">
                                <div className="text-center space-y-4 pt-4">
                                    <h2 className="text-3xl font-extrabold tracking-tight">API Diff & Migration</h2>
                                    <p className="text-muted-foreground text-lg">
                                        Compare two OpenAPI specs and instantly generate a migration guide.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Old Version URL</label>
                                        <Input
                                            value={diffUrlA}
                                            onChange={e => setDiffUrlA(e.target.value)}
                                            placeholder="Paste old OpenAPI JSON URL..."
                                            className="w-full h-12 rounded-xl glassmorphism"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">New Version URL</label>
                                        <Input
                                            value={diffUrlB}
                                            onChange={e => setDiffUrlB(e.target.value)}
                                            placeholder="Paste new OpenAPI JSON URL..."
                                            className="w-full h-12 rounded-xl glassmorphism"
                                        />
                                    </div>
                                </div>

                                <Button
                                    onClick={handleGenerateDiff}
                                    disabled={diffLoading || !diffUrlA || !diffUrlB}
                                    size="lg"
                                    className="w-full h-14 text-lg font-bold mt-4"
                                >
                                    {diffLoading ? "Comparing specs and generating migration guide..." : "Compare & Generate Migration Guide"}
                                </Button>

                                <FriendlyErrorBox error={diffError} />

                                {diffResult && (
                                    <div className="space-y-8 mt-12 animate-in fade-in slide-in-from-bottom-4">

                                        {/* Change Summary Bar */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <PlusCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                                    <span className="text-emerald-800 dark:text-emerald-300 font-bold text-base">Added</span>
                                                </div>
                                                <span className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{diffResult.addedEndpoints?.length || 0}</span>
                                            </div>
                                            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20 flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <MinusCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                                                    <span className="text-rose-800 dark:text-rose-300 font-bold text-base">Removed</span>
                                                </div>
                                                <span className="text-3xl font-black text-rose-700 dark:text-rose-400">{diffResult.removedEndpoints?.length || 0}</span>
                                            </div>
                                            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                                    <span className="text-amber-800 dark:text-amber-300 font-bold text-base">Modified</span>
                                                </div>
                                                <span className="text-3xl font-black text-amber-700 dark:text-amber-400">{diffResult.modifiedEndpoints?.length || 0}</span>
                                            </div>
                                        </div>

                                        {/* Breaking Changes */}
                                        {diffResult.breakingChanges?.length > 0 && (
                                            <div className="space-y-4">
                                                <h3 className="text-2xl font-bold text-rose-700 dark:text-rose-400 flex items-center">
                                                    <AlertCircle className="w-6 h-6 mr-2 text-rose-600 dark:text-rose-400" /> Breaking Changes
                                                </h3>
                                                <div className="grid gap-3">
                                                    {diffResult.breakingChanges.map((change: string, idx: number) => (
                                                        <div key={idx} className="p-4 border border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/40 rounded-xl text-rose-950 dark:text-rose-200 text-sm font-medium shadow-sm flex items-start gap-3">
                                                            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                                                            <span className="leading-relaxed">{change}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Full Diff Table */}
                                        <div className="space-y-4">
                                            <h3 className="text-2xl font-bold text-foreground">Endpoint Changes</h3>
                                            <div className="border border-border rounded-xl overflow-hidden glassmorphism shadow-sm">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="text-xs uppercase bg-muted/70 text-muted-foreground font-semibold">
                                                        <tr>
                                                            <th className="px-6 py-4 border-b border-border">Endpoint</th>
                                                            <th className="px-6 py-4 border-b border-border">Method</th>
                                                            <th className="px-6 py-4 border-b border-border">Status</th>
                                                            <th className="px-6 py-4 border-b border-border">Details</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border">
                                                        {diffResult.addedEndpoints?.map((ep: any, idx: number) => (
                                                            <tr key={`add-${idx}`} className="hover:bg-muted/40 transition-colors">
                                                                <td className="px-6 py-3.5 font-mono text-foreground font-medium">{ep.path}</td>
                                                                <td className="px-6 py-3.5"><Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 font-bold">{ep.method}</Badge></td>
                                                                <td className="px-6 py-3.5 text-emerald-700 dark:text-emerald-400 font-bold">Added</td>
                                                                <td className="px-6 py-3.5 text-muted-foreground">-</td>
                                                            </tr>
                                                        ))}
                                                        {diffResult.removedEndpoints?.map((ep: any, idx: number) => (
                                                            <tr key={`rem-${idx}`} className="hover:bg-muted/40 transition-colors">
                                                                <td className="px-6 py-3.5 font-mono text-foreground font-medium">{ep.path}</td>
                                                                <td className="px-6 py-3.5"><Badge variant="outline" className="text-rose-700 dark:text-rose-400 border-rose-500/40 bg-rose-500/10 font-bold">{ep.method}</Badge></td>
                                                                <td className="px-6 py-3.5 text-rose-700 dark:text-rose-400 font-bold">Removed</td>
                                                                <td className="px-6 py-3.5 text-muted-foreground">-</td>
                                                            </tr>
                                                        ))}
                                                        {diffResult.modifiedEndpoints?.map((ep: any, idx: number) => (
                                                            <tr key={`mod-${idx}`} className="hover:bg-muted/40 transition-colors">
                                                                <td className="px-6 py-3.5 font-mono text-foreground font-medium">{ep.path}</td>
                                                                <td className="px-6 py-3.5"><Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/10 font-bold">{ep.method}</Badge></td>
                                                                <td className="px-6 py-3.5 text-amber-700 dark:text-amber-400 font-bold">Modified</td>
                                                                <td className="px-6 py-3.5 text-muted-foreground">{ep.changes}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Migration Guide */}
                                        <div className="space-y-6 pt-4 border-t border-border">
                                            <h3 className="text-2xl font-bold flex items-center text-foreground"><Bot className="w-6 h-6 mr-3 text-primary" /> Migration Guide</h3>
                                            <div className="p-6 glassmorphism border border-primary/30 rounded-xl bg-primary/5 text-foreground text-base leading-relaxed font-medium">
                                                {diffResult.summary}
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Steps to Convert</h4>
                                                <ol className="list-decimal list-inside space-y-3">
                                                    {diffResult.migrationSteps?.map((step: string, idx: number) => (
                                                        <li key={idx} className="pl-2 leading-relaxed text-foreground font-medium">{step}</li>
                                                    ))}
                                                </ol>
                                            </div>

                                            {diffResult.codePatches?.length > 0 && (
                                                <div className="space-y-6 pt-4">
                                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                        <Terminal className="w-4 h-4 text-primary" /> Code Patches
                                                    </h4>
                                                    {diffResult.codePatches.map((patch: any, idx: number) => (
                                                        <div key={idx} className="border border-border/80 dark:border-slate-800 overflow-hidden rounded-xl bg-card dark:bg-[#0B0F19] text-foreground dark:text-slate-100 shadow-md font-mono text-xs">
                                                            {/* VS Code Editor Header */}
                                                            <div className="px-4 py-2.5 border-b border-border/80 dark:border-slate-800/80 bg-muted/60 dark:bg-[#121826] flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex gap-1.5">
                                                                        <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                                                                        <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                                                                        <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                                                                    </div>
                                                                    <span className="font-sans text-xs font-semibold text-foreground/90 dark:text-slate-300 tracking-wide">{patch.description}</span>
                                                                </div>
                                                                <button
                                                                    className="text-[11px] font-sans flex items-center gap-1.5 text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-100 transition-colors px-2.5 py-1 rounded-md border border-border/60 dark:border-slate-800 bg-background/80 dark:bg-slate-800/60 hover:bg-muted dark:hover:bg-slate-800 shadow-xs"
                                                                    onClick={(e) => {
                                                                        navigator.clipboard.writeText(`// Before:\n${patch.before}\n\n// After:\n${patch.after}`);
                                                                        const btn = e.currentTarget;
                                                                        const orig = btn.innerHTML;
                                                                        btn.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>';
                                                                        setTimeout(() => btn.innerHTML = orig, 2000);
                                                                    }}
                                                                >
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                    <span>Copy Patch</span>
                                                                </button>
                                                            </div>
                                                            {/* VS Code Light & Dark Diff Comparison Grid */}
                                                            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/80 dark:divide-slate-800">
                                                                <div className="flex flex-col bg-rose-50/50 dark:bg-[#0C101A]">
                                                                    <div className="px-4 py-2 bg-rose-500/15 dark:bg-rose-950/40 border-b border-rose-200/80 dark:border-slate-800/80 flex items-center justify-between">
                                                                        <span className="text-rose-800 dark:text-rose-400 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Before (Legacy)
                                                                        </span>
                                                                    </div>
                                                                    <div className="p-4 bg-rose-50/70 dark:bg-[#0C101A] text-rose-950 dark:text-rose-200 overflow-x-auto selection:bg-rose-200 dark:selection:bg-rose-900/50 leading-relaxed font-mono text-[12px] font-medium">
                                                                        <pre><code>{patch.before}</code></pre>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col bg-emerald-50/50 dark:bg-[#0C101A]">
                                                                    <div className="px-4 py-2 bg-emerald-500/15 dark:bg-emerald-950/40 border-b border-emerald-200/80 dark:border-slate-800/80 flex items-center justify-between">
                                                                        <span className="text-emerald-800 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> After (Updated)
                                                                        </span>
                                                                    </div>
                                                                    <div className="p-4 bg-emerald-50/70 dark:bg-[#0C101A] text-emerald-950 dark:text-emerald-200 overflow-x-auto selection:bg-emerald-200 dark:selection:bg-emerald-900/50 leading-relaxed font-mono text-[12px] font-medium">
                                                                        <pre><code>{patch.after}</code></pre>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                )}
                            </div>
                        </div>
                    ) : mode === "audit" ? (
                        <div className="h-full overflow-y-auto w-full bg-background p-8">
                            <div className="max-w-5xl mx-auto space-y-8 pb-24">
                                <div className="text-center space-y-4 pt-4">
                                    <h2 className="text-3xl font-extrabold tracking-tight">API Security Audit</h2>
                                    <p className="text-muted-foreground text-lg">
                                        Scan OpenAPI specifications for vulnerabilities and structural risks automatically.
                                    </p>
                                </div>

                                <div className="max-w-3xl mx-auto space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">OpenAPI Spec URL</label>
                                        <Input
                                            value={auditUrl}
                                            onChange={e => setAuditUrl(e.target.value)}
                                            placeholder="Paste OpenAPI JSON URL to audit..."
                                            className="w-full h-14 rounded-xl glassmorphism text-lg"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleRunAudit}
                                        disabled={auditLoading || !auditUrl}
                                        size="lg"
                                        className="w-full h-14 text-lg font-bold"
                                    >
                                        {auditLoading ? "Scanning for vulnerabilities..." : "Run Security Audit"}
                                    </Button>

                                    <FriendlyErrorBox error={auditError} />
                                </div>

                                {auditResult && (
                                    <div className="space-y-8 mt-12 animate-in fade-in slide-in-from-bottom-4">

                                        {/* Risk Score Card */}
                                        <div className="flex flex-col items-center justify-center p-8 rounded-3xl border border-white/5 bg-card/40 glassmorphism relative overflow-hidden">
                                            <div className={`absolute inset-0 opacity-10 ${auditResult.riskScore < 30 ? 'bg-green-500' : auditResult.riskScore < 60 ? 'bg-yellow-500' : auditResult.riskScore < 80 ? 'bg-orange-500' : 'bg-red-500'}`}></div>

                                            <div className="relative z-10 flex flex-col items-center text-center">
                                                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Overall Security Risk</h3>

                                                <div className={`relative flex items-center justify-center w-48 h-48 rounded-full border-[12px] shadow-inner mb-4
                                                    ${auditResult.riskScore < 30 ? 'border-green-500/80 text-green-400' :
                                                        auditResult.riskScore < 60 ? 'border-yellow-500/80 text-yellow-400' :
                                                            auditResult.riskScore < 80 ? 'border-orange-500/80 text-orange-400' :
                                                                'border-red-500/80 text-red-500 shadow-[0_0_50px_rgba(239,68,68,0.4)]'}`}>
                                                    <span className="text-6xl font-black">{auditResult.riskScore}</span>
                                                </div>

                                                <Badge variant="outline" className={`text-xl px-6 py-2 uppercase tracking-widest font-black border-2
                                                    ${auditResult.riskScore < 30 ? 'border-green-500 text-green-500' :
                                                        auditResult.riskScore < 60 ? 'border-yellow-500 text-yellow-500' :
                                                            auditResult.riskScore < 80 ? 'border-orange-500 text-orange-500' :
                                                                'border-red-500 text-red-500 animate-pulse'}`}>
                                                    {auditResult.riskLevel}
                                                </Badge>
                                            </div>
                                        </div>

                                        {/* Quick Stats Row */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex flex-col items-center justify-center text-center">
                                                <span className="text-3xl font-black text-red-500">{auditResult.noAuthEndpoints?.length || 0}</span>
                                                <span className="text-xs font-bold text-red-400 uppercase tracking-widest mt-1">Unprotected<br />Endpoints</span>
                                            </div>
                                            <div className="p-4 rounded-xl border border-orange-500/30 bg-orange-500/10 flex flex-col items-center justify-center text-center">
                                                <span className="text-3xl font-black text-orange-500">{auditResult.sensitiveDataExposed?.length || 0}</span>
                                                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest mt-1">Sensitive Data<br />Exposed</span>
                                            </div>
                                            <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex flex-col items-center justify-center text-center">
                                                <span className="text-3xl font-black text-yellow-500">{auditResult.missingHttps?.length || 0}</span>
                                                <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest mt-1">HTTPS<br />Issues</span>
                                            </div>
                                            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex flex-col items-center justify-center text-center">
                                                <span className="text-3xl font-black text-red-500">{auditResult.adminEndpointsUnprotected?.length || 0}</span>
                                                <span className="text-xs font-bold text-red-400 uppercase tracking-widest mt-1">Admin Endpoints<br />At Risk</span>
                                            </div>
                                        </div>

                                        {/* Findings List */}
                                        <div className="space-y-4 pt-8">
                                            <h3 className="text-2xl font-bold flex items-center"><AlertCircle className="w-6 h-6 mr-3" /> Detailed Findings</h3>
                                            <div className="space-y-4">
                                                {auditResult.findings?.map((finding: any, idx: number) => {
                                                    const isCritical = finding.severity.toLowerCase() === 'critical';
                                                    const isHigh = finding.severity.toLowerCase() === 'high';
                                                    const isMedium = finding.severity.toLowerCase() === 'medium';

                                                    return (
                                                        <div key={idx} className={`p-6 rounded-xl border bg-card/60 glassmorphism relative overflow-hidden transition-all
                                                            ${isCritical ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)]' :
                                                                isHigh ? 'border-orange-500/50' :
                                                                    isMedium ? 'border-yellow-500/50' :
                                                                        'border-blue-500/50'}`}>

                                                            <div className="flex justify-between items-start mb-4">
                                                                <h4 className="text-lg font-bold pr-8">{finding.title}</h4>
                                                                <Badge variant="outline" className={`uppercase tracking-widest text-[10px] font-black border
                                                                    ${isCritical ? 'bg-red-500 text-white border-red-500 animate-pulse' :
                                                                        isHigh ? 'text-orange-400 border-orange-500/50' :
                                                                            isMedium ? 'text-yellow-400 border-yellow-500/50' :
                                                                                'text-blue-400 border-blue-500/50'}`}>
                                                                    {finding.severity}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{finding.description}</p>
                                                            <div className="bg-black/40 rounded-lg p-4 border border-white/5">
                                                                <span className="text-xs font-black uppercase tracking-widest text-primary/80 mb-2 block">Recommendation</span>
                                                                <p className="text-sm font-medium">{finding.recommendation}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Executive Summary */}
                                        <div className="space-y-4 pt-8 pb-8 border-b border-border/50">
                                            <h3 className="text-lg font-black uppercase tracking-widest text-muted-foreground">Executive Summary</h3>
                                            <div className="p-6 border-l-4 border-primary bg-card/30 text-lg leading-relaxed shadow-sm">
                                                {auditResult.summary}
                                            </div>
                                        </div>

                                    </div>
                                )}
                            </div>
                        </div>
                    ) : mode === "intent" ? (
                        <div className="h-full overflow-y-auto w-full bg-background p-8">
                            <div className="max-w-4xl mx-auto space-y-8 pb-24">
                                <div className="text-center space-y-4 pt-4">
                                    <h2 className="text-3xl font-extrabold tracking-tight">Intent-to-Integration</h2>
                                    <p className="text-muted-foreground text-lg">
                                        Describe your goal in natural language, and let the AI figure out the full multi-step integration plan.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <Textarea
                                        value={intentGoal}
                                        onChange={e => setIntentGoal(e.target.value)}
                                        placeholder="Describe what you want to build — e.g. 'Fetch GitHub repos and post a summary to Slack'"
                                        className="w-full text-lg p-6 min-h-[120px] rounded-xl glassmorphism"
                                    />
                                    <Button
                                        onClick={handleGenerateIntent}
                                        disabled={intentLoading || !intentGoal.trim()}
                                        size="lg"
                                        className="w-full h-14 text-lg font-bold"
                                    >
                                        {intentLoading ? "Generating Integration..." : "Generate Integration"}
                                    </Button>
                                    <FriendlyErrorBox error={intentError} />
                                </div>

                                {intentResult && (
                                    <div className="space-y-8 mt-12 animate-in fade-in slide-in-from-bottom-4">
                                        {/* Auth Notes */}
                                        {intentResult.authNotes && (
                                            <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 p-6 rounded-xl flex items-start space-x-4">
                                                <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <h3 className="font-bold text-lg mb-1">Auth Notes</h3>
                                                    <p className="text-sm opacity-90">{intentResult.authNotes}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Step-by-step Plan */}
                                        {(intentResult.steps && intentResult.steps.length > 0) && (
                                            <div className="space-y-4">
                                                <h3 className="text-2xl font-bold">Integration Plan</h3>
                                                <div className="grid gap-4">
                                                    {intentResult.steps.map((step: any, idx: number) => (
                                                        <div key={idx} className="flex space-x-4 p-5 bg-card border border-border rounded-xl shadow-sm relative overflow-hidden">
                                                            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold flex-shrink-0 z-10">
                                                                {idx + 1}
                                                            </div>
                                                            <div className="flex-1 z-10">
                                                                <div className="font-bold text-lg">{step.title}</div>
                                                                <p className="text-muted-foreground text-sm mt-1">{step.description}</p>
                                                                {step.api && <Badge variant="outline" className="mt-2">{step.api}</Badge>}
                                                            </div>
                                                            <div className="absolute right-0 top-0 bottom-0 pr-4 flex items-center opacity-10 blur-sm pointer-events-none">
                                                                <span className="text-6xl font-black">{idx + 1}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Code Tabs */}
                                        <div className="border border-zinc-800 rounded-xl bg-black overflow-hidden shadow-2xl">
                                            <div className="flex items-center justify-between border-b border-zinc-800 bg-black px-3 pt-2">
                                                <div className="flex items-center space-x-1">
                                                    {[
                                                        { id: "python", label: "Python" },
                                                        { id: "js", label: "JavaScript" },
                                                        { id: "curl", label: "cURL" }
                                                    ].map(tab => (
                                                        <button
                                                            key={tab.id}
                                                            onClick={() => setActiveCodeTab(tab.id as any)}
                                                            className={`px-5 py-2.5 text-xs font-mono font-bold transition-all rounded-t-lg ${
                                                                activeCodeTab === tab.id
                                                                    ? 'bg-zinc-900 text-emerald-400 border-b-2 border-emerald-400'
                                                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                                                            }`}
                                                        >
                                                            {tab.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        const currentCode = activeCodeTab === "python" ? intentResult.code :
                                                            activeCodeTab === "js" ? intentResult.jsCode :
                                                                (intentResult.curlCommands || []).join("\n\n");
                                                        navigator.clipboard.writeText(currentCode);
                                                        const btn = e.currentTarget;
                                                        const orig = btn.innerHTML;
                                                        btn.innerHTML = '<span class="text-emerald-400 font-bold">Copied!</span>';
                                                        setTimeout(() => btn.innerHTML = orig, 2000);
                                                    }}
                                                    className="px-3 py-1 text-xs font-mono text-zinc-400 hover:text-zinc-100 flex items-center gap-1.5 transition-colors"
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                    <span>Copy</span>
                                                </button>
                                            </div>
                                            <div className="p-6 overflow-x-auto text-sm font-mono text-emerald-400 bg-black leading-relaxed">
                                                <pre>
                                                    <code>
                                                        {activeCodeTab === "python" ? intentResult.code :
                                                            activeCodeTab === "js" ? intentResult.jsCode :
                                                                (intentResult.curlCommands || []).join("\n\n")}
                                                    </code>
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : !spec ? (
                        <div className="h-full overflow-y-auto w-full">
                            <div className="max-w-6xl mx-auto space-y-16 px-6 py-10 pb-24">

                                {/* Brand Header — large logo + wordmark */}
                                <div className="flex flex-col items-center text-center pt-4 pb-2 space-y-4">
                                    <div className="flex items-center gap-5">
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-3xl bg-accent/20 blur-2xl scale-150" />
                                            <img
                                                src="/Orion.png"
                                                alt="Orion Logo"
                                                className="relative h-20 w-auto object-contain dark:invert-0 invert drop-shadow-xl"
                                            />
                                        </div>
                                        <div className="text-left">
                                            <h1 className="font-display font-black text-5xl md:text-6xl lg:text-7xl text-foreground tracking-tight leading-none">
                                                Orion
                                            </h1>
                                            <p className="font-mono text-xs uppercase tracking-widest text-accent font-semibold mt-1.5">
                                                API Intelligence Layer
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-foreground/75 text-base md:text-lg max-w-2xl font-sans leading-relaxed">
                                        Paste any OpenAPI or Swagger URL to instantly generate a full developer explorer, execute live calls, compute diffs, and run automated security audits.
                                    </p>
                                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono border border-accent/30 bg-accent/10 text-accent font-semibold">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>Powered by LLaMA 3.3 70B via Groq</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                                    <div className="lg:col-span-7 space-y-6">

                                        {/* Central Parsing Input */}
                                        <div className="w-full flex flex-col space-y-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="relative flex-1 w-full">
                                                    <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                                                    <Input
                                                        value={url}
                                                        onChange={e => setUrl(e.target.value)}
                                                        placeholder="Paste any OpenAPI / Swagger URL — JSON or YAML supported"
                                                        className="pl-11 h-14 rounded-xl glassmorphism text-base w-full font-mono text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                                                        onKeyDown={e => { if (e.key === 'Enter') handleParse(); }}
                                                    />
                                                </div>
                                                <Button onClick={() => handleParse()} disabled={loading} size="lg" className="h-14 px-8 rounded-xl font-bold text-base bg-accent text-background hover:opacity-90 transition-all shadow-lg shadow-accent/10">
                                                    {loading ? "Parsing..." : "Parse API"}
                                                </Button>
                                            </div>
                                            <p className="text-xs text-foreground/60 font-sans pl-1">
                                                Works with any framework — FastAPI, Express, Spring Boot, Django and more. Try a sample above to see it in action.
                                            </p>
                                            <div className="pt-2 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/70 font-mono flex items-center gap-1.5">
                                                        <Sparkles className="w-3.5 h-3.5 text-accent" />
                                                        Quick Start Sample Specifications
                                                    </p>
                                                    <span className="text-[10px] font-mono text-muted-foreground">Click to load & parse</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {[
                                                        {
                                                            name: "Petstore (YAML)",
                                                            url: "https://raw.githubusercontent.com/swagger-api/swagger-petstore/master/src/main/resources/openapi.yaml",
                                                            badge: "OpenAPI 3.0 · YAML"
                                                        },
                                                        {
                                                            name: "Spotify API",
                                                            url: "https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/spotify.com/1.0.0/openapi.yaml",
                                                            badge: "OpenAPI 3.0 · 80+ endpoints"
                                                        },
                                                        {
                                                            name: "Kubernetes",
                                                            url: "https://raw.githubusercontent.com/kubernetes/kubernetes/master/api/openapi-spec/swagger.json",
                                                            badge: "Swagger 2.0 · Enterprise Scale",
                                                            warning: "Large spec — may take a few seconds to parse."
                                                        },
                                                        {
                                                            name: "OpenAI API",
                                                            url: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.json",
                                                            badge: "OpenAPI 3.0 · Production"
                                                        },
                                                        {
                                                            name: "AWS S3",
                                                            url: "https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/amazonaws.com/s3/2006-03-01/openapi.yaml",
                                                            badge: "OpenAPI 3.0 · YAML · Cloud"
                                                        }
                                                    ].map((sample) => (
                                                        <button
                                                            key={sample.name}
                                                            type="button"
                                                            onClick={() => { setUrl(sample.url); handleParse(sample.url); }}
                                                            className="group text-left p-3.5 rounded-xl bg-surface border border-border border-l-[3px] border-l-accent hover:border-accent/40 hover:shadow-theme hover:scale-[1.01] transition-all duration-200 cursor-pointer flex flex-col justify-between"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <span className="font-bold text-foreground text-sm group-hover:text-accent transition-colors">
                                                                    {sample.name}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-accent/10 text-accent border border-accent/20 whitespace-nowrap">
                                                                    {sample.badge}
                                                                </span>
                                                            </div>
                                                            {sample.warning && (
                                                                <div className="mt-2 text-[10px] text-amber-500 font-mono flex items-center gap-1">
                                                                    <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                                                    <span>{sample.warning}</span>
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <FriendlyErrorBox error={error} />
                                        </div>
                                    </div>

                                    {/* 3a. Signature Interactive Element: Diner/Waiter/Server Metaphor */}
                                    <div className="lg:col-span-5 flex justify-center">
                                        <ApiMetaphorAnimation />
                                    </div>
                                </div>

                                {/* 3b. "What each mode actually does" section */}
                                <div className="space-y-8 pt-10 border-t border-border">
                                    <div className="text-center space-y-3">
                                        <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">What Each Mode Actually Does</h2>
                                        <p className="text-foreground/70 text-base max-w-2xl mx-auto font-sans">
                                            Deterministic code inspection paired with grounded LLM analysis for full spec lifecycle intelligence.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Explorer Card */}
                                        <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col justify-between hover:border-accent/40 transition-all shadow-theme group">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent px-2.5 py-1 rounded bg-accent/10 border border-accent/20">
                                                        Explorer Mode
                                                    </span>
                                                    <Search className="w-5 h-5 text-accent" />
                                                </div>
                                                <p className="text-foreground text-sm font-sans leading-relaxed">
                                                    Paste a spec URL. We parse every endpoint, method, and parameter server-side and put it in an interactive explorer — click any endpoint and run it for real, right in the browser.
                                                </p>
                                            </div>
                                            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
                                                <span className="text-xs font-mono text-muted">Proof Point</span>
                                                <span className="text-xs font-mono text-accent font-semibold">Live Sandbox Execution</span>
                                            </div>
                                        </div>

                                        {/* Intent Card */}
                                        <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col justify-between hover:border-accent/40 transition-all shadow-theme group">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent px-2.5 py-1 rounded bg-accent/10 border border-accent/20">
                                                        Intent Mode
                                                    </span>
                                                    <Code className="w-5 h-5 text-accent" />
                                                </div>
                                                <p className="text-foreground text-sm font-sans leading-relaxed">
                                                    Describe what you&apos;re trying to build in plain English... Get back a step-by-step plan and working code in Python, JavaScript, and cURL — grounded in the actual spec, not a guess.
                                                </p>
                                            </div>
                                            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
                                                <span className="text-xs font-mono text-muted">Proof Point</span>
                                                <span className="text-xs font-mono text-accent font-semibold">Python / JS / cURL Generator</span>
                                            </div>
                                        </div>

                                        {/* API Diff Card */}
                                        <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col justify-between hover:border-accent/40 transition-all shadow-theme group">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent px-2.5 py-1 rounded bg-accent/10 border border-accent/20">
                                                        API Diff
                                                    </span>
                                                    <Play className="w-5 h-5 text-accent" />
                                                </div>
                                                <p className="text-foreground text-sm font-sans leading-relaxed">
                                                    Load two versions of a spec. See exactly what was added, removed, or changed — computed endpoint-by-endpoint, not summarized loosely — plus a migration guide for anything breaking.
                                                </p>
                                            </div>
                                            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
                                                <span className="text-xs font-mono text-muted">Proof Point</span>
                                                <span className="text-xs font-mono text-accent font-semibold">Petstore v2 → v3: 1 endpoint removed, 19 modified</span>
                                            </div>
                                        </div>

                                        {/* Security Audit Card */}
                                        <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col justify-between hover:border-accent/40 transition-all shadow-theme group">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-critical px-2.5 py-1 rounded bg-accent-critical/10 border border-accent-critical/20">
                                                        Security Audit
                                                    </span>
                                                    <Shield className="w-5 h-5 text-accent-critical" />
                                                </div>
                                                <p className="text-foreground text-sm font-sans leading-relaxed">
                                                    Scan any spec for unauthenticated endpoints, exposed sensitive fields, missing HTTPS, and unprotected admin routes, then get a risk score and a plain-English breakdown of what to fix first.
                                                </p>
                                            </div>
                                            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
                                                <span className="text-xs font-mono text-muted">Proof Point</span>
                                                <span className="text-xs font-mono text-accent-critical font-semibold">Petstore scores 90/100 Critical — 11 endpoints with no authentication</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 3b-2. Works With Every Major API Standard */}
                                <div className="space-y-8 pt-12 border-t border-border">
                                    <div className="text-center space-y-3">
                                        <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">
                                            Works With Every Major API Standard
                                        </h2>
                                        <p className="text-foreground/70 text-base max-w-2xl mx-auto font-sans">
                                            Universal compatibility across OpenAPI versions, serialization formats, and modern backend frameworks.
                                        </p>
                                    </div>

                                    {/* Part A — Row of compatibility badges */}
                                    <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-4xl mx-auto">
                                        {[
                                            "OpenAPI 3.0",
                                            "Swagger 2.0",
                                            "JSON",
                                            "YAML",
                                            "REST API",
                                            "FastAPI",
                                            "Express",
                                            "Spring Boot",
                                            "Django",
                                            "Any Framework"
                                        ].map((badge) => (
                                            <span
                                                key={badge}
                                                className="px-3.5 py-1.5 rounded-full text-xs font-mono font-semibold bg-surface text-accent border border-accent/25 shadow-sm hover:border-accent hover:shadow-theme transition-all cursor-default"
                                            >
                                                {badge}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Part B — 2-column grid of powered-by sample cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                        {[
                                            {
                                                name: "Petstore",
                                                badge: "OpenAPI 3.0 · YAML",
                                                desc: "Petstore — Standard OpenAPI 3.0 sample spec in clean YAML format",
                                                url: "https://raw.githubusercontent.com/swagger-api/swagger-petstore/master/src/main/resources/openapi.yaml"
                                            },
                                            {
                                                name: "Spotify API",
                                                badge: "OpenAPI 3.0 · 80+ Endpoints",
                                                desc: "Spotify — Complete REST API with 80+ endpoints and complex schemas",
                                                url: "https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/spotify.com/1.0.0/openapi.yaml"
                                            },
                                            {
                                                name: "Kubernetes",
                                                badge: "Swagger 2.0 · Enterprise Scale",
                                                desc: "Kubernetes — 800+ enterprise-grade endpoints parsed instantly",
                                                url: "https://raw.githubusercontent.com/kubernetes/kubernetes/master/api/openapi-spec/swagger.json"
                                            },
                                            {
                                                name: "OpenAI API",
                                                badge: "OpenAPI 3.0 · Production",
                                                desc: "OpenAI — Modern production API spec powering frontier AI language models",
                                                url: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.json"
                                            },
                                            {
                                                name: "AWS S3",
                                                badge: "OpenAPI 3.0 · Cloud",
                                                desc: "AWS S3 — Industrial cloud storage REST specification in multi-file YAML",
                                                url: "https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/amazonaws.com/s3/2006-03-01/openapi.yaml"
                                            }
                                        ].map((item) => (
                                            <div
                                                key={item.name}
                                                onClick={() => {
                                                    setUrl(item.url);
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    handleParse(item.url);
                                                }}
                                                className="p-5 rounded-2xl bg-surface border border-border border-l-[3px] border-l-accent hover:border-accent/50 hover:shadow-theme transition-all cursor-pointer flex flex-col justify-between group"
                                            >
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-foreground text-base group-hover:text-accent transition-colors">
                                                            {item.name}
                                                        </span>
                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-accent/10 text-accent border border-accent/20">
                                                            {item.badge}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-foreground/70 font-sans leading-relaxed">
                                                        {item.desc}
                                                    </p>
                                                </div>
                                                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                                                    <span className="text-[11px] font-mono text-accent flex items-center gap-1 font-semibold">
                                                        Try Sample Spec →
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>


                                {/* 3c. "How it works" strip */}
                                <div className="space-y-8 pt-10 border-t border-border">
                                    <div className="text-center space-y-3">
                                        <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">How It Works</h2>
                                        <p className="text-foreground/70 text-base max-w-2xl mx-auto font-sans">
                                            Facts computed deterministically in code first — language generated by the model on top of verified facts.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="p-5 rounded-xl bg-surface border border-border space-y-3 shadow-theme">
                                            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-mono font-bold text-sm">
                                                01
                                            </div>
                                            <h3 className="font-display font-bold text-base text-foreground">Spec Input</h3>
                                            <p className="text-xs text-foreground/65 font-sans leading-relaxed">
                                                Fetch raw OpenAPI 3.0 / Swagger JSON specifications directly from any URL.
                                            </p>
                                        </div>

                                        <div className="p-5 rounded-xl bg-surface border border-border space-y-3 shadow-theme">
                                            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-mono font-bold text-sm">
                                                02
                                            </div>
                                            <h3 className="font-display font-bold text-base text-foreground">Structured Parsing</h3>
                                            <p className="text-xs text-foreground/65 font-sans leading-relaxed">
                                                Extract every endpoint, query param, request body, and auth requirement in server-side code.
                                            </p>
                                        </div>

                                        <div className="p-5 rounded-xl bg-surface border border-border space-y-3 shadow-theme">
                                            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-mono font-bold text-sm">
                                                03
                                            </div>
                                            <h3 className="font-display font-bold text-base text-foreground">Deterministic Checks</h3>
                                            <p className="text-xs text-foreground/65 font-sans leading-relaxed">
                                                Compute diff matrix, audit missing auth, and validate endpoints algorithmically.
                                            </p>
                                        </div>

                                        <div className="p-5 rounded-xl bg-surface border border-border space-y-3 shadow-theme">
                                            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-mono font-bold text-sm">
                                                04
                                            </div>
                                            <h3 className="font-display font-bold text-base text-foreground">LLM Synthesis</h3>
                                            <p className="text-xs text-foreground/65 font-sans leading-relaxed">
                                                LLaMA 3.3 70B synthesizes grounded migration guides, code snippets, and remediation steps.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* 3d. Tech stack strip */}
                                <div className="py-6 px-8 rounded-2xl bg-surface border border-border shadow-theme flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <span className="text-xs font-mono uppercase tracking-widest text-foreground/60 font-bold">Built With Engineering Rigor</span>
                                    <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-xs text-foreground font-semibold">
                                        <span className="px-3.5 py-1.5 rounded-full bg-surface-raised border border-border">Next.js App Router</span>
                                        <span className="px-3.5 py-1.5 rounded-full bg-surface-raised border border-border">Groq Cloud LPU</span>
                                        <span className="px-3.5 py-1.5 rounded-full bg-surface-raised border border-border">LLaMA 3.3 70B</span>
                                    </div>
                                </div>

                                {/* 3e. Footer / closing CTA */}
                                <div className="pt-12 pb-6 border-t border-border text-center space-y-6">
                                    <h2 className="text-3xl font-extrabold font-display text-foreground">Ready to Explore & Audit Your API?</h2>
                                    <p className="text-foreground/65 text-sm max-w-md mx-auto font-sans">
                                        Start with any OpenAPI JSON specification URL — no account or API keys required to parse.
                                    </p>

                                    <div className="max-w-xl mx-auto space-y-3">
                                        <div className="flex items-center space-x-3">
                                            <div className="relative flex-1 w-full">
                                                <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                                                <Input
                                                    value={url}
                                                    onChange={e => setUrl(e.target.value)}
                                                    placeholder="Paste any OpenAPI / Swagger URL — JSON or YAML supported"
                                                    className="pl-11 h-14 rounded-xl glassmorphism text-base w-full font-mono text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                                                    onKeyDown={e => { if (e.key === 'Enter') handleParse(); }}
                                                />
                                            </div>
                                            <Button onClick={() => handleParse()} disabled={loading} size="lg" className="h-14 px-8 rounded-xl font-bold text-base bg-accent text-background hover:opacity-90 transition-all">
                                                {loading ? "Parsing..." : "Parse API"}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-foreground/60 font-sans text-center">
                                            Works with any framework — FastAPI, Express, Spring Boot, Django and more. Try a sample above to see it in action.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : selectedEndpoint ? (
                        <div className="h-full flex">
                            {/* Endpoint Details */}
                            <div className="flex-1 p-8 overflow-y-auto">
                                <div className="max-w-3xl mx-auto space-y-8">
                                    <div>
                                        <h2 className="text-3xl font-bold mb-2">{selectedEndpoint.summary || selectedEndpoint.operationId || "Endpoint"}</h2>
                                        <p className="text-muted-foreground">{selectedEndpoint.description}</p>
                                    </div>

                                    <div className="flex items-center space-x-4 p-4 rounded-xl glassmorphism border border-white/5">
                                        <Badge variant="outline" className={`text-sm ${getMethodColor(selectedEndpoint.method)}`}>
                                            {selectedEndpoint.method}
                                        </Badge>
                                        <span className="font-mono text-lg text-foreground/90">{selectedEndpoint.path}</span>
                                    </div>

                                    {/* API Playground */}
                                    <Card className="glassmorphism border-white/10">
                                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                                            <div>
                                                <CardTitle className="text-lg">API Playground</CardTitle>
                                                <CardDescription>Test this endpoint directly with session chain variables</CardDescription>
                                            </div>
                                            {testResponse?.data && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={handleSuggestChain}
                                                    disabled={suggestLoading}
                                                    className="border-blue-500/50 text-blue-300 hover:bg-blue-500/20 glassmorphism text-xs font-bold flex items-center space-x-1.5"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                                                    <span>{suggestLoading ? "Analyzing..." : "Suggest Chain"}</span>
                                                </Button>
                                            )}
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* AI Chain Suggestions */}
                                            {chainSuggestions.length > 0 && (
                                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2 animate-in fade-in">
                                                    <div className="flex items-center space-x-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                                                        <Sparkles className="w-4 h-4 text-blue-400" />
                                                        <span>Suggested Parameter Chainings</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        {chainSuggestions.map((s, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => applySuggestion(s)}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 transition-all flex items-center space-x-1.5 shadow-sm"
                                                                title={s.rationale || `Map ${s.from} to ${s.to}`}
                                                            >
                                                                <span className="font-bold">Apply:</span>
                                                                <span className="text-cyan-300 font-bold">{`{{${s.from}}}`}</span>
                                                                <span>→</span>
                                                                <span className="text-white font-bold">{s.to}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Parameters Section */}
                                            {selectedEndpoint.parameters.length > 0 && (
                                                <div className="space-y-3">
                                                    <h4 className="text-sm font-semibold">Parameters</h4>
                                                    {selectedEndpoint.parameters.map((p, i) => (
                                                        <div key={i} className="flex gap-4 items-center">
                                                            <span className="w-1/4 text-sm font-mono text-muted-foreground truncate" title={p.name}>
                                                                {p.name} {p.required && <span className="text-destructive">*</span>}
                                                            </span>
                                                            <Badge variant="secondary" className="text-[10px]">{p.in}</Badge>
                                                            <VariableInput
                                                                className="flex-1 h-8 text-sm font-mono"
                                                                placeholder={p.description || "value... (use {{var}})"}
                                                                value={testParams[p.name] || ''}
                                                                onValueChange={val => setTestParams({ ...testParams, [p.name]: val })}
                                                                variables={variableStore}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Headers Section */}
                                            <div className="space-y-3 pt-2 border-t border-border/40">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-semibold">Headers</h4>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setCustomHeaders([...customHeaders, { key: "", value: "" }])}
                                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" /> Add Header
                                                    </Button>
                                                </div>
                                                {customHeaders.map((h, i) => (
                                                    <div key={i} className="flex gap-3 items-center">
                                                        <VariableInput
                                                            className="w-1/3 h-8 text-sm font-mono"
                                                            placeholder="Header (e.g. Authorization)"
                                                            value={h.key}
                                                            onValueChange={(val) => {
                                                                const updated = [...customHeaders];
                                                                updated[i].key = val;
                                                                setCustomHeaders(updated);
                                                            }}
                                                            variables={variableStore}
                                                        />
                                                        <VariableInput
                                                            className="flex-1 h-8 text-sm font-mono"
                                                            placeholder="Value (e.g. Bearer {{token}})"
                                                            value={h.value}
                                                            onValueChange={(val) => {
                                                                const updated = [...customHeaders];
                                                                updated[i].value = val;
                                                                setCustomHeaders(updated);
                                                            }}
                                                            variables={variableStore}
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setCustomHeaders(customHeaders.filter((_, idx) => idx !== i))}
                                                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Request Body */}
                                            {selectedEndpoint.requestBody && (
                                                <div className="space-y-3 pt-2 border-t border-border/40">
                                                    <h4 className="text-sm font-semibold">Request Body (JSON)</h4>
                                                    <div className="h-40 border rounded-md overflow-hidden border-border/50">
                                                        <Editor
                                                            height="100%"
                                                            defaultLanguage="json"
                                                            theme={theme === "dark" ? "vs-dark" : "light"}
                                                            value={testParams.body || '{\n  \n}'}
                                                            onChange={(val) => setTestParams({ ...testParams, body: val || '' })}
                                                            onMount={handleEditorMount}
                                                            options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <Button onClick={handleTestApi} disabled={testLoading} className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                                                {testLoading ? "Testing..." : <><Play className="w-4 h-4 mr-2" /> Execute Request</>}
                                            </Button>

                                            {testResponse && (
                                                <div className="mt-6 space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-sm font-medium">Response</span>
                                                        <Badge variant={testResponse.status < 400 ? "default" : "destructive"}>
                                                            {testResponse.status} {testResponse.statusText}
                                                        </Badge>
                                                    </div>
                                                    <div className="p-4 rounded-lg bg-black/50 border border-white/10 font-mono text-sm overflow-x-auto">
                                                        <pre className="text-green-400">
                                                            {JSON.stringify(testResponse.data, null, 2)}
                                                        </pre>
                                                    </div>

                                                    {/* Auto-Extracted Variables Panel */}
                                                    {testResponse.status >= 200 && testResponse.status < 300 && extractedVars.length > 0 && (
                                                        <div className="mt-4 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-3 animate-in fade-in">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center space-x-2">
                                                                    <Link2 className="w-4 h-4 text-cyan-400" />
                                                                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Extracted Variables</span>
                                                                </div>
                                                                <span className="text-[10px] text-cyan-300/80">Auto-detected from response</span>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2">
                                                                {extractedVars.map((item, idx) => {
                                                                    const isSaved = variableStore[item.key] === item.value;
                                                                    return (
                                                                        <div
                                                                            key={idx}
                                                                            className="bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 rounded-full px-3.5 py-1 text-xs font-mono flex items-center space-x-2 shadow-sm"
                                                                        >
                                                                            <span>
                                                                                <strong className="text-cyan-200">{`{{${item.key}}}`}</strong>: {item.value}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => setVariableStore(prev => ({ ...prev, [item.key]: item.value }))}
                                                                                disabled={isSaved}
                                                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${isSaved
                                                                                        ? "bg-cyan-500/40 text-cyan-100 cursor-default"
                                                                                        : "bg-cyan-500 hover:bg-cyan-400 text-black cursor-pointer"
                                                                                    }`}
                                                                            >
                                                                                {isSaved ? "Saved" : "Save"}
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {testResponse.status >= 400 && (
                                                        <div className="mt-4 border-t border-border/50 pt-4">
                                                            {!diagnosisResult ? (
                                                                <Button onClick={handleDiagnose} disabled={diagnosisLoading} variant="outline" className="w-full border-red-500/30 hover:bg-red-500/10 text-red-500 glassmorphism">
                                                                    <Search className="w-4 h-4 mr-2" />
                                                                    {diagnosisLoading ? "Investigating the error..." : "Analyze Error"}
                                                                </Button>
                                                            ) : (
                                                                <div className="border border-red-500/50 bg-red-500/5 rounded-xl p-6 space-y-6 relative overflow-hidden glassmorphism mt-4">
                                                                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                                                        <Search className="w-24 h-24 text-red-500" />
                                                                    </div>

                                                                    <div className="flex items-center space-x-3 relative z-10">
                                                                        <Search className="w-6 h-6 text-red-400" />
                                                                        <h3 className="text-xl font-bold text-red-400">Error Detective</h3>
                                                                        <Badge variant="outline" className={`ml-auto capitalize ${diagnosisResult.severity === 'critical' ? 'border-red-500 text-red-500' :
                                                                            diagnosisResult.severity === 'warning' ? 'border-yellow-500 text-yellow-500' :
                                                                                'border-blue-500 text-blue-500'
                                                                            }`}>
                                                                            {diagnosisResult.severity}
                                                                        </Badge>
                                                                    </div>

                                                                    <div className="space-y-4 relative z-10">
                                                                        <div>
                                                                            <h4 className="text-sm font-bold text-red-400/80 mb-1 uppercase tracking-wider">What went wrong</h4>
                                                                            <p className="text-foreground">{diagnosisResult.diagnosis}</p>
                                                                        </div>
                                                                        <div>
                                                                            <h4 className="text-sm font-bold text-red-400/80 mb-1 uppercase tracking-wider">Why it happened</h4>
                                                                            <p className="text-foreground/80 text-sm leading-relaxed">{diagnosisResult.rootCause}</p>
                                                                        </div>
                                                                        <div>
                                                                            <h4 className="text-sm font-bold text-red-400/80 mb-1 uppercase tracking-wider">How to fix it</h4>
                                                                            <p className="text-foreground/80 text-sm leading-relaxed">{diagnosisResult.fix}</p>
                                                                        </div>
                                                                    </div>

                                                                    {diagnosisResult.fixedCode && (
                                                                        <div className="relative z-10 mt-6 rounded-lg border border-red-500/20 bg-black/40 overflow-hidden">
                                                                            <div className="flex items-center justify-between px-4 py-2 border-b border-red-500/20 bg-red-500/10">
                                                                                <span className="text-[10px] font-bold tracking-wider text-red-300 uppercase">Suggested Code Fix</span>
                                                                                <button
                                                                                    className="text-[10px] flex items-center space-x-1 text-red-400 hover:text-red-300 transition-colors"
                                                                                    onClick={(e) => {
                                                                                        navigator.clipboard.writeText(diagnosisResult.fixedCode);
                                                                                        const btn = e.currentTarget;
                                                                                        const originalText = btn.innerHTML;
                                                                                        btn.innerHTML = '<span class="text-green-400">Copied!</span>';
                                                                                        setTimeout(() => btn.innerHTML = originalText, 2000);
                                                                                    }}
                                                                                >
                                                                                    <Copy className="w-3 h-3" />
                                                                                    <span>Copy Fix</span>
                                                                                </button>
                                                                            </div>
                                                                            <div className="p-4 overflow-x-auto text-[12px] font-mono text-red-200">
                                                                                <pre><code>{diagnosisResult.fixedCode}</code></pre>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                </div>
                            </div>

                            {/* AI CHAT PANEL */}
                            <div className="w-96 border-l border-border bg-card/30 flex flex-col">
                                <div className="p-4 border-b border-border bg-card/80 backdrop-blur font-medium flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Bot className="w-5 h-5 text-primary" />
                                        <span>AI Assistant</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {messages.filter(m => m.role !== 'system').length === 0 && (
                                        <div className="text-center text-sm text-muted-foreground p-4">
                                            Ask me to write Python code, explain auth, or generate a cURL command for this endpoint!
                                        </div>
                                    )}
                                    {messages.filter(m => m.role !== 'system').map((m, idx) => (
                                        <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div className={`px-4 py-3 rounded-2xl max-w-[90%] break-words ${m.role === 'user'
                                                ? 'bg-primary text-primary-foreground rounded-tr-sm text-[13px] whitespace-pre-wrap'
                                                : 'bg-accent border border-white/5 rounded-tl-sm text-accent-foreground shadow-sm w-full'
                                                }`}>
                                                {m.role === 'user' ? m.content : <MessageContent content={m.content} theme={theme} />}
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex items-start">
                                            <div className="text-sm px-4 py-2.5 rounded-2xl bg-accent border border-white/5 rounded-tl-sm text-muted-foreground flex space-x-1">
                                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
                                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-75"></span>
                                                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-150"></span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-border bg-card/50">
                                    <div className="relative">
                                        <Textarea
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage(chatInput);
                                                }
                                            }}
                                            placeholder="Ask the AI for code..."
                                            className="resize-none pr-12 min-h-0 h-[60px] py-3 glassmorphism"
                                        />
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-primary"
                                            onClick={() => handleSendMessage(chatInput)}
                                        >
                                            <Send className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <div className="flex gap-2 mt-2 overflow-x-auto pb-1 pb-scroll">
                                        {["Generate Python Code", "Generate cURL", "Explain Endpoint"].map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                onClick={() => handleSendMessage(suggestion)}
                                                className="text-[10px] whitespace-nowrap bg-white/5 hover:bg-primary/20 hover:text-primary transition-colors border border-white/10 px-2.5 py-1 rounded-full"
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </main>
            </div >
        </div >
    );
}
