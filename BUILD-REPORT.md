# topiclint — Build Report

MCP Rebuild 1000 (Batch 9). Clean-room rebuild of
dxpert-ai/uns-tools (rank 387, 0★, Tier A), built from the public
spec captured in `specs-batch9/unstools.md` and recorded in
`harness/fixtures/uns-tools-tools-original.json`. That fixture is
docs-derived: the README enumerates exactly 3 tools; 2 are fully
specified and built, and the third is a labelled omission (below).
No original server was probed and no original code was read.
Parity proves the rebuild matches this program's defined spec,
labelled docs-derived core subset (2 of 3 tools). Local build
only — nothing pushed or published.

Identity: repo `topiclint`, npm `@reneturcios/topiclint`,
MCP name `io.github.CloudCorpRecords/topiclint`, version `0.1.0`,
bin `topiclint` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `topiclint: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Sparkplug B topic linting and UNS
  naming checks for MQTT topic paths." = **69 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/topiclint:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/topiclint"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (`lint`, `check`, `mcp`,
  `--version`; exit 2 usage / 1 runtime error), `src/mcp.ts`,
  `src/types.ts`, `src/topiclint.ts` (core logic, `VERSION = "0.1.0"`)
- `test/topiclint.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to topiclint)

## Tools implemented (2 of 3; 1 labelled omission)

`lint_sparkplug_topic`, `check_uns_namespace` — each takes the
single required `topics` argument, recorded as
`anyOf: [string, array<string>]` with `required: ["topics"]`. For
`lint_sparkplug_topic` the README documents the accepted forms
verbatim ("a single string, a newline-delimited string, or an
array"); `check_uns_namespace` mirrors the same forms — an
inference marked as such in the spec and the fixture `_source`.

**Labelled omission:** `run_readiness_diagnostic` is NOT built.
Its documented input is a 16-answer self-reported intake whose 16
field names/types are not published anywhere in the README, so its
schema cannot be built faithfully; per the spec it is omitted by
name rather than invented. It is absent from the fixture, the MCP
tool list, and the CLI.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server`
  (`sdk/server/index.js` + `StdioServerTransport`) with explicit
  inputSchema literals — both tools serve exactly the fixture
  schema — per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys absent from the defined spec. Zod
  (a string-or-string-array union) still validates every
  `tools/call`.
- Both checks are pure and local: no broker connection, no network
  access, no credentials are read anywhere (the spec's only env
  var, `DXPERT_API_BASE`, belongs solely to the omitted tool).
- Sparkplug grammar (documented local interpretation of the
  documented checks): topic =
  `spBv1.0/<group_id>/<message_type>/<edge_node_id>[/<device_id>]`;
  message types are the eight documented types plus `STATE`;
  node messages and `STATE` carry exactly 4 levels, device
  messages exactly 5. The legacy Sparkplug 2.2 STATE form
  (`STATE/<host_id>`) fails with its own `LEGACY_STATE_FORM` code.
  Publish-side wildcards and empty levels fail. Identifier levels
  (group/node/device) fail on whitespace and warn on characters
  outside `[A-Za-z0-9_-]`. Each result carries the parsed parts
  plus ordered findings; a topic is valid iff it has no `fail`
  finding (a lone warning still passes).
- UNS checks (documented): duplicate paths, sibling
  case-collisions (same parent, leaf equal ignoring case but not
  identical), empty levels, whitespace in segments, and stray
  wildcards fail; inconsistent hierarchy depth and mixed casing
  styles warn. Casing style per segment is one of lower, upper,
  snake_case, kebab-case, PascalCase, camelCase, other (segments
  without letters carry no style). The report opens with the
  documented summary line, then per-issue findings.
- Input normalisation: a string is split on newlines, blank lines
  are dropped, each topic is trimmed; array elements may
  themselves be newline-delimited. Non-string input/elements and
  empty results are errors, surfaced as MCP `isError` results and
  CLI exit 1 (usage-shape errors in the CLI exit 2 before any
  check runs; there is no credential check to precede).
- CLI report semantics: a report containing findings is a
  successful run (exit 0) — findings are the output, not an error.

## Verification (foreground, exact outputs)

### 1. Typecheck and build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ npm run build   # tsc -> dist/, including dist/cli.js
exit=0
```

### 2. Tests
```
$ npm test   # tsx --test test/*.test.ts
ℹ tests 27
ℹ pass 27
ℹ fail 0
```
Covers: input normalisation (single string, newline-delimited,
array, newline-in-array; rejection of empty input, non-string
elements, non-string input); lint passes for node, device, and
STATE topics with parsed parts asserted; failures for wrong
namespace, unknown message type, node-with-device-level and
device-missing-level counts, the legacy STATE form, wildcards,
empty levels, and identifier whitespace, plus warn-only unsafe
identifier characters leaving the topic valid; batch counts and
summary text; casing-style classification for all six styles;
UNS passes for a consistent set; failures for duplicates, sibling
case-collisions (with both paths named), whitespace, empty levels,
and wildcards; warnings for depth inconsistency and mixed casing;
and the negative case that same-named leaves under different
parents are not a collision.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); no args and unknown command print
Usage and exit 2; `lint` with no topics exits 2. `lint` on
`spBv1.0/Plant1/NBIRTH/Edge1` + `STATE/Host1` printed 1 valid /
1 invalid (legacy form) with the documented summary. `check` on
`plant/Line1`, `plant/line1`, `a/b` printed the sibling
CASE_COLLISION failure plus the MIXED_CASING warning. MCP
`initialize` over stdio →
`serverInfo: {"name":"topiclint","version":"0.1.0"}`;
`tools/call` for both tools returned the expected reports, and a
call with `topics: 42` returned an `isError` zod validation
result. No network was used and no live service exists to claim.

### 4. Parity (harness)
```
$ python3 ~/workspace/mcp-rebuild-100/harness/parity.py \
    --original ~/workspace/mcp-rebuild-100/harness/fixtures/uns-tools-tools-original.json \
    --rebuild "stdio:node <abs path>/builds/topiclint/dist/cli.js mcp" \
    --out ~/workspace/mcp-rebuild-100/builds/topiclint/parity-out
verdict=PASS parity_pct=100.0 original_tools=2 rebuild_tools=2 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 2/2.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`, no `dist`),
offline `npm install --package-lock-only --ignore-scripts
--offline`, verified after generation — parses as JSON, top-level
`name` is `@reneturcios/topiclint`, version `0.1.0`,
`lockfileVersion` 3, **128 package entries** — then only the
lockfile was copied back. Local `node_modules` is a symlink to the
sibling burnmeter tree, used only for the local build/test; it is
gitignored and not part of the lockfile generation.

## Gaps / honest notes

- Docs-derived spec: the README documents the two built tools'
  checks and input forms but no output schema and no JSON wire
  schema, so parity proves the rebuild matches this program's
  defined spec (tool names + the recorded `topics` union schema),
  not a hand-probed original. The report shapes, finding codes,
  and severity assignments (which documented checks fail vs warn)
  are this rebuild's documented local interpretations, recorded
  here and in the fixture `_source`.
- `run_readiness_diagnostic` omission is deliberate and labelled:
  its 16 intake fields are unpublished. If they are ever
  published, the tool can be added faithfully; nothing about it
  (endpoint, header, scoring) was implemented speculatively.
- `check_uns_namespace`'s input forms mirror the sibling tool's —
  the only forms the README documents for a `topics` argument —
  marked as an inference in the spec.
- No live broker, network call, or original-server probe was
  performed or claimed; behaviour is proven on hand-traced local
  cases only.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
