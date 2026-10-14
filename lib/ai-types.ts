export const TOOL_SCOPES = ["read", "photos", "sizes", "write"] as const;
export type ToolScope = typeof TOOL_SCOPES[number];
export type ModelProvider = "openai" | "anthropic";
export type ModelSettings = { provider: ModelProvider; baseUrl: string; model: string; hasKey: boolean; scopes: ToolScope[] };
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AiEvent = { type: "tool"; name: string; arguments: Record<string, unknown> } | { type: "tool_result"; name: string; isError: boolean; imageCount: number } | { type: "answer"; text: string } | { type: "error"; message: string };
export type McpConnection = { id: string; name: string; collectionId: string; scopes: ToolScope[]; createdAt: string };
export type ToolActivity = { id: string; source: string; tool: string; collectionId: string; ok: boolean; createdAt: string };
