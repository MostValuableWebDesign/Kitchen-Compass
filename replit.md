# Kitchen Compass

Kitchen Compass is an iPhone companion for scanning, confirming, organizing, and cooking with the ingredients already at home.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Server secrets: `OPENAI_API_KEY` for photo recognition and AI recipe discovery; `SESSION_SECRET` for signed scan access; `DATABASE_URL` for a shared quota store in deployed multi-instance environments.
- Published recipes: set `THEMEALDB_API_KEY` to a paid TheMealDB key before publishing an iPhone app. The free development key is used only outside production.
- Keep `OPENAI_API_KEY` and `THEMEALDB_API_KEY` on the API server. The Expo bundle should receive only its API domain.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/kitchen-compass/app/` — Expo Router screens for Today, My Kitchen, Scan, Recipes, Meal Plan, recipe detail, and cooking mode.
- `artifacts/kitchen-compass/context/KitchenContext.tsx` — AsyncStorage-backed inventory, preferences, and meal-plan state.
- `artifacts/kitchen-compass/data/recipes.ts` — curated recipe content and cooking instructions used by the first build.
- `artifacts/kitchen-compass/constants/colors.ts` — Kitchen Compass light and dark semantic theme tokens.
- `artifacts/kitchen-compass/assets/images/` — app icon and generated recipe visuals.

## Architecture decisions

- Confirmed inventory, preferences, plans, and saved recipes use AsyncStorage so existing data remains available offline. Photo recognition, new AI recipes, and published recipes require the server and internet access.
- Camera and photo-library access use Expo ImagePicker's native entry points; every captured photo pauses at a review screen.
- Photos are normalized to JPEG before recognition. Originals are kept only if selected, as app-owned local copies that can be deleted in Settings or with the ingredient. The app cannot delete a photo from the user's Photos library.
- Planned meals reserve known quantities; cooking completion deducts inventory once, releases the reservation, and optionally creates leftovers.
- Published recipes come from TheMealDB, show provider/source attribution and ingredient gaps, and open the original source. They are not imported into the in-app planner because external allergen and quantity data have not been verified.

## Product

- Today shows the current day's meals, use-soon ingredients, and quick recipe inspiration.
- My Kitchen supports searchable storage locations, quantity-unknown labels, running-low toggles, and removal.
- Scan supports real camera capture, photo-library selection, and manual ingredient entry with confirmation.
- Recipes include inventory-aware status, bundled-table nutrition estimates where covered, health-score explanations, ingredients, and detailed cooking mode with timers. AI-generated recipes are saved locally after server validation; source recipes open at the source website.
- Meal Plan supports seven days of breakfast, lunch, and dinner slots with persistent swaps.

## User preferences

- The product should be warm, welcoming, food-focused, and readable with generous touch targets.

## Gotchas

- A physical-iPhone pass is still required: capture a camera photo, select an HEIC photo, review/confirm items, generate an AI recipe with a real OpenAI key, open its exact saved cooking steps, retrieve a published recipe with a paid TheMealDB key, complete a planned meal, and verify optional photo deletion and reminders.
- The overall workspace `pnpm run typecheck` currently fails in the unrelated mockup sandbox due to duplicate React type declarations in its calendar/spinner components. The API and Kitchen Compass typechecks pass independently.
- The Expo workflow can log a missing React Native DevTools `libglib-2.0.so.0` message while Metro still runs normally.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
