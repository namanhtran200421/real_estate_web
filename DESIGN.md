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
- The apartment page leads with what a guest decides on: the photo, then the facts, description, amenities, rules and prices beside the booking card, then reviews. Photos room by room live on Gallery and the Google map with the address on Location, reached through the apartment pages' section tabs and the footer (not the header, which stays at four links). Gallery and Location show only the tabs above their own title, never the apartment's title block again. The journey-time map of nearby places lives on Home and links to Location for directions.
- Each section lives on one page only. Other pages lead to it through navigation or a link (Home's room photos open Gallery at that room) instead of repeating it. Booking is offered by the header's button and the apartment page's booking card, not by a closing band on every page.
- Home invites to the apartment with two room photos at most, set straight on the grid, each opening that room in Gallery, beside the heading, one line and a button to the apartment page. No tilted prints, mats, label above the heading, circle arrow button or decorative ridge shapes.
- New accommodation facts belong in the owner listing or its content migration; location lists should use a consistent journey-time order.
