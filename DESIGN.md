# VN Booking Hub design context

The storefront presents one real Da Lat apartment to guests who need to understand the space, price and booking steps quickly on a phone. Keep owner administration visually consistent while prioritizing clear data entry.

## Visual system

- Source of truth: `frontend/real-estate/src/styles.css` `@theme` tokens. Background `#fafaf8`, foreground `#1a1a1a`, card `#ffffff`, muted surface `#f5f3f0`, brand gold `#ddb37f`, readable gold text and focus `#8a612e`.
- Display: Playfair Display for property names and section headings. Body: Source Sans 3. Utility labels: IBM Plex Mono with restrained letter spacing.
- Layout: quiet editorial sections, thin dividers, real apartment photography and compact price summaries. Use the logo gold for actions and small emphasis, leaving photos to carry the page.
- Motion: gentle image transitions and brief UI feedback. Respect reduced motion. Never move controls while data loads.

## Product behavior

- Vietnamese lives at `/`; English lives at `/en`. Site labels and the Sun Garden listing both need English copy. Keep prices and availability sourced from the API in either language.
- Use real listing facts and verified guest reviews. The review panel stays in an honest empty state until actual review content is available.
- Photo navigation uses buttons with accessible names, and the automatic slideshow pauses for reduced motion.
- New accommodation facts belong in the owner listing or its content migration; location lists should use a consistent journey-time order.
