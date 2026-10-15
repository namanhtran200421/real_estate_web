import { Component, computed, input } from '@angular/core';
import { DrawPathDirective } from '../../motion/draw-path.directive';
import { NearbyPlace } from '../../models/apartment';

/** Positions for nearby places around the apartment: alternating sides, evenly spaced per side. */
export function layoutPlaces(count: number, width = 640, height = 420) {
  const sides = [Math.ceil(count / 2), Math.floor(count / 2)];
  return Array.from({ length: count }, (_, i) => {
    const anchor: 'start' | 'end' = i % 2 === 0 ? 'start' : 'end';
    const slot = Math.floor(i / 2);
    const perSide = sides[i % 2];
    const y = 30 + ((height - 60) * (slot + 0.5)) / Math.max(perSide, 1);
    const x = anchor === 'start' ? width * 0.78 : width * 0.22;
    return { x, y, labelX: anchor === 'start' ? x + 14 : x - 14, anchor };
  });
}

/** The apartment at the centre, lines out to each nearby place with its journey time. */
@Component({
  selector: 'app-route-map',
  imports: [DrawPathDirective],
  templateUrl: './route-map.html',
})
export class RouteMap {
  readonly places = input.required<NearbyPlace[]>();
  readonly label = input.required<string>();
  protected readonly width = 640;
  protected readonly height = 420;
  protected readonly points = computed(() => layoutPlaces(this.places().length, this.width, this.height));
}
