import type { Metadata } from "next";

import { ComplianceDocCard } from "@/components/compliance-doc-card";
import { readComplianceDoc } from "@/lib/compliance-docs";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
  return (
    <div className="stack">
      <ComplianceDocCard
        body={readComplianceDoc("terms-of-service.md")}
        title="Terms of Service"
      />
      <ComplianceDocCard
        body={readComplianceDoc("billing-subscription-disclosure.md")}
        title="Pro Subscription & Billing Disclosure"
      />
    </div>
  );
}
