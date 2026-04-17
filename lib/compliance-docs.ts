import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPLIANCE_DOCS_DIR = join(process.cwd(), "docs", "compliance");

export function readComplianceDoc(filename: string) {
  return readFileSync(join(COMPLIANCE_DOCS_DIR, filename), "utf8");
}
