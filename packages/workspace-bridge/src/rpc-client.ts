import { randomUUID } from 'node:crypto';
import { InterchangeChat } from '@freecode/shared-types';

/**
 * RpcClient — minimal wire client for the DSH host RPC protocol.
 * Wire shape (verified against packages/host/apiproxy/src/api/rpc.ts):
 *   POST /api/<method>  body { type:'client-request', rpcId, method, payload }
 *   → { type:'server-response', rpcId, result: { ok:true, value } | { ok:false, error } }
 */

export interface RpcResultError {
  code: string;
  message?: string;
}

export interface RpcResult<T> {
  ok: true;
  value: T;
}

export interface RpcError {
  ok: false;
  error: RpcResultError;
}

interface ServerResponse<T = unknown> {
  type: 'server-response';
  rpcId: string;
  result: RpcResult<T> | RpcError;
}

export class HarnessRpcClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async call<T>(method: string, payload: unknown): Promise<T> {
    const rpcId = `freecode-${randomUUID()}`;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`rpc ${method} transport failed: ${String(err)}`);
    }
    if (!res.ok) {
      throw new Error(`rpc ${method} http ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as ServerResponse<T>;
    if (body.type !== 'server-response') {
      throw new Error(`rpc ${method} unexpected envelope: ${body.type ?? 'unknown'}`);
    }
    if (!body.result.ok) {
      const err = body.result.error;
      throw new Error(`rpc ${method} error ${err.code}${err.message ? `: ${err.message}` : ''}`);
    }
    return body.result.value;
  }

  /** Creates a session; returns the session id. */
  createSession(opts: { workspaceId?: string; cwd?: string; sessionId?: string }): Promise<{ sessionId: string }> {
    return this.call('session.create', {
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      agentPreset: undefined,
    }) as Promise<{ sessionId: string }>;
  }

  /** Sends a user prompt to a session (the "Continue here" handoff). */
  prompt(workspaceId: string | undefined, sessionId: string, content: string, model?: { provider: string; id: string }): Promise<unknown> {
    return this.call('session.prompt', {
      workspaceId,
      sessionId,
      content,
      model: model ? { provider: model.provider, id: model.id } : undefined,
    });
  }
}

/** Builds the initial system message for a continued session. */
export function buildContinueSystemMessage(
  sourceChat: InterchangeChat,
  targetWorkspace: string,
): string {
  const when = new Date(sourceChat.updatedAt).toISOString();
  const history = sourceChat.messages
    .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : `[tool ${p.toolName}]`)).join('\n')}`)
    .join('\n\n');
  return [
    `Continuando una sesión previa (${sourceChat.sourceAgent}, "${sourceChat.title}", actualizada ${when}).`,
    `Carpeta de trabajo: ${targetWorkspace}`,
    `Modelo previo: ${sourceChat.model ? `${sourceChat.model.provider}/${sourceChat.model.id}` : 'desconocido'}`,
    '',
    'Historial de la conversación anterior:',
    '',
    history,
  ].join('\n');
}