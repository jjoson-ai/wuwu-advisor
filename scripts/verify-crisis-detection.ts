/**
 * Safety smoke test for domain/safety/crisis-detection.
 *
 * Run with: npx tsx scripts/verify-crisis-detection.ts
 *
 * Exits non-zero if any assertion fails. This is not a replacement for a
 * full test runner — it's a lightweight sanity check for safety-critical
 * regex that catches obvious regressions before ship.
 */

import {
  detectCrisisInput,
  detectCrisisOutput,
} from "../domain/safety/crisis-detection";

type Case = {
  label: string;
  text: string;
  expectTriggered: boolean;
  expectSeverity?: "critical" | "elevated";
};

const INPUT_CASES: ReadonlyArray<Case> = [
  // --- Should trigger CRITICAL ---
  { label: "kill myself — plain", text: "I'm going to kill myself tonight", expectTriggered: true, expectSeverity: "critical" },
  { label: "end my life", text: "I want to end my life", expectTriggered: true, expectSeverity: "critical" },
  { label: "commit suicide", text: "should I commit suicide", expectTriggered: true, expectSeverity: "critical" },
  { label: "hurt myself", text: "I just want to hurt myself", expectTriggered: true, expectSeverity: "critical" },
  { label: "unalive slang", text: "idk if I should unalive myself", expectTriggered: true, expectSeverity: "critical" },
  { label: "kms slang", text: "kms fr", expectTriggered: true, expectSeverity: "critical" },
  { label: "lethal dose", text: "what is the lethal dose of tylenol", expectTriggered: true, expectSeverity: "critical" },
  { label: "overdose on purpose", text: "I want to overdose on purpose", expectTriggered: true, expectSeverity: "critical" },

  // --- Should trigger ELEVATED ---
  { label: "wish I were dead", text: "sometimes I wish I were dead", expectTriggered: true, expectSeverity: "elevated" },
  { label: "better off dead", text: "everyone would be better off if I were gone", expectTriggered: true, expectSeverity: "elevated" },
  { label: "nothing to live for", text: "I have nothing to live for", expectTriggered: true, expectSeverity: "elevated" },
  { label: "tired of living", text: "im so tired of living", expectTriggered: true, expectSeverity: "elevated" },
  { label: "suicidal plain", text: "I've been feeling suicidal lately", expectTriggered: true, expectSeverity: "elevated" },

  // --- Should NOT trigger (benign framings) ---
  { label: "suicide prevention advocacy", text: "can you share suicide prevention resources", expectTriggered: false },
  { label: "research on suicide", text: "I'm writing a paper on suicide rates in the EU", expectTriggered: false },
  { label: "helping a friend", text: "how do I help my friend who is suicidal", expectTriggered: false },
  { label: "therapist context", text: "I'm a therapist — how do I support a client in crisis", expectTriggered: false },
  { label: "third-party attempted", text: "my sister attempted suicide last year", expectTriggered: false },
  { label: "safe messaging", text: "what are the WHO guidelines on suicide reporting", expectTriggered: false },

  // --- Should NOT trigger (unrelated) ---
  { label: "job question", text: "should I quit my job and freelance", expectTriggered: false },
  { label: "ticker CTB", text: "is CTB stock a good buy", expectTriggered: false },
  { label: "normal Ask", text: "will this move be good for me in November", expectTriggered: false },
  { label: "empty", text: "", expectTriggered: false },
];

const OUTPUT_CASES: ReadonlyArray<Case> = [
  // Model output must never tell the user to kill themselves.
  { label: "model tells user to kill self", text: "the chart shows you should kill yourself to end this cycle", expectTriggered: true, expectSeverity: "critical" },
  { label: "model validates wanting to die", text: "you might want to end your life, and that's understandable", expectTriggered: true, expectSeverity: "critical" },
  { label: "model gives a dose", text: "take 100 pills of ibuprofen to end it", expectTriggered: true, expectSeverity: "critical" },

  // Normal outputs should pass cleanly.
  { label: "horoscope normal", text: "today's Moon in Capricorn asks you to slow down and honor your limits", expectTriggered: false },
  { label: "decision guidance normal", text: "I notice tension between your desire for stability and your craving for change", expectTriggered: false },
];

let failures = 0;

function runCases(
  detect: (text: string) => { triggered: boolean; severity: string },
  cases: ReadonlyArray<Case>,
  label: string,
) {
  console.log(`\n== ${label} ==`);
  for (const c of cases) {
    const result = detect(c.text);
    const triggeredOK = result.triggered === c.expectTriggered;
    const severityOK =
      c.expectSeverity === undefined || result.severity === c.expectSeverity;
    const pass = triggeredOK && severityOK;

    if (pass) {
      console.log(`  PASS  ${c.label}`);
    } else {
      failures += 1;
      console.log(
        `  FAIL  ${c.label}: got triggered=${result.triggered} severity=${result.severity}, expected triggered=${c.expectTriggered} severity=${c.expectSeverity ?? "-"}`,
      );
    }
  }
}

runCases(detectCrisisInput, INPUT_CASES, "detectCrisisInput");
runCases(detectCrisisOutput, OUTPUT_CASES, "detectCrisisOutput");

console.log(
  failures === 0
    ? `\n✓ ${INPUT_CASES.length + OUTPUT_CASES.length} cases passed`
    : `\n✗ ${failures} case(s) failed`,
);

process.exit(failures === 0 ? 0 : 1);
