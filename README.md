# topiclint

topiclint checks MQTT topic strings before they reach a broker or
a namespace design review. It lints individual topics against the
Sparkplug B topic grammar (Sparkplug 3.0), and it reviews a whole
set of Unified Namespace (UNS) topic paths for naming consistency —
the kind of drift (mixed casing, uneven depth, near-duplicate
siblings) that makes a namespace hard to browse, query, and hand
over. One binary serves a command-line interface and a stdio MCP
server.

Everything is local and offline. There is no broker connection, no
network access, no API key, and no account. The linter validates
grammar only: it does not decode payloads or check that a device
exists. The naming check judges consistency only: it does not know
your plant and will not design a namespace for you.

## Install

```bash
npx @reneturcios/topiclint lint spBv1.0/Plant1/NBIRTH/Edge1
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/topiclint
```

The container defaults to the MCP server (see below); pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
topiclint lint spBv1.0/Plant1/NBIRTH/Edge1 spBv1.0/Plant1/DDATA/Edge1/Dev1
topiclint check enterprise/site1/line1 enterprise/site1/line2

topiclint --version
```

Each topic or path is one argument; a single argument may also be
a newline-delimited list. Both commands print a JSON report. A
report full of findings is still a successful run — findings are
the output, not an error. Exit codes: `0` on success, `1` on a
runtime error, `2` for usage errors.

### What the Sparkplug lint checks

For every topic: the `spBv1.0` namespace level; the message type
(one of `NBIRTH`, `NDEATH`, `DBIRTH`, `DDEATH`, `NDATA`, `DDATA`,
`NCMD`, `DCMD`, plus `STATE`); the level count (node messages and
`STATE` carry exactly four levels, device messages exactly five);
the legacy Sparkplug 2.2 `STATE` form (`STATE/<host_id>` with no
namespace), reported as its own failure; publish-side MQTT
wildcards (`+` / `#`); empty levels; and identifier characters in
the group, node, and device levels — whitespace fails, and
characters outside `[A-Za-z0-9_-]` warn, because both break
downstream consumers that split, quote, or map topics.

Each result carries the parsed topic parts (namespace, group id,
message type, edge node id, device id) plus ordered findings with
levels `fail` / `warn` / `pass` / `info`.

### What the UNS check looks for

Across the whole set: duplicate paths, empty levels, whitespace in
segments, and stray MQTT wildcards all fail. Siblings under the
same parent whose names differ only by case fail as a
case-collision — they read as one node but are two. Inconsistent
hierarchy depth and mixed casing styles (`lower`, `upper`,
`snake_case`, `kebab-case`, `PascalCase`, `camelCase`) warn. The
report opens with a one-line summary, then the per-issue findings.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/topiclint mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "topiclint": {
      "command": "npx",
      "args": ["-y", "@reneturcios/topiclint", "mcp"]
    }
  }
}
```

### Tools

Both tools take a single `topics` argument: a single string, a
newline-delimited string, or an array of topic strings.

| Tool | Input | What it returns |
| --- | --- | --- |
| `lint_sparkplug_topic` | `topics` (string or string array) | Per-topic parsed parts plus ordered findings, with pass/fail counts and a summary. |
| `check_uns_namespace` | `topics` (string or string array) | A summary line plus per-issue findings for the whole path set. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
