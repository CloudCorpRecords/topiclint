/**
 * topiclint types.
 *
 * Both tools take a single `topics` argument. The documented
 * accepted forms are a single string, a newline-delimited string,
 * or an array of strings; after normalisation every check works on
 * a flat list of topic strings. Findings keep the four documented
 * levels (fail / warn / pass / info). No network access and no
 * credentials are involved anywhere in this tool.
 */

/** The documented input: one string (single or newline-delimited) or an array of strings. */
export type TopicsInput = string | string[];

/** One finding's severity. */
export type FindingLevel = "fail" | "warn" | "pass" | "info";

/** A single lint / naming finding. */
export interface Finding {
  level: FindingLevel;
  /** Machine-readable check code, e.g. "NAMESPACE" or "DUPLICATE_PATH". */
  code: string;
  message: string;
}

/** The parsed parts of one Sparkplug B topic. Fields are absent when the topic is too short to carry them. */
export interface SparkplugParts {
  levels: string[];
  namespace?: string;
  groupId?: string;
  messageType?: string;
  /** Edge node id for node/device messages; host id for STATE messages. */
  edgeNodeId?: string;
  deviceId?: string;
}

/** Lint outcome for one Sparkplug B topic. */
export interface TopicLintResult {
  topic: string;
  parts: SparkplugParts;
  findings: Finding[];
  /** True when no finding is a fail. */
  valid: boolean;
}

/** Full report returned by lint_sparkplug_topic / `topiclint lint`. */
export interface LintReport {
  topicsChecked: number;
  validTopics: number;
  invalidTopics: number;
  summary: string;
  results: TopicLintResult[];
}

/** One naming issue found by check_uns_namespace. */
export interface UnsIssue extends Finding {
  /** The paths the issue is about, when it is tied to specific paths. */
  paths?: string[];
}

/** Full report returned by check_uns_namespace / `topiclint check`. */
export interface UnsReport {
  pathsChecked: number;
  issueCount: number;
  /** One-line summary, as documented for the check. */
  summary: string;
  issues: UnsIssue[];
}
