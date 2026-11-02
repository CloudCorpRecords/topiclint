import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkUnsNamespace,
  lintOneTopic,
  lintSparkplugTopic,
  normalizeTopics,
  segmentStyle,
} from "../src/topiclint.js";

function codes(findings: Array<{ code: string }>): string[] {
  return findings.map((f) => f.code);
}

describe("normalizeTopics", () => {
  it("accepts a single string", () => {
    assert.deepEqual(normalizeTopics("a/b/c"), ["a/b/c"]);
  });

  it("splits a newline-delimited string and drops blank lines", () => {
    assert.deepEqual(normalizeTopics("a/b\nc/d\n\n"), ["a/b", "c/d"]);
  });

  it("accepts an array, splitting newline-delimited elements too", () => {
    assert.deepEqual(normalizeTopics(["a/b", "c/d\ne/f"]), ["a/b", "c/d", "e/f"]);
  });

  it("rejects empty input, non-string elements, and non-string input", () => {
    assert.throws(() => normalizeTopics(""), /at least one topic/);
    assert.throws(() => normalizeTopics("  \n "), /at least one topic/);
    assert.throws(() => normalizeTopics([]), /at least one topic/);
    assert.throws(
      () => normalizeTopics(["ok", 42] as unknown as string[]),
      /only strings/,
    );
    assert.throws(
      () => normalizeTopics(42 as unknown as string),
      /string or an array/,
    );
  });
});

describe("lintSparkplugTopic", () => {
  it("passes a well-formed node topic and parses its parts", () => {
    const out = lintOneTopic("spBv1.0/Plant1/NBIRTH/Edge1");
    assert.equal(out.valid, true);
    assert.deepEqual(codes(out.findings), ["OK"]);
    assert.equal(out.parts.namespace, "spBv1.0");
    assert.equal(out.parts.groupId, "Plant1");
    assert.equal(out.parts.messageType, "NBIRTH");
    assert.equal(out.parts.edgeNodeId, "Edge1");
    assert.equal(out.parts.deviceId, undefined);
  });

  it("passes a well-formed device topic with a device id", () => {
    const out = lintOneTopic("spBv1.0/Plant1/DBIRTH/Edge1/Dev1");
    assert.equal(out.valid, true);
    assert.equal(out.parts.deviceId, "Dev1");
  });

  it("passes a Sparkplug B STATE topic", () => {
    const out = lintOneTopic("spBv1.0/Plant1/STATE/Host1");
    assert.equal(out.valid, true);
    assert.equal(out.parts.messageType, "STATE");
  });

  it("fails a topic without the spBv1.0 namespace level", () => {
    const out = lintOneTopic("spBv1.1/Plant1/NBIRTH/Edge1");
    assert.equal(out.valid, false);
    assert.ok(codes(out.findings).includes("NAMESPACE"));
  });

  it("fails an unknown message type", () => {
    const out = lintOneTopic("spBv1.0/Plant1/FOO/Edge1");
    assert.equal(out.valid, false);
    assert.ok(codes(out.findings).includes("MESSAGE_TYPE"));
  });

  it("fails node messages carrying a device level and device messages missing one", () => {
    const node = lintOneTopic("spBv1.0/Plant1/NDATA/Edge1/Dev1");
    assert.equal(node.valid, false);
    assert.ok(codes(node.findings).includes("LEVEL_COUNT"));
    const device = lintOneTopic("spBv1.0/Plant1/DDATA/Edge1");
    assert.equal(device.valid, false);
    assert.ok(codes(device.findings).includes("LEVEL_COUNT"));
  });

  it("fails the legacy Sparkplug 2.2 STATE form", () => {
    const out = lintOneTopic("STATE/Host1");
    assert.equal(out.valid, false);
    assert.deepEqual(codes(out.findings), ["LEGACY_STATE_FORM"]);
  });

  it("fails publish-side MQTT wildcards", () => {
    const out = lintOneTopic("spBv1.0/Plant1/NCMD/+");
    assert.equal(out.valid, false);
    assert.ok(codes(out.findings).includes("WILDCARD"));
  });

  it("fails empty levels", () => {
    const out = lintOneTopic("spBv1.0//NBIRTH/Edge1");
    assert.equal(out.valid, false);
    assert.ok(codes(out.findings).includes("EMPTY_LEVEL"));
  });

  it("fails whitespace in an identifier and only warns on other unsafe characters", () => {
    const ws = lintOneTopic("spBv1.0/My Plant/NBIRTH/Edge1");
    assert.equal(ws.valid, false);
    assert.ok(codes(ws.findings).includes("IDENTIFIER_WHITESPACE"));
    const dot = lintOneTopic("spBv1.0/Plant.1/NBIRTH/Edge1");
    assert.equal(dot.valid, true);
    assert.ok(codes(dot.findings).includes("IDENTIFIER_CHARS"));
    assert.equal(dot.findings[0].level, "warn");
  });

  it("fails a topic too short to carry a message type", () => {
    const out = lintOneTopic("spBv1.0");
    assert.equal(out.valid, false);
    assert.ok(codes(out.findings).includes("LEVEL_COUNT"));
  });

  it("lints a newline-delimited batch and summarises pass/fail counts", () => {
    const out = lintSparkplugTopic("spBv1.0/G/NBIRTH/E\nbad/NBIRTH/E");
    assert.equal(out.topicsChecked, 2);
    assert.equal(out.validTopics, 1);
    assert.equal(out.invalidTopics, 1);
    assert.ok(out.summary.includes("1 of 2"));
  });

  it("accepts the array form identically", () => {
    const out = lintSparkplugTopic(["spBv1.0/G/NDATA/E"]);
    assert.equal(out.topicsChecked, 1);
    assert.equal(out.validTopics, 1);
  });
});

describe("segmentStyle", () => {
  it("classifies the documented casing styles", () => {
    assert.equal(segmentStyle("line"), "lower");
    assert.equal(segmentStyle("LINE"), "upper");
    assert.equal(segmentStyle("line_1"), "snake_case");
    assert.equal(segmentStyle("line-1"), "kebab-case");
    assert.equal(segmentStyle("LineOne"), "PascalCase");
    assert.equal(segmentStyle("lineOne"), "camelCase");
    assert.equal(segmentStyle("123"), undefined);
  });
});

describe("checkUnsNamespace", () => {
  it("passes a consistently named set with a summary line", () => {
    const out = checkUnsNamespace(["enterprise/site1/line1/cell1", "enterprise/site1/line1/cell2"]);
    assert.equal(out.pathsChecked, 2);
    assert.equal(out.issueCount, 0);
    assert.ok(out.summary.includes("no naming issues"));
    assert.deepEqual(codes(out.issues), ["OK"]);
  });

  it("fails duplicate paths", () => {
    const out = checkUnsNamespace(["a/b", "a/b"]);
    assert.ok(codes(out.issues).includes("DUPLICATE_PATH"));
    assert.equal(out.issueCount, 1);
  });

  it("warns on inconsistent hierarchy depth", () => {
    const out = checkUnsNamespace(["a/b/c", "a/b"]);
    assert.deepEqual(codes(out.issues), ["INCONSISTENT_DEPTH"]);
    assert.equal(out.issues[0].level, "warn");
  });

  it("warns on mixed casing styles", () => {
    const out = checkUnsNamespace(["Enterprise/Site", "enterprise/site"]);
    assert.ok(codes(out.issues).includes("MIXED_CASING"));
    assert.ok(!codes(out.issues).includes("CASE_COLLISION"));
  });

  it("fails whitespace inside a segment", () => {
    const out = checkUnsNamespace(["enterprise/site 1/line"]);
    assert.ok(codes(out.issues).includes("WHITESPACE"));
  });

  it("fails case-collisions between siblings under the same parent", () => {
    const out = checkUnsNamespace(["plant/Line1", "plant/line1"]);
    const collision = out.issues.find((i) => i.code === "CASE_COLLISION");
    assert.ok(collision);
    assert.equal(collision.level, "fail");
    assert.deepEqual(collision.paths, ["plant/Line1", "plant/line1"]);
  });

  it("does not call same-named leaves under different parents a collision", () => {
    const out = checkUnsNamespace(["a/Temp", "b/temp"]);
    assert.ok(!codes(out.issues).includes("CASE_COLLISION"));
  });

  it("fails empty levels and stray wildcards", () => {
    const empty = checkUnsNamespace(["a//b"]);
    assert.ok(codes(empty.issues).includes("EMPTY_LEVEL"));
    const wild = checkUnsNamespace(["a/b/#"]);
    assert.ok(codes(wild.issues).includes("WILDCARD"));
  });

  it("accepts the newline-delimited string form", () => {
    const out = checkUnsNamespace("a/b/c\na/b/d");
    assert.equal(out.pathsChecked, 2);
    assert.equal(out.issueCount, 0);
  });
});
