/**
 * topiclint core: offline Sparkplug B topic linting and Unified
 * Namespace (UNS) naming checks for MQTT topic paths.
 *
 *   lint_sparkplug_topic  validate topic strings against the
 *                         Sparkplug B topic grammar (Sparkplug 3.0)
 *   check_uns_namespace   check a set of UNS topic paths for
 *                         naming consistency
 *
 * Both checks are pure and local: no broker connection, no network
 * access, no credentials. The lint validates grammar only — it does
 * not decode payloads or verify that a device exists. The naming
 * check judges consistency only — it does not know your plant and
 * does not validate Sparkplug grammar.
 *
 * Input handling (documented): `topics` accepts a single string, a
 * newline-delimited string, or an array of strings. A string is
 * split on newlines; blank lines are dropped; surrounding whitespace
 * on each resulting topic is trimmed for splitting purposes only —
 * the UNS check still reports whitespace it finds inside segments
 * of array-supplied paths verbatim.
 *
 * Sparkplug B grammar used by the lint (documented local
 * interpretation of the documented checks):
 *   spBv1.0/<group_id>/<message_type>/<edge_node_id>[/<device_id>]
 * - The first level must be exactly "spBv1.0".
 * - Message types: NBIRTH, NDEATH, DBIRTH, DDEATH, NDATA, DDATA,
 *   NCMD, DCMD, plus STATE.
 * - Node messages (NBIRTH, NDEATH, NDATA, NCMD) and STATE carry
 *   exactly 4 levels; device messages (DBIRTH, DDEATH, DDATA,
 *   DCMD) carry exactly 5.
 * - The legacy Sparkplug 2.2 STATE form ("STATE/<host_id>", with no
 *   spBv1.0 namespace) is reported as its own failure.
 * - Publish-side MQTT wildcards ("+" or "#" anywhere in a level)
 *   fail; so does any empty level.
 * - Identifier levels (group, node, device, host) fail on
 *   whitespace and warn on characters outside [A-Za-z0-9_-], which
 *   break downstream consumers that split, quote, or map topics.
 *
 * UNS checks (documented): inconsistent hierarchy depth and mixed
 * casing styles are warnings; whitespace in segments, duplicate
 * paths, case-collisions between siblings, empty levels, and stray
 * MQTT wildcards are failures. Casing style of a segment is one of
 * lower, upper, snake_case, kebab-case, PascalCase, camelCase, or
 * other (segments without letters carry no style).
 */
import type {
  Finding,
  LintReport,
  SparkplugParts,
  TopicLintResult,
  TopicsInput,
  UnsIssue,
  UnsReport,
} from "./types.js";

export const VERSION = "0.1.0";

export const SPARKPLUG_NAMESPACE = "spBv1.0";

export const MESSAGE_TYPES = [
  "NBIRTH",
  "NDEATH",
  "DBIRTH",
  "DDEATH",
  "NDATA",
  "DDATA",
  "NCMD",
  "DCMD",
  "STATE",
] as const;

const NODE_TYPES = new Set(["NBIRTH", "NDEATH", "NDATA", "NCMD"]);
const DEVICE_TYPES = new Set(["DBIRTH", "DDEATH", "DDATA", "DCMD"]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;

/**
 * Normalise the documented `topics` forms into a flat list.
 * Throws on a non-string/non-array input, a non-string array
 * element, or an input that yields no topics at all.
 */
export function normalizeTopics(input: TopicsInput): string[] {
  let raw: string[];
  if (typeof input === "string") {
    raw = input.split(/\r?\n/);
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item !== "string") {
        throw new Error("topics array must contain only strings");
      }
    }
    raw = input.flatMap((item) => item.split(/\r?\n/));
  } else {
    throw new Error("topics must be a string or an array of strings");
  }
  const topics = raw.map((t) => t.trim()).filter((t) => t.length > 0);
  if (topics.length === 0) {
    throw new Error("topics must contain at least one topic");
  }
  return topics;
}

function finding(level: Finding["level"], code: string, message: string): Finding {
  return { level, code, message };
}

/** Lint one Sparkplug B topic string; findings are in check order. */
export function lintOneTopic(topic: string): TopicLintResult {
  const findings: Finding[] = [];
  const levels = topic.split("/");
  const parts: SparkplugParts = { levels };

  if (topic.trim().length === 0) {
    findings.push(finding("fail", "EMPTY_TOPIC", "Topic is empty."));
    return { topic, parts, findings, valid: false };
  }

  // Legacy Sparkplug 2.2 STATE form: "STATE/<host_id>".
  if (levels[0] === "STATE") {
    findings.push(
      finding(
        "fail",
        "LEGACY_STATE_FORM",
        `Topic "${topic}" uses the legacy Sparkplug 2.2 STATE form; ` +
          `Sparkplug B STATE topics are spBv1.0/<group_id>/STATE/<host_id>.`,
      ),
    );
    return { topic, parts, findings, valid: false };
  }

  if (levels.some((l) => l.length === 0)) {
    findings.push(
      finding("fail", "EMPTY_LEVEL", `Topic "${topic}" contains an empty level.`),
    );
  }

  if (levels.some((l) => l.includes("+") || l.includes("#"))) {
    findings.push(
      finding(
        "fail",
        "WILDCARD",
        `Topic "${topic}" contains an MQTT wildcard (+ or #); wildcards are subscribe-side only and must not be published to.`,
      ),
    );
  }

  parts.namespace = levels[0];
  if (levels[0] !== SPARKPLUG_NAMESPACE) {
    findings.push(
      finding(
        "fail",
        "NAMESPACE",
        `Topic "${topic}" does not start with the spBv1.0 namespace level (found "${levels[0]}").`,
      ),
    );
  }

  if (levels.length >= 2) parts.groupId = levels[1];
  if (levels.length >= 3) parts.messageType = levels[2];
  if (levels.length >= 4) parts.edgeNodeId = levels[3];
  if (levels.length >= 5) parts.deviceId = levels[4];

  const messageType = levels[2];
  if (levels.length < 3 || messageType === undefined || messageType === "") {
    findings.push(
      finding(
        "fail",
        "LEVEL_COUNT",
        `Topic "${topic}" has ${levels.length} level(s); a Sparkplug B topic needs at least namespace, group id, and message type.`,
      ),
    );
  } else if (!MESSAGE_TYPES.includes(messageType as (typeof MESSAGE_TYPES)[number])) {
    findings.push(
      finding(
        "fail",
        "MESSAGE_TYPE",
        `Topic "${topic}" has unknown message type "${messageType}"; expected one of ${MESSAGE_TYPES.join(", ")}.`,
      ),
    );
  } else {
    const expected = DEVICE_TYPES.has(messageType) ? 5 : 4;
    const kind = DEVICE_TYPES.has(messageType)
      ? "device"
      : messageType === "STATE"
        ? "STATE"
        : "node";
    if (levels.length !== expected) {
      findings.push(
        finding(
          "fail",
          "LEVEL_COUNT",
          `Topic "${topic}" is a ${kind} message (${messageType}) and must have exactly ${expected} levels; found ${levels.length}.`,
        ),
      );
    }
  }

  // Identifier characters on group / node / device / host levels.
  const identifierLevels: Array<[string, string]> = [
    ["group id", levels[1]],
    ["edge node id", levels[3]],
    ["device id", levels[4]],
  ];
  for (const [label, value] of identifierLevels) {
    if (value === undefined || value === "") continue;
    if (/\s/.test(value)) {
      findings.push(
        finding(
          "fail",
          "IDENTIFIER_WHITESPACE",
          `The ${label} "${value}" in topic "${topic}" contains whitespace, which breaks downstream consumers.`,
        ),
      );
    } else if (!SAFE_IDENTIFIER.test(value)) {
      findings.push(
        finding(
          "warn",
          "IDENTIFIER_CHARS",
          `The ${label} "${value}" in topic "${topic}" contains characters outside [A-Za-z0-9_-], which can break downstream consumers.`,
        ),
      );
    }
  }

  if (findings.length === 0) {
    findings.push(
      finding("pass", "OK", `Topic "${topic}" conforms to the Sparkplug B topic grammar.`),
    );
  }
  return { topic, parts, findings, valid: !findings.some((f) => f.level === "fail") };
}

/** Lint every topic in the documented `topics` input. */
export function lintSparkplugTopic(input: TopicsInput): LintReport {
  const topics = normalizeTopics(input);
  const results = topics.map(lintOneTopic);
  const validTopics = results.filter((r) => r.valid).length;
  const invalidTopics = results.length - validTopics;
  const summary =
    invalidTopics === 0
      ? `All ${results.length} topic(s) conform to the Sparkplug B topic grammar.`
      : `${invalidTopics} of ${results.length} topic(s) failed Sparkplug B lint; ${validTopics} passed.`;
  return { topicsChecked: results.length, validTopics, invalidTopics, summary, results };
}

/** Classify the casing style of one path segment; undefined when it has no letters. */
export function segmentStyle(segment: string): string | undefined {
  if (!/[A-Za-z]/.test(segment)) return undefined;
  if (segment.includes("_")) {
    if (segment === segment.toLowerCase()) return "snake_case";
    if (segment === segment.toUpperCase()) return "upper";
    return "other";
  }
  if (segment.includes("-")) {
    return segment === segment.toLowerCase() ? "kebab-case" : "other";
  }
  if (segment === segment.toLowerCase()) return "lower";
  if (segment === segment.toUpperCase()) return "upper";
  if (/^[A-Z][A-Za-z0-9]*$/.test(segment)) return "PascalCase";
  if (/^[a-z][A-Za-z0-9]*$/.test(segment) && /[A-Z]/.test(segment)) return "camelCase";
  return "other";
}

/** Check a set of UNS topic paths for naming consistency. */
export function checkUnsNamespace(input: TopicsInput): UnsReport {
  const paths = normalizeTopics(input);
  const issues: UnsIssue[] = [];
  const segmentsOf = paths.map((p) => p.split("/"));

  // Per-path structural checks.
  paths.forEach((path, i) => {
    const segments = segmentsOf[i];
    if (segments.some((s) => s.length === 0)) {
      issues.push({
        level: "fail",
        code: "EMPTY_LEVEL",
        message: `Path "${path}" contains an empty level.`,
        paths: [path],
      });
    }
    for (const segment of segments) {
      if (segment !== segment.trim() || /\s/.test(segment)) {
        issues.push({
          level: "fail",
          code: "WHITESPACE",
          message: `Segment "${segment}" in path "${path}" contains whitespace.`,
          paths: [path],
        });
        break;
      }
    }
    if (segments.some((s) => s.includes("+") || s.includes("#"))) {
      issues.push({
        level: "fail",
        code: "WILDCARD",
        message: `Path "${path}" contains a stray MQTT wildcard (+ or #).`,
        paths: [path],
      });
    }
  });

  // Duplicate paths (exact).
  const seen = new Map<string, number>();
  for (const path of paths) seen.set(path, (seen.get(path) ?? 0) + 1);
  for (const [path, count] of seen) {
    if (count > 1) {
      issues.push({
        level: "fail",
        code: "DUPLICATE_PATH",
        message: `Path "${path}" appears ${count} times.`,
        paths: [path],
      });
    }
  }

  // Case-collisions between siblings: same parent, leaf equal ignoring case but not identical.
  const siblings = new Map<string, Map<string, string>>();
  paths.forEach((path, i) => {
    const segments = segmentsOf[i];
    const parent = segments.slice(0, -1).join("/");
    const leaf = segments[segments.length - 1];
    let group = siblings.get(parent);
    if (!group) {
      group = new Map();
      siblings.set(parent, group);
    }
    const key = leaf.toLowerCase();
    const existing = group.get(key);
    if (existing !== undefined && existing !== leaf) {
      const siblingPath = parent ? `${parent}/${existing}` : existing;
      issues.push({
        level: "fail",
        code: "CASE_COLLISION",
        message:
          `Sibling segments "${existing}" and "${leaf}" under "${parent || "(root)"}" ` +
          `differ only by case and read as one node but are two.`,
        paths: [siblingPath, path],
      });
    } else {
      group.set(key, leaf);
    }
  });

  // Inconsistent hierarchy depth.
  const depths = new Map<number, number>();
  for (const segments of segmentsOf) depths.set(segments.length, (depths.get(segments.length) ?? 0) + 1);
  if (depths.size > 1) {
    const detail = [...depths.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `${n} path(s) at depth ${d}`)
      .join(", ");
    issues.push({
      level: "warn",
      code: "INCONSISTENT_DEPTH",
      message: `Paths have inconsistent hierarchy depths: ${detail}.`,
    });
  }

  // Mixed casing styles.
  const styles = new Set<string>();
  for (const segments of segmentsOf) {
    for (const segment of segments) {
      const style = segmentStyle(segment);
      if (style) styles.add(style);
    }
  }
  if (styles.size > 1) {
    issues.push({
      level: "warn",
      code: "MIXED_CASING",
      message: `Paths mix casing styles: ${[...styles].sort().join(", ")}.`,
    });
  }

  if (issues.length === 0) {
    issues.push({
      level: "pass",
      code: "OK",
      message: `All ${paths.length} path(s) are consistently named.`,
    });
  }
  const fails = issues.filter((i) => i.level === "fail").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  const summary =
    fails === 0 && warns === 0
      ? `${paths.length} path(s) checked: no naming issues found.`
      : `${paths.length} path(s) checked: ${fails} failure(s), ${warns} warning(s).`;
  const realIssues = issues.filter((i) => i.code !== "OK");
  return {
    pathsChecked: paths.length,
    issueCount: realIssues.length,
    summary,
    issues,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
