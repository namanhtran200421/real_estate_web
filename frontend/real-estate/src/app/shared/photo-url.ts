/** Uploaded photos live on the API host; bundled listing assets stay on the website. */
export function photoUrl(src: string, apiUrl: string): string {
  return src.startsWith('/api/v1/apartments/photos/') ? `${apiUrl}${src}` : src;
}
