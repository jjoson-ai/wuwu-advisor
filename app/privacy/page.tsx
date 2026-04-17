import type { Metadata } from "next";

import { ComplianceDocCard } from "@/components/compliance-doc-card";
import { readComplianceDoc } from "@/lib/compliance-docs";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="stack">
      <ComplianceDocCard
        body={readComplianceDoc("privacy-policy.md")}
        title="Privacy Policy"
      />
      <ComplianceDocCard
        body={readComplianceDoc("cookie-tracking-disclosure.md")}
        title="Cookie & Tracking Disclosure"
      />
      <ComplianceDocCard
        body={readComplianceDoc("subprocessors.md")}
        title="Subprocessors"
      />
    </div>
  );
}
