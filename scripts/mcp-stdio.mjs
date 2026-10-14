import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Credentials belong in the client's environment, never in stdout or arguments.
const token = process.env.CLOSET_MCP_TOKEN;
if (!token) { console.error('请配置 CLOSET_MCP_TOKEN，并启动 Closet 服务。'); process.exit(1); }
const upstream = new Client({ name: 'closet-stdio', version: '1.0.0' });
const downstream = new Server({ name: 'new-closet', version: '1.0.0' }, { capabilities: { tools: {} } });
downstream.setRequestHandler(ListToolsRequestSchema, () => upstream.listTools());
downstream.setRequestHandler(CallToolRequestSchema, (request, extra) => upstream.callTool(request.params, undefined, { signal: extra.signal }));
let closing = false;
async function close() { if (closing) return; closing = true; await upstream.close(); await downstream.close(); }
downstream.onclose = () => { void close(); };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void close().finally(() => process.exit(0)); });
try {
  await upstream.connect(new StreamableHTTPClientTransport(new URL(process.env.CLOSET_MCP_URL || 'http://127.0.0.1:4320/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + token } } }));
  await downstream.connect(new StdioServerTransport());
} catch { console.error('无法连接 Closet MCP，请检查服务、地址和连接令牌。'); await close(); process.exitCode = 1; }
