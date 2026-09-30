# Kitchen Compass

Kitchen Compass is an iPhone companion for scanning, confirming, organizing, and cooking with the ingredients already at home.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Server secrets: `OPENAI_API_KEY` for photo recognition and AI recipe discovery; `SESSION_SECRET` for signed scan access; `DATABASE_URL` for a shared quota store in deployed multi-instance environments.
- Published recipes: set `SPOONACULAR_API_KEY` for Spoonacular on the API server. The API searches every configured provider concurrently, then interleaves eligible recipes in Spoonacular, API Ninjas, TheMealDB order. It removes cross-provider duplicates and returns up to 50 combined recipes for General or Kid-friendly search. Each recipe may have up to seven counted missing ingredients; herbs, spices, seasonings, and common pantry staples are excluded from that count. Up to 30 search anchors are selected, while up to 64 confirmed pantry ingredients are used for matching. Spoonacular uses one ingredient search request and one bulk details request; the details batch is capped at four candidates for a complete-meal dish and eight for a general search. Each response includes ordered `sourceResults`, and the server logs `Published recipe source results` with each provider's eligible count before cross-provider deduplication and the combined cap. Searching all configured providers increases API usage. Set `THEMEALDB_API_KEY` to a paid key before publishing an iPhone app; its free development key is used only outside production. FatSecret is disabled even if its credentials remain configured.
- Spoonacular online cards may link to its HTTPS recipe page when the publisher's `sourceUrl` is HTTP, and can link out when embedded instructions or an image are absent. The API still requires an HTTPS link, a pantry match, no requested allergen conflict, and at most seven counted missing ingredients.
- General and Kid-friendly published recipes are ordered by fewest counted missing ingredients, then by most confirmed pantry matches. This order is applied before selecting the combined 50 results and on both result screens.
- General and Kid-friendly online result chips filter the current recipes by food type (including specific meats) without another provider request.
- The API deduplicates published recipes by exact recipe ID or source link. Recipes with the same title but different source links remain distinct. `resultCounts` reports eligible provider recipes, duplicate links removed, recipes cut by the 50-result cap, and recipes returned; the app displays these counts after each online search.
- General and Kid-friendly online results also have source chips for Spoonacular, API Ninjas, and TheMealDB when each source has visible recipes. Food and source filters work together on already returned results, with no extra provider requests; results retain their missing-ingredient ranking.
- General published-recipe searches, including General complete-meal main and side searches, exclude recipes with two or fewer distinct ingredients beyond one matching search anchor. The filter runs before source counts and the combined 50-result limit. Kid-friendly searches retain their existing eligibility rules.
- Keep `OPENAI_API_KEY`, `THEMEALDB_API_KEY`, `SPOONACULAR_API_KEY`, and `API_NINJAS_API_KEY` on the API server. The Expo bundle should receive only its API domain.

### Activate Spoonacular in Replit

1. Add `SPOONACULAR_API_KEY` as a Replit server secret. Do not put it in an `EXPO_PUBLIC_*` variable or the app bundle.
2. Run the API and app typechecks plus the API and Kitchen Compass test scripts on Replit.
3. Use **Find online** in General and **Find kids’ recipes** in Kid-friendly with confirmed ingredients. Spoonacular cards should appear before TheMealDB cards when ingredient fits tie, and show an image plus the original recipe source name and link. Spoonacular details remain online only; archiving stores just its ID and title. If the API response includes `Spoonacular` in `providersUnavailable`, inspect the server's `Published recipe provider unavailable` log for the upstream status. FatSecret should never appear in `providersUnavailable` or trigger an API request.

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
- Published recipes come from Spoonacular, API Ninjas, and TheMealDB in that priority order, show provider/source attribution and ingredient gaps, and open the original source when one is available. API Ninjas instructions are displayed inside the app. Spoonacular and API Ninjas recipe details are displayed only for the current online search; they cannot be added to offline saved recipes. Spoonacular archives store ID and title. The legacy FatSecret adapter and archive parsing remain for compatibility, but no FatSecret API calls are made. Published recipes are not imported into the in-app planner because external allergen and quantity data have not been verified.
- General and Kid-friendly each offer separate AI creation and published online search actions. Online search never starts AI creation. Its `sourceResults` response reports Spoonacular, API Ninjas, and TheMealDB separately as found, no results, unavailable, or not configured; the app shows these outcomes below the online search card.
- Both recipe sections include a complete-meal builder. Choose an existing saved main dish or find a new main from reviewed confirmed ingredients, then find a side with its own reviewed ingredients and the main dish's title and ingredients as context. Each dish searches Spoonacular, API Ninjas, and TheMealDB first; AI creates one only when the online search fails or yields no suitable result. Published dishes link to their original source or display API Ninjas instructions in the app, and remain in the current session only; AI dishes are saved with their course label. The current pairing is held on the Recipes screen for the session. Automatic selection ranks confirmed, non-used ingredients by food role, quantity, freshness, use-soon date, and category diversity; side selection favors vegetables and grains. The user can review or choose up to 30 ingredients before each search. The API validates selected ingredients against confirmed available inventory and requires a main dish for side creation.

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

### Activate API Ninjas in Replit

1. Add `API_NINJAS_API_KEY` as a server secret, then restart the API workflow. Never use an `EXPO_PUBLIC_*` variable for the key.
2. The default uses one `/v3/recipe` title-search request with the first recognized selected food anchor and `limit=5`. It works with basic keys for development. For Premium pantry search, set `API_NINJAS_RECIPE_SEARCH_MODE=ingredients`; this sends up to five distinct recognized anchors and `limit=10` in one request. There are no retries, pagination, or calls per ingredient. API Ninjas requires a paid subscription for commercial use and pantry ingredient searches: https://api-ninjas.com/api/recipe
3. General, Kid-friendly, and complete-meal searches include this provider alongside Spoonacular and TheMealDB. The API checks matches against the full pantry and applies existing allergy, missing-ingredient, General ingredient minimum, course, and child suitability filters. Counts and source chips show API Ninjas. The combined cap stays 50; this provider contributes at most 5 or 10 candidates per request.
4. API Ninjas has no recipe image or original recipe permalink in its documented response. Its cards offer **View recipe** to show measured ingredients and cooking instructions inside the app, including complete-meal dishes. The provider link is labeled as attribution. Full recipe data remains in the current session; archive exclusions store only a derived opaque ID and generic label.
5. Missing keys show **not configured**. Authentication, subscription, quota, malformed-response, and upstream failures show **could not be reached**, while other providers still run. Confirm a real search after adding the key; local tests use mocked provider responses.
