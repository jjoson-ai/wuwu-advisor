# Astrologer On Demand

Phase 1 foundation for a conservative local-first MVP built with Next.js App Router, TypeScript, and Supabase.

## What is included

- Minimal App Router structure
- Shared layout and header
- Landing, login, onboarding, and dashboard pages
- Supabase browser and server client helpers
- Supabase auth callback route
- Sign-out flow for authenticated sessions
- Authenticated onboarding save flow with upserts into the profiles and birth_data tables
- Protected dashboard that loads saved onboarding basics
- Initial SQL schema for profiles and birth_data
- Typed astrology prompt and schema foundation for future daily briefing generation
- One daily briefing generation route that saves and renders the latest result
- Validation and domain type scaffolding

## Local setup

1. Make sure you are using Node.js 20 or newer.
2. From the project folder, install dependencies:

~~~bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand"
npm install
~~~

3. Copy the environment file and fill in your Supabase project values:

~~~bash
cp .env.example .env.local
~~~

4. Add these variables to .env.local:

~~~bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
GEMINI_API_KEY=your-gemini-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
GEOCODE_PROVIDER=opencage
OPENCAGE_API_KEY=your-opencage-api-key
FREEASTROAPI_API_KEY=your-freeastroapi-api-key
~~~

5. In Supabase SQL Editor, run or rerun the SQL from [sql/001_init.sql](/Users/y9378348c/Documents/Hula House/astrologer-on-demand/sql/001_init.sql).
6. Verify the tables now exist in that same Supabase project:

~~~sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'birth_data', 'daily_briefings');
~~~

This should return exactly:
- `public | profiles`
- `public | birth_data`
- `public | daily_briefings`

7. Confirm your local `.env.local` points to that same project:
- `NEXT_PUBLIC_SUPABASE_URL` should use the same project ref shown in the Supabase dashboard URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` should come from that same project.

8. In the Supabase dashboard, enable Email auth for your project and turn on email/password sign-in.
9. If you plan to keep email confirmation enabled for sign-up, configure your confirmation redirect URLs as needed for your environment.

10. Start the development server:

~~~bash
npm run dev
~~~

11. Open http://localhost:3000.

## Auth flow

- The login page uses Supabase email/password sign-in.
- Sign-up creates an email/password account.
- If email confirmation is enabled in Supabase Auth, new users must confirm email before signing in.
- Authenticated users can sign out from the header.
- /dashboard redirects to /onboarding until the required onboarding data exists.
- The onboarding form upserts into profiles and birth_data, then redirects back to /dashboard.
- The dashboard button calls `/api/generate-briefing`, saves one row in `daily_briefings`, and reloads the latest saved briefing.

## Project structure

~~~text
astrologer-on-demand/
  app/
  apps/mobile/
  components/
  domain/
  lib/
  sql/
~~~

## Mobile shell

Phase A adds a minimal Expo shell in [apps/mobile](/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile).

Required mobile environment variables:

~~~text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_API_BASE_URL
~~~

See [apps/mobile/.env.example](/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile/.env.example) and [apps/mobile/README.md](/Users/y9378348c/Documents/Hula House/astrologer-on-demand/apps/mobile/README.md) for setup details.

## Notes

- Login uses Supabase email/password auth.
- If you see `Could not find the table 'public.profiles' in the schema cache`, the app is usually connected to a Supabase project where [sql/001_init.sql](/Users/y9378348c/Documents/Hula House/astrologer-on-demand/sql/001_init.sql) has not been run yet, or `.env.local` points to a different project than the one you configured in the Supabase dashboard.
- Daily briefing generation requires `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env.local`.
- Birthplace geocoding during onboarding currently supports `GEOCODE_PROVIDER=opencage` with `OPENCAGE_API_KEY`.
- FreeAstroAPI-backed BaZi and Daily enrichments require `FREEASTROAPI_API_KEY`.
- BaZi uses an optional `BaZi calculation marker` field in onboarding only for the external Four Pillars engine. If left blank, the rest of the app still works and BaZi stays gated.
- Internal model comparison on `/evals` uses `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, and `DEEPSEEK_API_KEY` when available. Missing provider keys show per-model errors in the comparison document instead of breaking the whole run.
- Dashboard protection is implemented with explicit server-side checks inside the page.
- The shared header now adapts to the current auth session and includes sign-out when signed in.
- Onboarding saves through a server action and uses upsert behavior for safe resubmission.
- No AI generation, chat, billing, analytics, or background processing has been added.

## Local generation test

1. Add `OPENAI_API_KEY` and `OPENAI_MODEL` to `.env.local`.
2. Rerun [sql/001_init.sql](/Users/y9378348c/Documents/Hula House/astrologer-on-demand/sql/001_init.sql) so `daily_briefings` exists.
3. Start the dev server with `npm run dev`.
4. Sign in and complete onboarding.
5. Open `/dashboard`.
6. Click `Generate Today's Briefing`.
7. Confirm the latest saved briefing replaces the empty placeholder on the dashboard.

## Internal comparison test

1. Add any provider keys you want to compare to `.env.local`:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `DEEPSEEK_API_KEY`
2. Start the app with `npm run dev`.
3. Sign in and complete onboarding.
4. Open `/evals`.
5. Choose `Daily Briefing` or `Your Birth Blueprint`.
6. Optionally enable scorer models.
7. Click `Generate comparison document`.
8. Review the generated markdown document inline.
9. Use `Open printable view` for a readable browser version and browser-print it to PDF if needed, or use `Download HTML` to save the same printable document.

## Hybrid web checkout smoke test

Preferred smoke path:
- Playwright with saved authenticated browser state

Install the Playwright browser once:

~~~bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand"
npx playwright install chromium
~~~

Save authenticated browser state once:

~~~bash
npm run test:smoke:auth
~~~

What to do during auth-state setup:
- a headed Playwright Chromium window opens
- sign in with the dedicated free smoke-test user
- if onboarding appears, the setup test auto-fills a minimal smoke profile and continues
- leave the browser on the app
- the test saves browser state to `playwright/.auth/free-user.json`

Run the checkout smoke test:

~~~bash
npm run test:smoke:checkout
~~~

What it covers:
- opens `/forecast` as the saved authenticated free user
- generates a free Forecast if needed
- clicks `Unlock Pro`
- verifies redirect into Stripe Checkout
- waits for the one manual Stripe card-entry step
- verifies the return path treats the user as Pro
- verifies the free artifact stays stale instead of simply unlocking
- regenerates Forecast and verifies full Pro depth appears

Manual intervention point in the Playwright smoke test:
- complete Stripe Checkout in the opened Chromium window with a Stripe test card
- the test then waits for the browser to return to the app and continues automatically

Known limitation:
- after a successful run, that smoke-test user is now Pro
- for another full upgrade smoke run, use a fresh free user or reset the test user back to free

Fallback smoke path:
- Safari WebDriver hybrid script

This repo includes a minimal Safari WebDriver smoke script for the web Pro checkout path:

- [checkout_smoke_safari.py](/Users/y9378348c/Documents/Hula%20House/astrologer-on-demand/scripts/checkout_smoke_safari.py)

What it covers:
- opens `/forecast`
- generates a free Forecast if needed
- clicks `Unlock Pro`
- verifies redirect away from the app into Stripe Checkout
- pauses for manual Stripe test-card entry
- verifies the return path treats the user as Pro without simply unlocking the free artifact
- regenerates Forecast and verifies full Pro depth appears

Preconditions:
1. Safari remote automation is enabled in Safari Developer settings.
2. `safaridriver --enable` has been run on the machine at least once.
3. The app is running locally.
4. A dedicated free test user is already signed in in Safari for the target app origin.

Run:

~~~bash
cd "/Users/y9378348c/Documents/Hula House/astrologer-on-demand"
python3 scripts/checkout_smoke_safari.py
~~~

Optional:

~~~bash
WUWU_BASE_URL=http://localhost:3000 python3 scripts/checkout_smoke_safari.py
~~~

Manual intervention point:
- After Safari reaches Stripe Checkout, complete the purchase with a Stripe test card in the browser, then return to the terminal and press Enter.

If the script fails because Safari lands on `/login`, the automation session does not have a signed-in app session for that origin yet.
