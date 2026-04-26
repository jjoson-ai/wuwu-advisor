# Subprocessors

**Last updated:** 18 April 2026

The table below lists the subprocessors we rely on to operate Wuwu Advisor. It reflects our current implementation and will be updated as our vendor relationships evolve.

| Vendor | Purpose | Data categories | Region | Active | Notes |
|---|---|---|---|---|---|
| **Vercel** | Hosts and serves the Wuwu Advisor web application and API routes. | IP address, request metadata, session cookies | US (global CDN) | Yes | Data processed at the edge; covered by Vercel's DPA and SCCs for EU transfers. |
| **Supabase** | Provides the application database and authentication. Stores all user account data, birth profiles, generated outputs, and conversation history. | Account data (email, password hash), birth profile, prompts, generated outputs, usage events | US (AWS us-east-1 by default) | Yes | All tables are RLS-protected. Data encrypted at rest and in transit. Covered by Supabase's DPA and SCCs. |
| **Google** | Provides Google OAuth sign-in as an alternative to email/password authentication. | Email address, Google account identifier | US | Yes | Only authentication data is exchanged. We do not receive or store Google profile photos or contacts. Covered by Google's DPA. |
| **Anthropic** | Processes user prompts and astrological context to generate AI responses across all four features (Today, Blueprint, Forecast, Ask). | Pseudonymised prompts, birth date/time/city (converted to timezone offset), user question text | US | Yes | Data is pseudonymised before transfer (internal user ID, not email). Bound by Anthropic's usage policy prohibiting model training on API data. Zero Data Retention (ZDR) arrangement to be enabled — see privacy policy. |
| **FreeAstroAPI** | Calculates Western astrological placements (planetary positions, houses, aspects) from birth date, time, and location. | Birth date, birth time, birth latitude/longitude/timezone | EU | Yes | Used for ephemeris computation only. No account data transmitted. |
| **Stripe** | Processes Pro subscription payments and manages billing. | Billing name, email, payment method token, subscription status, transaction amount | US/EU | Yes | Full card details handled by Stripe only; we receive partial card metadata. Covered by Stripe's DPA and SCCs. |
| **OpenAI** | Generates vector embeddings for the Ask memory pipeline (text-embedding-3-small). Embeddings are derived from extracted fact summaries, not raw user prompts. | Pseudonymised fact summaries (e.g. "user is deciding whether to quit job") — no raw prompts, no email, no birth data | US | Yes (when MEMORY_EXTRACTION_ENABLED=true) | Data is pseudonymised before transfer. Covered by OpenAI's DPA and SCCs for EU transfers. |
| **Resend / email provider** | Sends transactional emails (e.g. account confirmation, billing receipts) when email confirmation is enabled. | Email address | US | Not yet active | Will only be activated when Supabase SMTP is configured. SCCs required. |
| **Mailing list platform** | Sends newsletters and marketing emails to users who explicitly opt in. | Email address, engagement metrics | US | Not yet active | Will only be enabled when marketing emails begin. SCCs required. |
