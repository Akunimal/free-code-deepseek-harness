import { z } from 'zod';

/** ContentPart — one message content chunk (text or tool invocation). */
export const ContentPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    toolName: z.string(),
    input: z.record(z.string(), z.unknown()),
    output: z.string().optional(),
    isError: z.boolean().optional(),
  }),
]);
export type ContentPart = z.infer<typeof ContentPartSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(ContentPartSchema)]),
  toolCalls: z.array(z.object({ id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) })).optional(),
  toolResults: z.array(z.object({ id: z.string(), output: z.string(), isError: z.boolean() })).optional(),
  timestamp: z.number().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** InterchangeChat — universal import/export format for chat history. */
export const InterchangeChatSchema = z.object({
  version: z.literal(1),
  sourceAgent: z.string(), // 'opencode' | 'dsh' | 'chatml' | ...
  sourceChatId: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  workspaceRoot: z.string().optional(),
  model: z.object({ provider: z.string(), id: z.string() }).optional(),
  messages: z.array(ChatMessageSchema),
});
export type InterchangeChat = z.infer<typeof InterchangeChatSchema>;

/** ImportableChat — lightweight list entry for the picker UI. */
export const ImportableChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messageCount: z.number(),
  agent: z.string().optional(),
  workspaceRoot: z.string().optional(),
});
export type ImportableChat = z.infer<typeof ImportableChatSchema>;