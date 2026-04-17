# Subprocessors

The table below lists the main subprocessors we rely on to operate Wuwu Advisor.  It reflects our current implementation and will be updated as our vendor relationships evolve.

| Vendor | Purpose | Data categories | Region | Active now | Notes |
|---|---|---|---|---|---|
| **Cloud hosting provider** (e.g., AWS Ireland) | Hosts databases, application servers and storage. | All personal data stored and processed (account, birth profile, prompts, outputs, usage metrics) | EU (primary) | Yes | Data stored in EU data centres.  Backups may occasionally reside in non‑EEA regions; covered by SCCs【250188135282283†L191-L233】. |
| **Authentication provider** (e.g., Firebase Auth or Cognito) | Handles sign‑up and sign‑in, stores hashed passwords and OAuth tokens. | Email address, password hash/OAuth ID | EU (primary) with possible US support | Yes | Actual vendor will be confirmed.  SCCs will be used for any US processing. |
| **OpenAI** | Processes user prompts and context to generate AI responses. | Pseudonymised prompts, limited birth data (time/day/month, city converted to timezone) | US | Yes | Bound by SCCs and contractual obligations to not use data for model training.  Pseudonymisation applied before transfer. |
| **Anthropic** | Alternative or backup LLM provider. | Same as OpenAI | US | Not active at launch | Contract preparation underway.  Will only be used if needed. |
| **Stripe** | Payment processing for Pro subscriptions. | Billing name, email, payment method token, transaction amount | US/EU | Yes | Handles card details; we receive only partial card data.  Covered by Stripe’s DPA and SCCs. |
| **Email & support** (e.g., support@wuwu‑advisor.com) | Receive and respond to user queries. | Email address, message content, account identifiers | EU/US (depending on chosen support platform) | Yes | Currently support handled via a third‑party email service.  A dedicated ticketing tool may be added. |
| **First‑party instrumentation** | Records pseudonymised usage events. | Device type, session ID, feature usage | EU | Yes | Data stored within our own infrastructure.  No third‑party analytics in place at launch. |
| **Mailing list platform** (e.g., Mailchimp or ConvertKit) | Sends newsletters to users who opt‑in. | Email address, engagement metrics | US | Not active at launch | Will only be enabled when marketing emails begin.  SCCs required. |