import { redirect } from "next/navigation";

import { ModelComparisonForm } from "@/components/model-comparison-form";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser } from "@/lib/auth";

export default async function EvalsPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const record = await getOnboardingRecord(user.id);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div className="stack" style={{ gap: "0.35rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Internal QA
          </p>
          <h1 style={{ margin: 0 }}>Model Comparison</h1>
          <p className="muted" style={{ margin: 0 }}>
            Generate one side-by-side comparison document for Daily Briefing or
            Your Birth Blueprint using the current production inputs and prompt
            context.
          </p>
        </div>

        <ModelComparisonForm />
      </section>
    </div>
  );
}
