# VN Booking Hub design context

The storefront presents one real Da Lat apartment to guests who need to understand the space, price and booking steps quickly on a phone. Keep owner administration visually consistent while prioritizing clear data entry.

## Visual system

- Source of truth: `frontend/real-estate/src/styles.css` `@theme` tokens. Background `#fafaf8`, foreground `#1a1a1a`, card `#ffffff`, muted surface `#f5f3f0`, brand gold `#ddb37f`, readable gold text and focus `#8a612e`.
- Display: Playfair Display for property names and section headings. Body: Source Sans 3. Utility labels: IBM Plex Mono with restrained letter spacing.
- Layout: quiet editorial sections, thin dividers, real apartment photography and compact price summaries. Use the logo gold for actions and small emphasis, leaving photos to carry the page.
- Motion: gentle image transitions and brief UI feedback. Respect reduced motion. Never move controls while data loads.

## Product behavior

- Vietnamese lives at `/`; English lives at `/en`. Site labels and the Sun Garden listing both need English copy. Keep prices and availability sourced from the API in either language.
- Use real listing facts and verified guest reviews. The review panel stays in an honest empty state until a customer submits feedback from a completed booking; the booking reference and contact detail unlock the form.
- Photo navigation is manual, with accessible buttons on either side of the image. Reduced motion disables the slide transition.
- The apartment page leads with what a guest decides on: photos, then the facts, description, amenities, rules and prices beside the booking card. Location and reviews follow.
- Home uses a compact invitation with two offset photo prints linking to the same apartment page as the main navigation. Use real apartment photos with ivory mats and fine gold accents. Keep the full room tour on the apartment page instead of repeating it on Home.
- New accommodation facts belong in the owner listing or its content migration; location lists should use a consistent journey-time order.
