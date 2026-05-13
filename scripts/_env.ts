// Preloader: import this FIRST in any verify/exercise script so dotenv
// populates process.env before transitive imports (e.g. lib/llm.ts) run
// their module-init code. ES modules guarantee the first import is fully
// evaluated before the next, so `import "./_env"` ahead of everything
// else gives us reliable env loading.
import { config } from "dotenv";

// override:true so an empty-string shell export (e.g. an unset ANTHROPIC_API_KEY=
// from a sourced rc file) doesn't shadow the real value in .env.local.
config({ path: ".env.local", quiet: true, override: true });
