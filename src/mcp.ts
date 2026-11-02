/**
 * topiclint MCP server. Tools: lint_sparkplug_topic, check_uns_namespace.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Both tools take the single documented `topics` argument: a
 * string, a newline-delimited string, or an array of strings. Both
 * are local and offline; no credentials are read.
 *
 * Labelled omission: run_readiness_diagnostic is NOT served. Its
 * documented input is a 16-answer intake whose field names are not
 * published anywhere in the source spec, so its schema cannot be
 * built faithfully and it is omitted rather than invented.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { checkUnsNamespace, formatPayload, lintSparkplugTopic, VERSION } from "./topiclint.js";

const TopicsArg = z.object({
  topics: z.union([z.string(), z.array(z.string())]),
});

const TOPICS_SCHEMA = {
  type: "object" as const,
  properties: {
    topics: {
      anyOf: [{ type: "string" as const }, { type: "array" as const, items: { type: "string" as const } }],
      description: "MQTT topic strings to validate against the Sparkplug B topic grammar or check for UNS naming consistency.",
    },
  },
  required: ["topics"],
};

const TOOLS = [
  {
    name: "lint_sparkplug_topic",
    description: "Validate one or more MQTT topic strings against the Sparkplug B topic grammar (Sparkplug 3.0).",
    inputSchema: TOPICS_SCHEMA,
  },
  {
    name: "check_uns_namespace",
    description: "Check a set of UNS (Unified Namespace) topic paths for naming consistency.",
    inputSchema: TOPICS_SCHEMA,
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "topiclint", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "lint_sparkplug_topic") {
      const parsed = TopicsArg.parse(args ?? {});
      out = lintSparkplugTopic(parsed.topics);
    } else if (name === "check_uns_namespace") {
      const parsed = TopicsArg.parse(args ?? {});
      out = checkUnsNamespace(parsed.topics);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
