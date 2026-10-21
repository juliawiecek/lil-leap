# NEXT-247 / PS-27: colour tokens and colour-blind palettes

Story: [NEXT-247](https://lilleap.atlassian.net/browse/NEXT-247). Depends on PS-17; this change does not implement PS-28's application-wide financial formatting work.

## Implementation

- `frontend/public/theme-tokens.css` is the sole application palette. It preserves 284 distinct original colour values (300 literal spellings), including alpha, gradients, shadows and brand marks. Numbered tones retain existing shades; new UI should use semantic roles such as `--gain`, `--loss`, `--warning`, `--surface`, `--text`, `--buy` and `--chart-1` through `--chart-4`.
- Component SCSS/CSS, inline component styles, HTML, SVG attributes, Tailwind colour aliases and chart constants reference these tokens. The existing layout, data, calculations, order processing, history and five-second chart sampling are unchanged. Microsoft brand colours remain brand colours rather than financial indicators.
- `colour-mode-preferences.ts` defines the validated mode, storage key and root-attribute functions. `scripts/build-colour-bootstrap.mjs` compiles these same functions into the small classic `public/colour-mode-init.js` script. `index.html` loads it before the palette stylesheet and Angular, avoiding a second preference parser or a first-frame palette change. `npm start` and `npm run build` regenerate the asset.
- `ColourModeStore` writes only `{ colourMode: { mode } }` in PS-17's existing `nexttrade.accessibility` entry, retaining other accessibility settings. PS-17's startup provider also applies the validated preference before views render. Missing, corrupt and blocked storage fall back to Off; blocked storage still permits changes for the current visit.
- Both Settings pages use the same Accessibility component and labelled native radio group: **Off**, **Red-green safe**, **Blue-yellow safe**. The selected value is applied as `data-colour-mode="off|red-green|blue-yellow"` on `html`. Native click, Tab, arrow keys and Space work without custom keyboard interception; the controls are also normal switch-scanner targets.
- SVG colours follow CSS variables immediately, keeping their DOM nodes, viewport and data. The login canvas resolves its colours once and observes root-mode changes, repainting without reseeding candles. Its observer is disconnected on teardown.

## Palettes

All modes keep the near-black surfaces and warm white text. Safe modes distinguish actions/categories from performance. Off keeps the existing blue Buy/allocation accents exactly.

Cash allocation neutrals stay identical in all three modes: the ring track uses `#353b44`, and the cash legend dot and meter use `#707783`. Safe modes inherit these defaults rather than brightening them.

| Role | Off | Red-green safe | Blue-yellow safe |
| --- | --- | --- | --- |
| Gain text | `#94c973` | `#83c6ff` | `#69d8ad` |
| Loss text | `#ff7a6e` | `#ffad70` | `#ed83cc` |
| Warning | `#e2b65a` | `#f2d280` | `#e9c2de` |
| Price line above baseline | `#22c55e` | `#83c6ff` | `#69d8ad` |
| Price line below baseline | Existing emerald area style | Orange, dashed | Rose, dashed |
| Buy / chart 1 | `#779ce8` | `#b1a0ef` | `#c5b3ec` |
| Buy gradient | `#678bdb` → `#91b1f1` | `#a998e7` → `#bfaefd` | `#bdabe4` → `#d3c1fa` |
| Chart 2 | `#e2b65a` | `#f2d280` | `#8cdbbd` |
| Chart 3 | `#94c973` | `#96d8c3` | `#ed83cc` |
| Chart 4 | `#ff7a6e` | `#ffb9d1` | `#dce4e2` |

The blue-yellow-safe performance pair is mint/magenta, avoiding blue-versus-yellow discrimination. An initial paler rose was rejected after simulation showed weak deuteranopia separation. The final pair retains a larger lightness/chromatic distinction.

## Information beyond colour

Existing positive/negative signs, direction arrows, trade labels and warnings are retained. Ticker price flashes have a screen-reader direction description and visible up/down arrows in safe modes. Stock SVG labels state whether the price is below, at or above session open; the portfolio already provides its change in words. Negative area lines become dashed in safe modes, and falling decorative login candles become hollow. Category labels and amounts remain beside allocation graphics. These are small complementary cues within PS-27, not a replacement financial-value formatter or a PS-25 data-table implementation.

## Contrast and simulation checks

WCAG checks use the [W3C relative-luminance contrast method](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Automated token tests require 4.5:1 for primary financial text and button labels, and 3:1 for essential chart lines against the dark surfaces. Rendered text checks also cover the Settings controls, dashboard labels and order dialog, including gradient endpoints. Disabled controls and decorative fills are not treated as essential text/graphics. Gradient compositing, native controls and assistive technology still require human review.

| Financial text on raised surface | Off | Red-green safe | Blue-yellow safe |
| --- | --- | --- | --- |
| Gain | 9.36:1 | 9.90:1 | 10.36:1 |
| Loss | 7.12:1 | 9.88:1 | 7.51:1 |
| Warning | 9.54:1 | 12.33:1 | 11.41:1 |

Full-severity simulations use the published Machado, Oliveira and Fernandes model in linear sRGB, cross-checked with Chromium/Edge's `Emulation.setEmulatedVisionDeficiency`. The matrices are documented in the [reference implementation](https://github.com/colour-science/colour/blob/develop/colour/blindness/datasets/machado2010.py). CIE Lab ΔE76 is an engineering check here, not a WCAG conformance metric or a guarantee for every individual.

| Gain/loss ΔE76 | Protanopia | Deuteranopia | Tritanopia |
| --- | --- | --- | --- |
| Off, retained control | 27.67 | 4.41 | 82.09 |
| Red-green safe | 70.74 | 82.77 | 77.46 |
| Blue-yellow safe | 48.76 | 24.74 | 89.71 |

Both safe modes exceed the engineering separation threshold of 20 under all three simulations. Off is intentionally not a colour-blind-safe palette; it remains the original design. Signs and textual descriptions remain available in every mode.

## Acceptance criteria and validation

1. **Central tokens:** a TypeScript-AST-aware source audit rejects literal hex/RGB colours in component styles, templates, SVGs and TypeScript colour strings. TS private fields and generated RGB interpolation are not mistaken for palette literals.
2. **Default visual identity:** original committed frontend sources were exported and built in an isolated temporary directory for before/after screenshots. Eight comparisons pass: login, login hover, Novice Overview/Portfolio/Activity/Settings, and Advanced Overview/Settings. None has a changed pixel above a three-channel-level anti-aliasing tolerance. Charts are loaded before capture; the intentionally added Settings card is excluded from the regression comparison and captured separately for interaction review. The existing blue actions and allocation, page geometry and default chart colours are retained.
3. **SVG tokens:** chart lines, endpoints, gradients, candles, allocation and historical plots use tokens. Browser tests check resolved painted colours and full gradient transparency, not just token names.
4. **Immediate mode switching:** financial states, warnings, ticker flashes, notifications, chart colours and action accents update through the root attribute. SVG geometry and node identity are tested across changes. Canvas updates use resolved tokens with cleanup.
5. **Simulation:** both safe palettes pass all three simulation checks; browser-emulated screenshots are reviewed alongside the normal renderings. Simulations approximate vision deficiency and do not substitute for testing with affected users.
6. **Contrast:** primary financial text, chart lines and Buy gradients pass in all modes. Safe modes also correct inherited dim Advanced labels. **Full AA for Off is not claimed:** preserving the exact original palette retains `#7a7a7a` labels on `#111111` at about 4.4:1, stock-chart slate labels at about 4.0:1, and the darkest original Sell-gradient label pair at 4.27:1. Correcting these in Off requires a deliberate exception to exact palette preservation. The original blue Buy/allocation palette does not need changing.
7. **Settings:** tests exercise pointer selection, native arrow/Space keyboard interaction, switch-style activation, checked state, storage preservation, reload and the root attribute before the first app content appears. Physical switch-device and screen-reader testing remain manual because PS-19/hardware are not present in this branch.

Completed checks (Edge/Chromium, desktop 1440px and mobile 390px):

- Production Angular build passes. Existing component stylesheet warning budgets remain exceeded, below the error budgets.
- Full frontend unit suite: **310 passed**. A subsequent run of the 11 palette/preference/source-audit tests passes after the final hover fixes. The source audit also rejects malformed nested token references.
- Targeted browser suite: **10 passed**. Covers both Settings pages, pre-render restoration, native controls, primary-action/Buy hover, resolved SVG line/gradient paint, loss dashes, stable chart geometry, selection, live updates and resize.
- Rendered contrast audit: **822 text-instance checks, zero failures across the two safe modes**, on both Settings and Overview pages with loaded charts. Off retains the inherited exceptions described above; this is not a complete audit of every application state.
- Before/after screenshots use identical deterministic market fixtures and fallback fonts with external font requests blocked. Normal and protanopia/deuteranopia/tritanopia screenshots were inspected for both safe modes. A browser simulation and a numeric colour-distance threshold are complementary approximations, not tests with affected users.
- Native radio focus/checked states, keyboard arrows/Space, pointer input, mobile wrapping, safe-mode Buy hover and order-dialog text contrast were exercised. Complete screen-reader announcements, physical switch scanning, all disabled/error combinations and production-font rendering still need manual validation.

## Main file groups

| Files | Change |
| --- | --- |
| `public/theme-tokens.css` | Central default palette, safe palettes, semantic aliases and complementary chart cues |
| `src/app/colour-mode-preferences.ts`, `colour-mode.ts`, `accessibility.ts`, `app.config.ts` | Shared validation, PS-17 persistence and startup registration |
| `scripts/build-colour-bootstrap.mjs`, `public/colour-mode-init.js`, `src/index.html`, `package.json` | Generated pre-render initialization and stylesheet loading |
| `src/app/accessibility-settings.ts` | Shared native three-option Settings control |
| `src/app/theme-colours.ts`, `app.ts` | Canvas token resolution and mode-observer cleanup |
| `portfolio-chart.ts`, `stock-svg-chart.ts`, `stock-chart-math.ts`, `advanced-chart.html`, `stock-dashboard.component.css` | SVG/Tailwind token bindings, accessible performance text and safe loss styles |
| Existing login, dashboard, allocation, account, activity, order, profile, toast and global style files | Exact default-colour migration to centralized tokens |
| `tests/colour-*`, updated chart tests, `e2e/colour-*`, `e2e/stock-dashboard.spec.mjs` | Preference, contrast, simulation, source and browser regression coverage |

Validation commands:

```powershell
npm run build --prefix frontend
node --test --test-concurrency=1 frontend/tests/*.test.mjs
cd frontend
npx playwright test e2e/colour-mode.spec.mjs e2e/buy-button.spec.mjs e2e/stock-dashboard.spec.mjs --project=NextTrade
```

The build retains stylesheet-size warnings below the error budgets; no budgets or coverage thresholds were relaxed. Run browser tests and the full unit suite sequentially on memory-constrained development machines. Complete WCAG 2.2 AA conformance requires an application-wide audit, real assistive-technology checks and resolution of the preserved Off-mode exceptions above.
