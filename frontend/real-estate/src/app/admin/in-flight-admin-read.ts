/** Share concurrent reads only. Completed results are never cached or shared across sessions. */
export class InFlightAdminRead<T> {
  private pending?: { session: string | undefined; request: Promise<T> };

  run(session: string | undefined, load: () => Promise<T>): Promise<T> {
    if (this.pending && this.pending.session === session) return this.pending.request;
    const request = load();
    const pending = { session, request };
    this.pending = pending;
    const clear = () => {
      if (this.pending === pending) this.pending = undefined;
    };
    void request.then(clear, clear);
    return request;
  }

  /** A successful write makes even an older in-flight read unsuitable for the next refresh. */
  invalidate(): void {
    this.pending = undefined;
  }
}
