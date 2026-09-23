import { describe, expect, it } from 'vitest'
import type { Db } from '../lib/contacts'
import { MCP_TOOL_NAMES, callMcpTool, mcpToolDefinitions } from './tools'

const db = {} as Db

describe('mcp tools', () => {
  it('exposes find, get, create, update, log, and overdue — and nothing that deletes', () => {
    expect(mcpToolDefinitions().map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES])
    expect(mcpToolDefinitions().some((tool) => /delete|merge/i.test(tool.name))).toBe(false)
  })

  it('rejects an unknown tool and missing ids before writing', async () => {
    expect((await callMcpTool(db, 'user', 'delete_contacts', {})).isError).toBe(true)
    expect((await callMcpTool(db, 'user', 'get_contact', {})).text).toMatch(/id is required/)
    expect((await callMcpTool(db, 'user', 'create_contact', {})).text).toMatch(/Name is required/)
    expect((await callMcpTool(db, 'user', 'log_interaction', {})).text).toMatch(/contact_id is required/)
    expect((await callMcpTool(db, 'user', 'update_contact', { id: 'c1' })).text).toMatch(/which fields/)
  })
})
