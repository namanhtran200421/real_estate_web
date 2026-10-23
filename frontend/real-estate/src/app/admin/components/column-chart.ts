import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** One column: `label` sits under the axis, `detail` and `display` show in the tooltip and table. */
export interface ChartPoint {
  key: string;
  label: string;
  detail: string;
  value: number;
  display: string;
}

const HEIGHT = 240;
const MARGIN = { top: 28, right: 8, bottom: 30, left: 52 };
const BAR_MAX = 24;
const RADIUS = 4;
/** Below this band width every other month label is hidden so they never collide. */
const MIN_LABEL_BAND = 30;
/** Room a short cap label ("10,2 tr", "100%") needs on each side of its column. */
const CAP_HALF_WIDTH = 26;

/** Emphasis form: the highlighted column in the accent, the rest as context. Validated pair. */
const EMPHASIS = '#8a612e';
const CONTEXT = '#9a9187';

/** 0, 1, 2, 2.5, 5 × 10ⁿ: the step that gives about four clean gridlines. */
function niceStep(max: number): number {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((multiple) => multiple * magnitude >= rough) ?? 10;
  return step * magnitude;
}

/**
 * Single-series column chart in inline SVG (no chart library): thin columns with 4px rounded
 * tops on one baseline, hairline gridlines, one emphasized column with its value on the cap, a
 * hover/focus tooltip per column, and the same numbers as a table for screen readers and anyone
 * who prefers it. Laid out in real pixels (measured), so text never scales with the width.
 */
@Component({
  selector: 'app-column-chart',
  template: `
    <!-- The SVG is taken out of the flow so it follows the frame's width instead of setting it. -->
    <div #frame class="relative w-full" [style.height.px]="height">
      <svg
        [attr.width]="width()"
        [attr.height]="height"
        role="img"
        [attr.aria-label]="label()"
        class="absolute inset-0 overflow-visible"
      >
        @for (tick of layout().ticks; track tick.value) {
          <line
            [attr.x1]="margin.left"
            [attr.x2]="width() - margin.right"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
            stroke="#e8e4df"
            stroke-width="1"
          />
          <text
            [attr.x]="margin.left - 8"
            [attr.y]="tick.y"
            dy="0.32em"
            text-anchor="end"
            class="fill-muted-foreground text-[11px] tabular-nums"
          >
            {{ tick.text }}
          </text>
        }

        @for (bar of layout().bars; track bar.point.key; let i = $index) {
          @if (bar.path) {
            <path
              [attr.d]="bar.path"
              [attr.fill]="bar.highlight ? emphasis : context"
              [attr.opacity]="active() === i ? 0.75 : 1"
            />
          }
          @if (bar.showLabel) {
            <text
              [attr.x]="bar.cx"
              [attr.y]="height - margin.bottom + 18"
              text-anchor="middle"
              class="text-[11px]"
              [class.fill-foreground]="bar.highlight"
              [class.font-semibold]="bar.highlight"
              [class.fill-muted-foreground]="!bar.highlight"
            >
              {{ bar.point.label }}
            </text>
          }
          @if (bar.highlight && !empty()) {
            <!-- Compact value on the cap (full value in the tooltip and table), kept inside the plot -->
            <text
              [attr.x]="bar.capX"
              [attr.y]="bar.capY"
              [attr.text-anchor]="bar.capAnchor"
              class="fill-foreground text-[12px] font-semibold"
            >
              {{ tickFormat()(bar.point.value) }}
            </text>
          }
          <!-- Hit area: the whole column band, bigger than the mark; keyboard reachable -->
          <rect
            [attr.x]="bar.cx - layout().band / 2"
            [attr.y]="margin.top"
            [attr.width]="layout().band"
            [attr.height]="height - margin.top - margin.bottom"
            fill="transparent"
            tabindex="0"
            [attr.aria-label]="bar.point.detail + ': ' + bar.point.display"
            class="cursor-default outline-none focus-visible:stroke-ring focus-visible:stroke-2"
            (pointerenter)="active.set(i)"
            (pointerleave)="active.set(undefined)"
            (focus)="active.set(i)"
            (blur)="active.set(undefined)"
          />
        }
        <line
          [attr.x1]="margin.left"
          [attr.x2]="width() - margin.right"
          [attr.y1]="layout().zero"
          [attr.y2]="layout().zero"
          stroke="#d6d0c8"
          stroke-width="1"
        />
      </svg>

      @if (empty()) {
        <p class="absolute inset-x-0 top-1/3 text-center text-sm text-muted-foreground">
          Chưa có số liệu
        </p>
      }

      @if (tooltip(); as tip) {
        <div
          class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full w-max max-w-[min(18rem,calc(100vw-4rem))] whitespace-normal rounded-md border border-border bg-card px-3 py-2 shadow-md"
          [style.left.px]="tip.x"
          [style.top.px]="tip.y"
          role="status"
        >
          <p class="text-sm font-semibold">{{ tip.point.display }}</p>
          <p class="text-xs text-muted-foreground">{{ tip.point.detail }}</p>
        </div>
      }
    </div>

    <details class="mt-4 text-sm">
      <summary class="cursor-pointer text-muted-foreground hover:text-foreground">
        Xem bảng số liệu
      </summary>
      <table class="mt-3 w-full">
        <caption class="sr-only">
          {{
            label()
          }}
        </caption>
        <tbody class="divide-y divide-border">
          @for (point of points(); track point.key) {
            <tr>
              <th scope="row" class="py-1.5 text-left font-normal text-muted-foreground">
                {{ point.detail }}
              </th>
              <td class="py-1.5 text-right tabular-nums">{{ point.display }}</td>
            </tr>
          }
        </tbody>
      </table>
    </details>
  `,
})
export class ColumnChart {
  readonly points = input.required<ChartPoint[]>();
  /** Key of the column to emphasize (usually the current month). */
  readonly highlight = input<string>();
  /** Accessible name, e.g. "Doanh thu 12 tháng gần nhất". */
  readonly label = input.required<string>();
  /** Fixed top of the scale (100 for percentages); otherwise rounded up from the data. */
  readonly max = input<number>();
  /** Smallest meaningful axis interval (1 for whole VND). */
  readonly minStep = input(0);
  /** Gridline label, e.g. 1500000 → "1,5 tr". */
  readonly tickFormat = input<(value: number) => string>((value) => String(value));

  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly emphasis = EMPHASIS;
  protected readonly context = CONTEXT;

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  protected readonly width = signal(640);
  protected readonly active = signal<number | undefined>(undefined);

  protected readonly empty = computed(() => this.points().every((point) => point.value === 0));

  protected readonly layout = computed(() => {
    const points = this.points();
    const width = this.width();
    const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 1);
    const plotBottom = HEIGHT - MARGIN.bottom;
    const plotHeight = plotBottom - MARGIN.top;

    const dataMax = Math.max(0, ...points.map((point) => point.value));
    const dataMin =
      this.max() === undefined ? Math.min(0, ...points.map((point) => point.value)) : 0;
    const step = Math.max(this.minStep(), niceStep(this.max() ?? (dataMax - dataMin || 1)));
    const bottom = Math.floor(dataMin / step) * step;
    const top = this.max() ?? Math.max(bottom + step, Math.ceil(dataMax / step) * step);
    const y = (value: number) =>
      plotBottom -
      ((Math.max(bottom, Math.min(value, top)) - bottom) / (top - bottom)) * plotHeight;
    const zero = y(0);

    const ticks = [];
    for (let value = bottom; value <= top + step / 2; value += step) {
      ticks.push({ value, y: Math.round(y(value)) + 0.5, text: this.tickFormat()(value) });
    }

    const band = plotWidth / Math.max(points.length, 1);
    const barWidth = Math.min(BAR_MAX, band * 0.6);
    const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_BAND / band));
    const bars = points.map((point, index) => {
      const cx = MARGIN.left + band * (index + 0.5);
      const barTop = y(point.value);
      const barHeight = Math.abs(zero - barTop);
      const highlight = point.key === this.highlight();
      let path = '';
      if (barHeight > 0.5) {
        const x = cx - barWidth / 2;
        const r = Math.min(RADIUS, barHeight, barWidth / 2);
        // Rounded value end, square at zero, including refund-only periods below the axis.
        path =
          point.value >= 0
            ? `M${x},${zero} V${barTop + r} Q${x},${barTop} ${x + r},${barTop} H${x + barWidth - r} Q${x + barWidth},${barTop} ${x + barWidth},${barTop + r} V${zero} Z`
            : `M${x},${zero} V${barTop - r} Q${x},${barTop} ${x + r},${barTop} H${x + barWidth - r} Q${x + barWidth},${barTop} ${x + barWidth},${barTop - r} V${zero} Z`;
      }
      const showLabel = highlight || (points.length - 1 - index) % labelEvery === 0;
      // Near either edge the cap label lines up with the bar's outer side instead of its middle.
      let capAnchor = 'middle';
      let capX = cx;
      if (cx + CAP_HALF_WIDTH > width - MARGIN.right) {
        capAnchor = 'end';
        capX = cx + barWidth / 2;
      } else if (cx - CAP_HALF_WIDTH < MARGIN.left) {
        capAnchor = 'start';
        capX = cx - barWidth / 2;
      }
      return {
        point,
        cx,
        top: barTop,
        capY: Math.max(
          14,
          Math.min(HEIGHT - MARGIN.bottom - 4, barTop + (point.value < 0 ? 16 : -8)),
        ),
        path,
        highlight,
        showLabel,
        capAnchor,
        capX,
      };
    });

    return { ticks, bars, band, zero };
  });

  protected readonly tooltip = computed(() => {
    const index = this.active();
    if (index === undefined) return undefined;
    const bar = this.layout().bars[index];
    if (!bar) return undefined;
    return {
      point: bar.point,
      x: Math.max(
        Math.min(this.width() / 2, 144),
        Math.min(this.width() - Math.min(this.width() / 2, 144), bar.cx),
      ),
      y: Math.min(bar.top, HEIGHT - MARGIN.bottom) - 12,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Browser only: measure the real width and follow resizes.
    afterNextRender(() => {
      const element = this.frame().nativeElement;
      this.width.set(element.clientWidth || 640);
      const observer = new ResizeObserver(() => this.width.set(element.clientWidth || 640));
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
