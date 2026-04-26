import { PricingPlans } from "@/components/pricing-plans";
import { getCurrentUser } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";

export default async function PricingPage() {
  const user = await getCurrentUser();
  const access = user === null ? null : await getServerAccessState(user);
  const isPro =
    access?.accessLevel === "pro" || access?.accessLevel === "internal";

  return (
    <>
      {/* Header — headline already establishes this is the pricing page,
          so the redundant "PRICING" eyebrow has been removed (UX QA 2026-04-26). */}
      <section className="card page-hero" style={{ padding: "2rem 2rem 1.75rem" }}>
        <h1 className="page-title" style={{ fontSize: "clamp(1.85rem, 4vw, 2.8rem)" }}>
          Free to start.
          <br />
          Pro for the full picture.
        </h1>
        <p className="page-subtitle">
          Everything in Wuwu Advisor is built around your personal chart. Free
          gives you the daily read. Pro unlocks the full depth of every feature.
        </p>
      </section>

      {/* Toggle + plan cards (client component for interactive billing toggle) */}
      <PricingPlans isPro={isPro} isLoggedIn={user !== null} />

      {/* FAQ / note */}
      <section className="card stack card-muted" style={{ padding: "1.5rem 1.75rem" }}>
        <p className="card-eyebrow">Good to know</p>
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {[
            {
              q: "What's included in the free plan?",
              a: "You get a full daily briefing, a Blueprint overview, a 30-day forecast snapshot, and 2 Ask questions per day. No time limit — free stays free.",
            },
            {
              q: "What does Pro unlock?",
              a: "Full Blueprint depth across all sections, the complete 30-day Forecast with supporting detail, unlimited Ask questions with follow-ups, and Blueprint context wired into every generation so outputs are more personal.",
            },
            {
              q: "Is there a trial?",
              a: "Pro comes with a 7-day free trial — no charge until the trial ends, cancel any time before then. The free plan is also fully functional with no expiry, so you can try the core tools before committing.",
            },
          ].map(({ q, a }) => (
            <div key={q} style={{ display: "grid", gap: "0.3rem" }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.92rem" }}>{q}</p>
              <p
                className="muted"
                style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.62 }}
              >
                {a}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
