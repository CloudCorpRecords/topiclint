# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI: `topiclint lint`, `topiclint check`, and `topiclint mcp`.
  Topics/paths are positional arguments; a single argument may be
  a newline-delimited list.
- MCP server (`topiclint mcp`, stdio) with two tools:
  `lint_sparkplug_topic` and `check_uns_namespace`. Each takes the
  single `topics` argument (a string, a newline-delimited string,
  or an array of strings).
- `lint_sparkplug_topic` validates topics against the Sparkplug B
  grammar: the `spBv1.0` namespace, the eight message types plus
  `STATE`, node-vs-device level counts, the legacy Sparkplug 2.2
  `STATE` form, publish-side wildcards, empty levels, and unsafe
  identifier characters. Results carry the parsed topic parts and
  ordered `fail` / `warn` / `pass` / `info` findings.
- `check_uns_namespace` reviews a path set for duplicate paths,
  case-collisions between siblings, empty levels, whitespace in
  segments, stray wildcards, inconsistent hierarchy depth, and
  mixed casing styles, with a summary line plus per-issue findings.
- Fully local and offline: no broker, no network, no credentials.
