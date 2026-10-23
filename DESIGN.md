# VN Booking Hub design context

The storefront presents one real Da Lat apartment to guests who need to understand the space, price and booking steps quickly on a phone. Keep owner administration visually consistent while prioritizing clear data entry.

## Visual system

- Source of truth: `frontend/real-estate/src/styles.css` `@theme` tokens. Guest background `#f6f1e8`, foreground `#11305a`, card `#fffdf8`, muted surface `#ece4d6`, brand gold `#ddb37f`, readable gold text and focus `#7a5426`. Owner administration retains its scoped neutral palette in `src/app/admin/admin-theme.css`.
- Guest display: the self-hosted Fraunces face for property names and section headings. Body: the system sans-serif stack. Utility labels: the system monospace stack with restrained letter spacing. Owner administration retains its scoped typography overrides. These values reconcile this document's stale guest values with the canonical runtime; they introduce no token changes.
- Layout: quiet editorial sections, thin dividers, real apartment photography and compact price summaries. Use the logo gold for actions and small emphasis, leaving photos to carry the page.
- Motion: gentle image transitions and brief UI feedback. Respect reduced motion. Never move controls while data loads.
- Guest startup: the existing logo mark, serif wordmark and one indeterminate gold hairline on ivory. On each initial guest document, a three-second brand showcase lets the page render and fetch its photos and fonts underneath. Dismissal waits for application and page-asset readiness after that minimum, with an independent four-second escape if loading stalls. A ready page enters through two ivory curtains opening from the centre; the home photo settles from a slight zoom, headline lines rise in sequence, then navigation, price and booking action arrive. This reveal finishes within 1.6 seconds without blocking interaction. It stays hidden without JavaScript and on owner routes, never replays on client-side navigation, and skips the entrance under reduced motion or failed startup.

## Product behavior

- Vietnamese lives at `/`; English lives at `/en`. Site labels and the Sun Garden listing both need English copy. Keep prices and availability sourced from the API in either language.
- Use real listing facts and verified guest reviews. The review panel stays in an honest empty state until a customer submits feedback from a completed booking; the booking reference and contact detail unlock the form.
- Photo navigation is manual, with accessible buttons on either side of the image. Reduced motion disables the slide transition.
- The apartment page leads with what a guest decides on: the photo, then the facts, description, amenities, rules and prices beside the booking card, then reviews. Photos room by room live on Gallery and the Google map with the address on Location, reached through the apartment pages' section tabs and the footer (not the header, which stays at four links). Gallery and Location show only the tabs above their own title, never the apartment's title block again. The journey-time map of nearby places lives on Home and links to Location for directions.
- Each full section lives on one page only. Home also gives a brief capacity overview beside an arched living-room photo: the guest label carries the asterisk, the value shows the listing's standard guest count with `+`, and a small note links to the published additional-guest rule. The full room tour and amenities remain on their own pages. Other pages lead to them through navigation or a link (Home's room photos open Gallery at that room). Booking is offered by the header's button and the apartment page's booking card, not by a closing band on every page.
- Home invites to the apartment with two room photos at most, set straight on the grid, each opening that room in Gallery, beside the heading, one line and a button to the apartment page. No tilted prints, mats, label above the heading, circle arrow button or decorative ridge shapes.
- New accommodation facts belong in the owner listing or its content migration; location lists should use a consistent journey-time order.

## Mobile application layout

- Below 768px, guest pages, owner administration and sign-in share centered headings, body text, labels, field values and feedback. `frontend/real-estate/src/mobile.css` owns this responsive contract; desktop typography, alignment and palettes continue to use their existing owners.
- Content rows opt into `mobile-stack`; action/chip groups use `mobile-center`. Stack label/value pairs with a compact internal gap. Keep calendars, carousel tracks, progress connectors and pagination in their working layouts. Center scrollable tabs safely so the first item stays reachable.
- The apartment editor uses the admin neutral/gold theme, clear bordered sections and a persistent save bar. Identity and photos precede prices and operational settings. Photo selection shows real previews, editable descriptions, cover choice and keyboard-accessible ordering controls.
