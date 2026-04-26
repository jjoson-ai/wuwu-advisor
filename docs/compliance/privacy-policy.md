# Wuwu Advisor Privacy Policy

**Effective date:** 18 April 2026

This privacy policy explains how **CLICK COMMERCE LIMITED**, a company registered in Hong Kong ("we", "us", or "our"), collects, uses and protects your personal data when you use **Wuwu Advisor**.  Wuwu Advisor is an AI-powered astrology and decision-support app available via web and mobile.  We provide a free tier and an optional **Pro** subscription.  This policy reflects the current implementation of the product and will be updated as systems evolve.

## 1. Who is responsible

**Controller:** CLICK COMMERCE LIMITED (Hong Kong).  We determine the purposes and means of processing personal data.  Because we serve EU residents, we have appointed an EU representative in accordance with Article 27 GDPR.  Contact details for both the Hong Kong company and EU representative are available at the end of this policy.

## 2. What data we collect and why

We only collect data that is necessary to provide the Wuwu Advisor service.  Data categories and purposes are summarised below.

| Data category | Description & purpose | Legal basis | Retention |
|---|---|---|---|
| **Account data** | Email address and a password hash or OAuth identifier used to create and authenticate your account.  Required to secure access, manage subscriptions and provide core features. | **Performance of contract** – processing is necessary to provide the service you request; **legitimate interest** – security and fraud prevention. | Stored while your account is active and for up to 90 days after deletion to allow recovery and suppress spam. |
| **Optional birth profile** | Date, time and city/country of birth (converted to timezone) and optional nickname.  Used to calculate your astrological "Birth Blueprint" and personalise forecasts. | **Explicit consent** – you choose whether to provide these details; **performance of contract** for Pro features. | Kept until you delete the profile or your account; aggregated, anonymised statistics may be retained. |
| **Prompts & conversations** | Questions you ask in the **Ask** feature and any context you provide.  Needed to generate responses via third-party large language model (LLM) APIs. | **Consent** and **performance of contract** – we process prompts to respond to you; data is not used for other purposes. | Raw prompts are retained for up to 30 days; anonymised analytics may be stored up to one year. |
| **Generated outputs** | AI-generated answers and astrology readings (Today, Blueprint, Forecast, Ask).  Used to provide requested content and maintain your history. | **Performance of contract** – to deliver the service; **legitimate interest** to troubleshoot and improve. | Stored for up to 12 months in your account or until you delete them. |
| **Memory (personalisation facts)** | When you use the **Ask** or **Decision** features, our system extracts a small number of key facts from your conversations (for example: "user is considering a career change").  These summaries are stored as vector embeddings and used to personalise future responses — for instance, Wuwu may reference a past decision you mentioned.  You can view, edit and delete all stored facts at any time via **Settings → Things Wuwu Remembers**. | **Consent** and **performance of contract** – to provide a personalised advisory experience.  Memory extraction is controlled by a feature flag; you are notified when it is active. | Facts are retained until you delete them or delete your account.  Deleting a conversation also deletes its derived facts. |
| **Usage data** | Device type, browser, session identifiers and in-app events captured via our **first-party instrumentation**.  Data helps us understand feature engagement and debug issues. | **Legitimate interest** – product improvement.  Non-essential tracking will only be used with your consent. | Raw events are retained for up to 30 days and aggregated metrics for up to 24 months. |
| **Advertising & attribution** | When you arrive via a paid advertisement, your browser stores a click identifier (e.g. Google `gclid` or Meta `fbclid`) in a first-party attribution cookie for up to 90 days.  If you subscribe, we share a **hashed (SHA-256) version of your email address** and the conversion event with **Google** and **Meta** so we can measure ad performance and optimise our campaigns.  No raw email is transmitted; matching is done by the ad platform on the hashed value only.  We do not use third-party cookies for retargeting.  You can clear attribution cookies at any time via your browser settings. | **Legitimate interest** – measuring marketing effectiveness; consent for non-essential advertising processing where required by law. | Attribution cookies expire after 90 days.  Conversion event records are retained by Google and Meta per their own policies. |
| **Payment data** | Name, email, subscription tier and transaction amount handled via **Stripe**.  We do not store full card numbers.  Payment information is required to provide paid Pro subscriptions and comply with tax obligations. | **Performance of contract** and **legal obligation**. | Transaction records are retained for at least 7 years to meet statutory requirements. |
| **Support communications** | Emails or messages you send to our support team.  Used to resolve issues and improve the service. | **Performance of contract** or **legitimate interest**. | Retained for up to 2 years. |

## 3. How we process data

- **LLM processing (Anthropic):** When you ask a question or we generate a forecast, your prompt and relevant context are sent to **Anthropic** (our primary LLM provider) to produce an answer.  We pseudonymise the data before transfer (replacing your email with an internal ID) and our contract with Anthropic prohibits model training on API data.  Zero Data Retention (ZDR) — where requests are processed ephemerally with no storage by Anthropic — is in the process of being enabled at the organisation level; its current status is noted on our Subprocessors page.

- **Memory embeddings (OpenAI):** When the personalisation memory feature is active, extracted fact summaries are converted into vector embeddings using **OpenAI**'s text-embedding API.  Only pseudonymised fact summaries are sent — no raw prompts, no email, no birth data.  Our contract with OpenAI prohibits use of API data for model training.

- **Ephemeris computation (FreeAstroAPI):** We send your birth date, time, and location to **FreeAstroAPI** to calculate astrological positions (planetary placements, houses, aspects).  No account data is transmitted — only the birth data required for the calculation.

- **Advertising measurement (Google, Meta):** If you arrive via a paid ad and subsequently subscribe, we transmit a hashed email address and the conversion event to **Google Enhanced Conversions** and **Meta Conversions API** for ad measurement.  These are server-to-server calls; no third-party tracking pixels or cookies beyond the first-party attribution cookie described in Section 2 are set without consent.

- **Hosting & authentication:** We use **Vercel** to serve the application and **Supabase** to store your data and manage authentication.  Supabase runs on AWS (US region by default).  Passwords are hashed; data is encrypted in transit and at rest.  Transfers to the US are covered by Standard Contractual Clauses.

- **Payments:** We use **Stripe** to handle payment processing.  Stripe collects your billing information and processes payments.  We receive only the necessary transaction metadata (e.g., subscription status, price, date).  Card details are not stored on our servers.

- **First-party analytics:** We collect minimal usage metrics via our own instrumentation.  We do not use third-party behavioural analytics SDKs (such as Mixpanel or Amplitude).

For a complete list of vendors and their data handling commitments, see our [Subprocessors](/privacy/subprocessors) page.

## 4. Transfers outside the EEA

When we transfer personal data of EU users to countries outside the European Economic Area (EEA), we implement safeguards.  Transfers to Anthropic, OpenAI, Vercel, Supabase, Stripe, Google, and Meta (all US-based) are governed by the **European Commission's Standard Contractual Clauses** and additional contractual commitments to ensure appropriate protection.  We pseudonymise data wherever possible.  You can obtain a copy of these safeguards by contacting us.

## 5. How long we keep your data

We retain data only for as long as necessary for the purposes stated above.  See the table in Section 2 for typical retention periods.  Backups are kept for up to 90 days and then purged, except where legal obligations require longer retention (e.g., invoices).

## 6. Your rights

If you are in the EU or another jurisdiction that grants data subject rights, you have the right to:

- **Be informed** about how your data are used.
- **Access** your personal data and receive a copy.
- **Rectify** inaccurate or incomplete data.
- **Erase** data ("right to be forgotten").  Use the in-app Delete my account function to delete your account and all first-party data immediately.  Some data (e.g., invoices) may be retained to meet legal obligations.
- **Restrict** or **object** to certain processing.
- **Port your data** to another service.
- **Not be subject to solely automated decisions** that produce legal or similarly significant effects.  Wuwu Advisor provides reflective guidance and does not make decisions on your behalf.

To exercise any of these rights, please use the in-app export or delete function (available in Settings) or contact us at the email below.  We will respond within one month.  For deletion requests, the in-app **Delete my account** function permanently removes your account and all first-party data immediately.  Some billing records (e.g. invoices) are retained to meet legal and tax obligations.

## 7. Security

We implement technical and organisational measures to protect your data, including encryption, pseudonymisation, role-based access controls and regular security assessments.  We limit employee access to personal data and monitor systems for unauthorised activity.

## 8. Children's privacy

Wuwu Advisor is an adults-only service.  You must be at least **18 years old** to create an account or use the service.  We collect a date of birth at signup and reject any submission that indicates the user is under 18.  If an account is created by someone later determined to be under 18, or if a date of birth submitted indicates the user is under 18, we delete the account and associated personal data immediately.

We do not knowingly collect personal data from children under 13 (as defined by COPPA) or from minors under 18 (the age threshold used by California SB 243, the Companion Chatbot Act).  If you believe a minor has created an account, please contact us at the email in Section 10 and we will remove the account promptly.

Under California SB 243 (effective 2026), Wuwu Advisor discloses that it uses artificial intelligence to generate responses.  AI-generated content is not a substitute for professional advice.

## 9. Changes to this policy

We may update this policy to reflect changes in the law or our services.  We will notify you via the app or email if we make material changes.  The current version will always be available within the app.

## 10. Contact

**Controller:** CLICK COMMERCE LIMITED (Hong Kong)

**EU representative:** [Name/Address — to be confirmed before EU market activation]

**Email:** privacy@wuwu-advisor.com (please use this for all privacy requests)

If you are not satisfied with our response, you have the right to lodge a complaint with your local supervisory authority.
