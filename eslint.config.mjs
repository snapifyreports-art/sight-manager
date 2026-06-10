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
    // Build-time Node scripts (CommonJS, run via node directly, not Next):
    "docs/**",
    "scripts/**",
    "public/sw.js",
    // Standalone data-seeding scripts at repo root:
    "simulate-build.ts",
    "seed-riverside.ts",
    // Prisma seed scripts (Node-style, run outside Next):
    "prisma/seed.ts",
    "prisma/seed-latest-site.ts",
  ]),
  // User-uploaded photo thumbnails come from Supabase with dynamic URLs. We
  // intentionally render them as plain <img> rather than next/image because:
  //   • dimensions are not known ahead of time (arbitrary camera uploads)
  //   • these are thumbnails inside dialogs / lists, not LCP candidates
  //   • we don't want to round-trip every user photo through the optimizer
  // The rest of the app still gets no-img-element enforcement.
  {
    files: [
      "src/components/snags/**",
      "src/components/jobs/PhotoUpload.tsx",
      "src/components/plots/PlotQRCode.tsx",
      "src/components/programme/JobWeekPanel.tsx",
      "src/components/reports/ContractorComms.tsx",
      "src/app/contractor/**",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  // (Jun 2026 guardrail) Raw enum codes must not reach users. An app-wide
  // sweep found 18 surfaces printing things like AWAITING_CORRECTION or
  // "Plot cmb3x9..." — the recurring pattern was `.replace(/_/g, " ")`
  // half-fixes instead of the shared label maps (src/lib/labels.ts,
  // src/lib/inspection-doctype.ts). Warn on the pattern so new code gets
  // flagged in dev/PRs. Flip to "error" once the 12 remaining cosmetic
  // chip surfaces are converted (decision D9 in docs/app-audit-tickboxes).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "CallExpression[callee.property.name='replace'] > Literal.arguments:first-child[regex.pattern='_']",
          message:
            "Don't humanize enum codes with .replace(/_/g, ...) — use titleCaseEnum()/labels from src/lib/labels.ts or inspection-doctype.ts so every surface shows the same wording.",
        },
      ],
    },
  },
]);

export default eslintConfig;
