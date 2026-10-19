// Site-wide details that belong to the owner, not to a single apartment.
// Wording (tagline, description, labels) lives in src/i18n/*.json under "site".
export const SITE = {
  name: 'VN Booking Hub',
  /** Fallback link-preview image for pages without their own photo. */
  defaultImage: '/apartments/sun-garden-a04-12/02.jpg',
  /** `label` is a translation key. */
  contact: [
    { label: 'site.contact.phone', value: '0869 141 104', href: 'tel:+84869141104' },
    { label: 'site.contact.zalo', value: '0919 8888 21', href: 'https://zalo.me/0919888821' },
    { label: 'site.contact.email', value: 'vnbookinghub@gmail.com', href: 'mailto:vnbookinghub@gmail.com' },
  ],
  /** Social profiles: footer icons and the Organization's `sameAs` in structured data. */
  social: [
    { name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61594604577939' },
    { name: 'TikTok', href: 'https://www.tiktok.com/@sammy.canhodalat' },
  ],
};
