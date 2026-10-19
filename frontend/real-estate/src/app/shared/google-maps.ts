/**
 * The embedded Google Map, shared by the apartment and location pages.
 *
 * The map iframe is deferred, but its connections are opened as soon as a page with a map renders
 * (the links are in the server-rendered head), so the map appears quickly once it is created.
 */
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';

/** Origins the embed loads from: the page itself, then its scripts, tiles and data. */
const MAP_ORIGINS = ['https://www.google.com', 'https://maps.gstatic.com', 'https://maps.googleapis.com'];

/** The embed URL for a search query, e.g. an address. */
export function googleMapEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

/** Adds `preconnect` links for the map's origins once per document. Call from a constructor. */
export function preconnectGoogleMaps(): void {
  const document = inject(DOCUMENT);
  for (const origin of MAP_ORIGINS) {
    if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    // No crossorigin: the iframe and its scripts use ordinary (credentialed) connections.
    document.head.appendChild(link);
  }
}
