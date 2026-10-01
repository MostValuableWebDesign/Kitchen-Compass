# Kitchen Compass

Kitchen Compass is an iPhone companion for scanning, confirming, organizing, and cooking with the ingredients already at home.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Server secrets: `OPENAI_API_KEY` for photo recognition and AI recipe discovery; `SESSION_SECRET` for signed scan access; `DATABASE_URL` for a shared quota store in deployed multi-instance environments.
- Published recipes: set `SPOONACULAR_API_KEY` for Spoonacular on the API server. The API searches every configured provider concurrently, then interleaves eligible recipes in Spoonacular, RecipeAPI.io, Recipe-API.com, TheMealDB order. It removes cross-provider duplicates and returns up to 50 combined recipes for General or Kid-friendly search. Each recipe may have up to seven counted missing ingredients; herbs, spices, seasonings, and common pantry staples are excluded from that count. Up to 30 search anchors are selected, while up to 64 confirmed pantry ingredients are used for matching. Spoonacular uses one ingredient search request and one bulk details request; the details batch is capped at four candidates for a complete-meal dish and eight for a general search. Each response includes ordered `sourceResults`, and the server logs `Published recipe source results` with each provider's eligible count before cross-provider deduplication and the combined cap. Searching all configured providers increases API usage. Set `THEMEALDB_API_KEY` to a paid key before publishing an iPhone app; its free development key is used only outside production.
- Spoonacular online cards may link to its HTTPS recipe page when the publisher's `sourceUrl` is HTTP, and can link out when embedded instructions or an image are absent. The API still requires an HTTPS link, a pantry match, no requested allergen conflict, and at most seven counted missing ingredients.
- General and Kid-friendly published recipes are ordered by fewest counted missing ingredients, then by most confirmed pantry matches. This order is applied before selecting the combined 50 results and on both result screens.
- General and Kid-friendly online result chips filter the current recipes by food type (including specific meats) without another provider request.
- The API deduplicates published recipes by exact recipe ID or source link. Recipes with the same title but different source links remain distinct. `resultCounts` reports eligible provider recipes, duplicate links removed, recipes cut by the 50-result cap, and recipes returned; the app displays these counts after each online search.
- General and Kid-friendly online results also have source chips for Spoonacular, RecipeAPI.io, Recipe-API.com, and TheMealDB when each source has visible recipes. Food and source filters work together on already returned results, with no extra provider requests; results retain their missing-ingredient ranking.
- General published-recipe searches, including General complete-meal main and side searches, exclude recipes with two or fewer distinct ingredients beyond one matching search anchor. The filter runs before source counts and the combined 50-result limit. Kid-friendly searches retain their existing eligibility rules.
- Keep `OPENAI_API_KEY`, `THEMEALDB_API_KEY`, `SPOONACULAR_API_KEY`, `RECIPEAPI_API_KEY`, and `RECIPE_API_COM_API_KEY` on the API server. The Expo bundle should receive only its API domain.

### Activate Spoonacular in Replit

1. Add `SPOONACULAR_API_KEY` as a Replit server secret. Do not put it in an `EXPO_PUBLIC_*` variable or the app bundle.
2. Run the API and app typechecks plus the API and Kitchen Compass test scripts on Replit.
3. Use **Find online** in General and **Find kids’ recipes** in Kid-friendly with confirmed ingredients. Spoonacular cards should appear before TheMealDB cards when ingredient fits tie, and show an image plus the original recipe source name and link. Spoonacular details remain online only; archiving stores just its ID and title. If the API response includes `Spoonacular` in `providersUnavailable`, inspect the server's `Published recipe provider unavailable` log for the upstream status.

## Reusable AI recipe files

- The API saves validated AI recipes to `.local/generated-recipes/<recipe-version-hash>/recipe.json`. Generated JPEGs are stored beside the recipe as `image-<content-hash>.jpg`. Cache files are runtime data, excluded from Git by the existing `.local/` ignore rule.
- Set `GENERATED_RECIPE_CACHE_DIR` to a persistent storage directory on the API server to retain the library across deployment replacements. The default survives process restarts when the filesystem is retained; an ephemeral deployment filesystem does not preserve it across replacements. Files are not bundled into the iPhone app.
- Discovery checks these files before calling AI. General/Kid-friendly searches reuse eligible cached recipes and ask AI to fill remaining slots up to five; complete-meal searches target one dish. A full cache hit skips AI entirely, while an AI failure or no additional eligible result still returns the usable cached recipes. It can reuse a recipe for a pantry with additional items, checks required ingredients against confirmed available inventory, and reruns current recipe validation. Preferences, filters, General/Kid-friendly audience, course, selected focus ingredients, and main-dish context must match. Existing/archived exclusions still apply; changing the variation seed alone does not force an AI request.
- Image requests read a saved generated JPEG before any provider call. Recipe version, title, description, and ingredient identity prevent an unrelated image from being reused. Source photos stay as external links and are not copied into this cache. Concurrent identical discovery/image requests are serialized within one API process to avoid duplicate generation.
- Missing/corrupt cache files are treated as misses. Storage failures do not discard a successfully generated recipe or image. Matching cached recipes and images can be returned even without an OpenAI key; requests without a usable cached result still require the key.

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
- Published recipes come from Spoonacular, RecipeAPI.io, Recipe-API.com, and TheMealDB in that priority order, show provider/source attribution and ingredient gaps, and open the original source when one is available. Spoonacular recipe details are displayed only for the current online search; they cannot be added to offline saved recipes. Spoonacular archives store ID and title. Published recipes are not imported into the in-app planner because external allergen and quantity data have not been verified.
- General and Kid-friendly each offer separate AI creation and published online search actions. Online search never starts AI creation. Its `sourceResults` response reports Spoonacular, RecipeAPI.io, Recipe-API.com, and TheMealDB separately as found, no results, unavailable, or not configured; the app shows these outcomes below the online search card.
- Both recipe sections include a complete-meal builder. Choose an existing saved main dish or find a new main from reviewed confirmed ingredients, then find a side with its own reviewed ingredients and the main dish's title and ingredients as context. Each dish searches Spoonacular, RecipeAPI.io, Recipe-API.com, and TheMealDB first; AI creates one only when the online search fails or yields no suitable result. Published dishes link to their original source or display provider instructions in the app, and remain in the current session only; AI dishes are saved with their course label. The current pairing is held on the Recipes screen for the session. Automatic selection ranks confirmed, non-used ingredients by food role, quantity, freshness, use-soon date, and category diversity; side selection favors vegetables and grains. The user can review or choose up to 30 ingredients before each search. The API validates selected ingredients against confirmed available inventory and requires a main dish for side creation.

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

### Activate RecipeAPI.io in Replit

1. Add `RECIPEAPI_API_KEY` as a server secret and restart the API workflow. The server uses the documented `Authorization: Bearer` header; the key never enters the Expo bundle or request URL.
2. One request to `GET https://recipeapi.io/api/v1/recipes` sends up to 30 selected ingredient anchors in `ingredients`. It fetches page 1 once, with full ingredients and instructions, and does not follow pagination or request each recipe separately. The default `per_page=10` fits the Free plan. Optionally set `RECIPEAPI_PER_PAGE=25` for Essential or `50` for Business/Enterprise; the app caps this setting and total combined results at 50. The subscription must support the configured page size. Documentation: https://recipeapi.io/docs/resources/recipes/
3. Main/side searches also send the documented `meal_type=main` or `side_dish`. Local pantry, allergy, dislike, missing-ingredient, General minimum ingredient, and child suitability checks run before eligible counts. Food/source chips include RecipeAPI.io and results keep their existing ingredient-fit ranking.
4. RecipeAPI.io recipes use **View recipe** for full measured ingredients and instructions, in General, Kid-friendly, and complete-meal dishes. No image or public recipe permalink is promised by the documented response. Details stay in the search session; archives retain only `recipeapi:<id>` and a generic label.
5. Missing credentials show **not configured**; quota/authentication/plan/upstream failures show **could not be reached**, with other providers still available. Verify a live search after adding the key. Commercial use requires an active paid plan: https://recipeapi.io/legal/terms-of-service

### Activate Recipe-API.com in Replit

1. Add `RECIPE_API_COM_API_KEY` as a server secret and restart the API workflow. This is separate from `RECIPEAPI_API_KEY`, which belongs to recipeapi.io. The key is sent only in the `X-API-Key` header.
2. Search accepts up to 30 selected anchors, removes seasonings and duplicate food terms, and resolves each term through free `GET /api/v1/ingredients?q=...` discovery (up to 30 sequential calls, no pagination). It sends the resolved UUIDs together in `ingredients` in one free `GET /api/v1/recipes` request, without a text query. Each recipe must contain ALL supplied ingredient IDs. Exact name matches are preferred, then matching food terms; if any selected term cannot be resolved, no recipe search or metered detail call is made. IDs are deduplicated and are not persistently cached. Full pantry matching still happens locally on the server.
3. Full ingredients and instructions require metered `GET /api/v1/recipes/{uuid}` calls. General/Kid-friendly searches fetch at most 3 candidates by default; complete-meal main/side searches fetch at most 2. Optional `RECIPE_API_COM_MAX_DETAILS` permits 1–5 candidates for ordinary searches, while complete-meal stays capped at 2. There is no pagination or automatic retry, and ingredient resolution and detail requests run sequentially with a shared 20-second deadline. An upstream/quota failure stops further detail calls; any already-qualified recipes are retained.
4. Grouped ingredients are flattened with quantities, preparation and notes; unspecified/to-taste quantities remain unspecified. Instruction objects are ordered by step number. Allergies, matching, seven counted missing ingredients, General minimum ingredient count, dislikes, course, and child suitability filters run before source counts and the combined 50-result cap. The provider appears in source filters. Recipes open through **View recipe** inside the app, and archives retain only the UUID and a generic label.
5. Evaluation has 50 lifetime detail requests and no recurring reset; discovery is free, and each full detail call uses one request. Commercial use and caching rights vary by tier. The integration keeps full recipe data in the current search session. Docs: https://recipe-api.com/docs ; terms: https://recipe-api.com/terms
6. Local verification uses mocked provider responses. After adding the key, perform a real search and check **Recipe-API.com** in **Online source results**.
