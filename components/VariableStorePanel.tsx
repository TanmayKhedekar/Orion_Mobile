"use client";

import React, { useState } from "react";
import { Link2, Plus, Trash2, Edit2, Check, X, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface VariableStorePanelProps {
    variables: Record<string, string>;
    onSaveVariable: (key: string, value: string) => void;
    onDeleteVariable: (key: string) => void;
    isOpen: boolean;
    onToggleOpen: () => void;
}

export const VariableStorePanel: React.FC<VariableStorePanelProps> = ({
    variables,
    onSaveVariable,
    onDeleteVariable,
    isOpen,
    onToggleOpen,
}) => {
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    const keys = Object.keys(variables);

    const handleStartEdit = (key: string) => {
        setEditingKey(key);
        setEditValue(variables[key]);
    };

    const handleSaveEdit = (oldKey: string) => {
        if (editingKey) {
            onSaveVariable(oldKey, editValue);
            setEditingKey(null);
        }
    };

    const handleAddNew = () => {
        if (newKey.trim()) {
            onSaveVariable(newKey.trim(), newValue);
            setNewKey("");
            setNewValue("");
            setIsAdding(false);
        }
    };

    return (
        <div
            className={`border-r border-border bg-card/60 backdrop-blur-md flex flex-col h-full transition-all duration-300 z-10 relative ${isOpen ? "w-full lg:w-80" : "w-14"
                }`}
        >
            {/* Header with Chain Link Icon */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-black/20">
                {isOpen ? (
                    <div className="flex items-center space-x-2">
                        <Link2 className="w-5 h-5 text-cyan-400 animate-pulse" />
                        <h3 className="font-bold text-base tracking-tight text-foreground">Variable Store</h3>
                        <Badge variant="outline" className="text-[10px] border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                            {keys.length}
                        </Badge>
                    </div>
                ) : (
                    <div className="flex flex-col items-center w-full">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleOpen}
                            title="Expand Variable Store"
                            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                        >
                            <Link2 className="w-5 h-5" />
                        </Button>
                    </div>
                )}

                {isOpen && (
                    <div className="flex items-center space-x-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsAdding(!isAdding)}
                            className="h-8 w-8 text-cyan-400 hover:bg-cyan-500/10"
                            title="Add Custom Variable"
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleOpen}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Collapse Panel"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            {isOpen && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Add Custom Variable Form */}
                    {isAdding && (
                        <div className="p-3 border border-cyan-500/30 bg-cyan-500/5 rounded-xl space-y-2 animate-in fade-in">
                            <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">New Variable</div>
                            <Input
                                placeholder="Key (e.g. token)"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                className="h-8 text-xs font-mono glassmorphism"
                            />
                            <Input
                                placeholder="Value"
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                className="h-8 text-xs font-mono glassmorphism"
                            />
                            <div className="flex justify-end space-x-2 pt-1">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setIsAdding(false)}
                                    className="h-7 text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleAddNew}
                                    className="h-7 text-xs bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                                >
                                    Add Variable
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Variable List */}
                    {keys.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground p-6 border border-dashed border-border rounded-xl space-y-2">
                            <Link2 className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                            <p>No variables saved yet.</p>
                            <p className="text-[11px] text-muted-foreground/60">
                                Run requests to auto-extract values or click &quot;+&quot; to add custom session variables.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {keys.map((key) => {
                                const isEditing = editingKey === key;
                                const val = variables[key];

                                return (
                                    <div
                                        key={key}
                                        className="p-3 border border-white/10 bg-black/40 rounded-xl space-y-1.5 transition-all hover:border-cyan-500/30 group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono font-bold text-xs text-cyan-400 truncate max-w-[170px]">
                                                {`{{${key}}}`}
                                            </span>

                                            <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(`{{${key}}}`)}
                                                    className="p-1 text-muted-foreground hover:text-cyan-400 rounded transition-colors"
                                                    title="Copy variable tag"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </button>
                                                {!isEditing ? (
                                                    <button
                                                        onClick={() => handleStartEdit(key)}
                                                        className="p-1 text-muted-foreground hover:text-white rounded transition-colors"
                                                        title="Edit variable"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleSaveEdit(key)}
                                                        className="p-1 text-green-400 hover:text-green-300 rounded transition-colors"
                                                        title="Save edit"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => onDeleteVariable(key)}
                                                    className="p-1 text-muted-foreground hover:text-red-400 rounded transition-colors"
                                                    title="Delete variable"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {isEditing ? (
                                            <Input
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSaveEdit(key);
                                                    if (e.key === "Escape") setEditingKey(null);
                                                }}
                                                className="h-7 text-xs font-mono glassmorphism border-cyan-500/50 mt-1"
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="text-[11px] font-mono text-muted-foreground truncate bg-black/50 p-1.5 rounded border border-white/5">
                                                {val}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
