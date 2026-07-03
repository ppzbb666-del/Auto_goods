# Dianxiaomi Edit Queue

This project does not need a separate product collection system.

Dianxiaomi remains the source of truth for collected products. The automation layer only records a Dianxiaomi product/edit page reference, checks whether it satisfies Temu listing requirements, creates required edit suggestions, and then drives safe browser automation inside Dianxiaomi.

Media handling follows the same rule: use Dianxiaomi native tools for image translation, white-background processing, image editor review, and batch resize/format normalization. The project tracks whether those steps are needed or confirmed; it does not build a parallel image-processing pipeline unless a later task explicitly requires one.

Image requirements are now typed by Dianxiaomi image surface:

- `mainImage`
- `detailImage`
- `skuImage`

Each type can define minimum count, fixed width/height, maximum file size, whether one-click image translation is expected, whether white background is expected, whether size normalization is expected, and which native Dianxiaomi tools should prove completion. Typed image stats are optional in snapshots; if they are missing, they do not block unattended automation unless that image type is explicitly marked `required`.

Typed image stats are extracted in both paths that can admit or calibrate products: the browser extension content script and the Playwright snapshot tool. The extractor uses local image context only, so a nearby SKU/detail block should not make all images look like SKU/detail images. The latest real product calibration read `mainImage=1`, `detailImage=4`, and `skuImage=31` from the user-provided Dianxiaomi Temu edit page without clicking media tools.

Real-page media buttons are handled conservatively. Diagnosis may show page-level buttons such as one-click translation or image check as candidates, but selector config generation does not promote them into executable media selectors on a real Dianxiaomi page until media-action sampling confirms the click opens a closeable tool surface. If the entry is an instant page action such as `一键翻译` or `图片检测`, calibration records `instant-action-blocked` and does not click it. This prevents a one-click page action from entering the unattended path before it is proven safe.

Description handling is also conservative. If a real Dianxiaomi page already has a module/image description preview, the automation preserves it and treats description as accepted instead of requiring a direct text editor. Selector config keeps `fields.description` empty in this case because there is no safe direct text field to fill.

## Workflow

1. Use Dianxiaomi to collect products into its collection box or product library.
2. Open the Dianxiaomi collected/product edit page.
3. Click the browser extension button to add the current item to the edit queue.
4. The server stores a `DianxiaomiProductWorkItem` with:
   - source page URL and title
   - detected image/SKU/price/stock/attribute surface
   - detected image dimensions, optional typed image stats, and Dianxiaomi media-tool signals
   - requirement checks
   - suggested required/recommended edits
5. Dashboard creates an edit task only when needed.
6. Playwright opens the Dianxiaomi URL and modifies fields according to the task.
7. Safe gates still apply: dry-run first, then fill draft, then save draft. The system never publishes directly by default.

## Product Source Rule

Do not rebuild a parallel product source from scraped page data unless it is only metadata for checks or automation targeting. Original product information should stay in Dianxiaomi.

## Current Implementation

- Shared model: `DianxiaomiProductWorkItem`
- API:
  - `GET /dianxiaomi/product-work-items`
  - `POST /dianxiaomi/product-work-items`
  - `POST /dianxiaomi/product-work-items/:id/task`
- Extension button uploads a work item, not a standalone collected product.
- Dashboard shows the edit queue and can create an edit task.
- Requirement rules include media checks for image translation, target image size, white background review, and Dianxiaomi image editor review.
- Requirement rules also include per-image-type checks for `mainImage`, `detailImage`, and `skuImage`, using Dianxiaomi native image translation and resize tools as the preferred completion path.
- Extension queue admission and Playwright calibration now populate `snapshot.imageTypeStats` when visible product images can be classified.
- Current real-page follow-up: executable white-background/image-editor/batch-resize selectors remain gated until safe media-action sampling proves them. The sampled page exposes `一键翻译` and `图片检测` as instant actions, not dialog tools.
- Legacy `/dianxiaomi/collected-products` endpoints remain for compatibility.
