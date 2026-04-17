# Implementation Assumptions for Wuwu Advisor

This document captures assumptions and uncertainties about the current implementation of Wuwu Advisor.  It is intended to be transparent and help align engineering and legal teams.

## Confirmed current behaviour

- **Launch model:** Wuwu Advisor has a free tier and a paid **Pro** subscription purchased via Stripe web checkout.
- **Core surfaces:** Users can access daily insights (*Today*), a persistent *Birth Blueprint*, future-oriented *Forecast* readings and ask questions via *Ask*.
- **Birth data collection:** Users may provide date, time and place of birth to generate personalised charts; this is optional and can be removed.
- **Data export:** Users can download their first‑party data (birth profile, prompts, outputs) via an export feature.
- **Deletion flow:** Users can request deletion through the app, but removal is processed manually by the team (no automated pipeline yet).
- **First‑party instrumentation:** We collect minimal usage metrics in our own infrastructure; no external analytics or advertising cookies are implemented at launch.
- **Payment integration:** Stripe processes Pro subscription payments.  Webhook reliability improvements are ongoing.
- **Product positioning:** The app offers reflective guidance and does not provide deterministic or professional advice.  Disclaimers are present in the UI.

## Requires product confirmation

- **Authentication vendor:** The exact auth provider (Firebase Auth, AWS Cognito, etc.) needs final confirmation to update subprocessors and DPAs accordingly.
- **Support tooling:** Currently, user support is handled via email.  If a dedicated ticketing or help‑desk platform (e.g., Zendesk, Intercom) is introduced, this will need to be added to the subprocessor list.
- **EU representative details:** A representative for GDPR Article 27 compliance is required【56169070521854†L1315-L1323】, but name and address remain to be confirmed.
- **Mailing list:** Marketing emails are not yet active.  When the mailing list launches, a provider like Mailchimp will require opt‑in consent and contractual safeguards.
- **Data deletion automation:** A backlog item exists to build automated deletion pipelines.  Until completed, manual deletion may result in slight delays.

## Requires legal review

- **LLM data usage:** Contracts with LLM providers (OpenAI, Anthropic) should be reviewed to ensure they include Standard Contractual Clauses and prohibit using prompts for training【250188135282283†L191-L233】.  A transfer impact assessment may be required for US processing.
- **Choice of law & jurisdiction:** Terms of Service currently select Hong Kong law.  Legal counsel should verify whether this is appropriate for EU consumers and whether mandatory consumer protection laws take precedence.
- **Article 22 profiling risk:** While Wuwu Advisor offers entertainment-oriented astrology, new features that make decisions on users’ behalf could trigger stricter profiling rules【594987952245840†L59-L68】.  Legal counsel should review any expansion into high‑impact domains.
- **EU representative mandate:** The mandate for the EU representative must explicitly authorise them to act on our behalf and be documented as required by the EDPB【56169070521854†L1315-L1323】.