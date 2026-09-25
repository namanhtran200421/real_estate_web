// Vercel serverless entry: runs the Angular SSR server (built into dist/) for every
// request that isn't a static file, so pages arrive fully rendered instead of empty.
export default async function handler(req, res) {
  const { reqHandler } = await import('../dist/real-estate/server/server.mjs');
  return reqHandler(req, res);
}
