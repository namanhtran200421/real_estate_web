/** True when the element's top is already above `fraction` of the viewport (never animate what is visible). */
export function inView(el: Element, fraction = 0.85): boolean {
  return el.getBoundingClientRect().top < window.innerHeight * fraction;
}
