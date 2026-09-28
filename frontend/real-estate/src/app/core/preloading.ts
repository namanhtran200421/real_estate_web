import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';

/**
 * Fetches the other lazy pages in the background once the first page is up, so navigation is
 * instant, except routes marked `data: { preload: false }`: the owner's admin area, which guests
 * never open, is downloaded only by whoever visits it.
 */
@Injectable({ providedIn: 'root' })
export class GuestPagesPreloading implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.data?.['preload'] === false) return EMPTY;
    return load();
  }
}
