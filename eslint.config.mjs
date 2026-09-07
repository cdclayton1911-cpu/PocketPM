import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The E2E build output and the cached PocketBase binary are generated,
    // not source. Without these, `npm run lint` walks a whole second build
    // and reports thousands of problems in code nobody wrote.
    ".next-e2e/**",
    ".cache/**",
    "test-results/**",
    "playwright-report/**",
    // PocketBase hooks run in Goja, not Node: no imports, no module scope
    // inside handlers, and the triple-slash reference is how PocketBase
    // supplies editor typings. Linting them with the app's TypeScript config
    // is a category error — it reports style violations against a runtime
    // that has different rules.
    "pb_hooks/**",
  ]),
]);

export default eslintConfig;
