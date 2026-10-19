#!/usr/bin/env node
// Tiny repository-owned MCP stdio fixture for the desktop release gate.
// It implements only initialize, tools/list, and tools/call; no network,
// package manager, user profile, or third-party server code is involved.

import { createInterface } from 'node:readline'

const serverId = process.argv[2]
const toolsByServer = {
  'free-search': [{
    name: 'engines',
    description: 'Return deterministic local search-engine metadata.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  }],
}

const tools = toolsByServer[serverId]
if (tools === undefined) {
  process.stderr.write(`unknown release smoke MCP fixture: ${String(serverId)}\n`)
  process.exitCode = 2
} else {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  input.on('line', (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      process.stderr.write('invalid JSON-RPC request from MCP client\n')
      return
    }
    if (typeof message?.method !== 'string' || !Object.hasOwn(message, 'id')) return

    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: `freecode-${serverId}-fixture`, version: '1.0.0' },
        },
      })
      return
    }
    if (message.method === 'ping') {
      send({ jsonrpc: '2.0', id: message.id, result: {} })
      return
    }
    if (message.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools } })
      return
    }
    if (message.method === 'tools/call') {
      const tool = tools.find((candidate) => candidate.name === message.params?.name)
      if (tool === undefined) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32602, message: 'unknown fixture tool' },
        })
        return
      }
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: `${serverId}:${tool.name}:ok` }],
          isError: false,
        },
      })
      return
    }
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } })
  })
}
