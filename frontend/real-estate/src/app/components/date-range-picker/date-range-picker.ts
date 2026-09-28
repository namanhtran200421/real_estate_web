import {
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { WEEKDAYS, addDaysIso, nightsBetween } from '../../shared/dates';

export interface DateRange {
  checkIn: string;
  checkOut: string;
}

interface DayCell {
  date: string;
  day: number;
  label: string;
  /** Not choosable now (past, booked, or outside the stay that can be chosen). Still focusable. */
  disabled: boolean;
  selected: boolean;
  classes: string;
  tabIndex: number;
}

interface MonthView {
  key: string;
  label: string;
  blanks: number[];
  days: DayCell[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Arrow keys move one day or one week, like every calendar widget. */
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

const MONTHS_SHOWN = 2;

/**
 * Picks a stay on a calendar that shows which dates are taken.
 *
 * First click: check-in. Second click: check-out; only dates that make a valid stay are offered
 * (no booked night in between, at most `maxNights`). The first booked date after check-in is
 * still allowed as check-out, because the guest leaves that morning.
 */
@Component({
  selector: 'app-date-range-picker',
  imports: [DatePipe, TranslocoPipe],
  templateUrl: './date-range-picker.html',
})
export class DateRangePicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  private readonly ariaDate = new Intl.DateTimeFormat(inject(LOCALE_ID), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  /** ISO dates whose night cannot be booked. */
  readonly unavailableDates = input<string[]>([]);
  readonly checkIn = input('');
  readonly checkOut = input('');
  /** First date that can be chosen (today). */
  readonly minDate = input.required<string>();
  /** Last date that can be chosen. */
  readonly maxDate = input.required<string>();
  readonly maxNights = input.required<number>();

  readonly rangeChange = output<DateRange>();

  private readonly unavailable = computed(() => new Set(this.unavailableDates()));

  /** First visible month, counted from the month of `minDate`. Starts on the chosen check-in's month. */
  protected readonly offset = linkedSignal({
    source: this.minDate,
    computation: (minDate) => {
      const checkIn = untracked(this.checkIn);
      if (!checkIn || checkIn < minDate) return 0;
      return this.monthIndex(checkIn, minDate);
    },
  });

  private readonly lastOffset = computed(() => this.monthIndex(this.maxDate(), this.minDate()) - (MONTHS_SHOWN - 1));

  protected readonly hovered = signal<string | undefined>(undefined);
  private readonly focusDate = linkedSignal(() => this.checkIn() || this.minDate());

  protected readonly choosingCheckOut = computed(() => !!this.checkIn() && !this.checkOut());
  protected readonly nights = computed(() => {
    if (!this.checkIn() || !this.checkOut()) return 0;
    return nightsBetween(this.checkIn(), this.checkOut());
  });

  /** While choosing check-out: the latest date that still makes a valid stay. */
  protected readonly lastCheckOut = computed(() => {
    const checkIn = this.checkIn();
    if (!checkIn || this.checkOut()) return undefined;

    let limit = addDaysIso(checkIn, this.maxNights());
    if (limit > this.maxDate()) limit = this.maxDate();
    for (let date = addDaysIso(checkIn, 1); date < limit; date = addDaysIso(date, 1)) {
      if (this.unavailable().has(date)) return date;
    }
    return limit;
  });

  protected readonly months = computed<MonthView[]>(() => {
    const views = Array.from({ length: MONTHS_SHOWN }, (_, i) => this.monthView(this.offset() + i));
    this.assignTabStop(views);
    return views;
  });

  protected readonly weekdays = WEEKDAYS;
  protected readonly canGoBack = computed(() => this.offset() > 0);
  protected readonly canGoForward = computed(() => this.offset() < this.lastOffset());

  protected previous(): void {
    this.offset.update((offset) => Math.max(0, offset - 1));
  }

  protected next(): void {
    this.offset.update((offset) => Math.min(this.lastOffset(), offset + 1));
  }

  protected clear(): void {
    this.rangeChange.emit({ checkIn: '', checkOut: '' });
  }

  protected select(cell: DayCell): void {
    if (cell.disabled) return;
    this.focusDate.set(cell.date);
    const lastCheckOut = this.lastCheckOut();
    if (this.choosingCheckOut() && lastCheckOut && cell.date > this.checkIn() && cell.date <= lastCheckOut) {
      this.rangeChange.emit({ checkIn: this.checkIn(), checkOut: cell.date });
      return;
    }
    this.rangeChange.emit({ checkIn: cell.date, checkOut: '' });
  }

  protected onKeydown(event: KeyboardEvent, date: string): void {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();

    let target = addDaysIso(date, step);
    if (target < this.minDate()) target = this.minDate();
    if (target > this.maxDate()) target = this.maxDate();
    this.focusDate.set(target);

    // Keep the focused date on screen.
    const index = this.monthIndex(target, this.minDate());
    if (index < this.offset()) this.offset.set(index);
    if (index > this.offset() + MONTHS_SHOWN - 1) this.offset.set(index - MONTHS_SHOWN + 1);

    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  /** Months between the month of `from` and the month of `date`. */
  private monthIndex(date: string, from: string): number {
    const months = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
    return months(date) - months(from);
  }

  private monthView(offset: number): MonthView {
    const minDate = this.minDate();
    const first = new Date(Date.UTC(Number(minDate.slice(0, 4)), Number(minDate.slice(5, 7)) - 1 + offset, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth();
    const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    return {
      key: `${year}-${pad(month + 1)}`,
      label: this.transloco.translate('calendar.monthYear', {
        month: this.transloco.translate(`calendar.months.${month + 1}`),
        year,
      }),
      blanks: Array.from({ length: (first.getUTCDay() + 6) % 7 }, (_, i) => i),
      days: Array.from({ length: count }, (_, i) => this.dayCell(`${year}-${pad(month + 1)}-${pad(i + 1)}`)),
    };
  }

  private dayCell(date: string): DayCell {
    const checkIn = this.checkIn();
    const checkOut = this.checkOut();
    const lastCheckOut = this.lastCheckOut();
    const booked = this.unavailable().has(date);
    const outOfRange = date < this.minDate() || date > this.maxDate();

    const isStart = date === checkIn;
    const isEnd = date === checkOut;
    let rangeEnd = checkOut;
    const hovered = this.hovered();
    if (this.choosingCheckOut() && hovered && lastCheckOut && hovered > checkIn && hovered <= lastCheckOut) rangeEnd = hovered;
    const inRange = !!checkIn && !!rangeEnd && date > checkIn && date < rangeEnd;
    const hoverEnd = !checkOut && date === rangeEnd;

    // A valid check-out while choosing one; otherwise any free date starts a new stay.
    const validCheckOut = this.choosingCheckOut() && !!lastCheckOut && date > checkIn && date <= lastCheckOut;
    let disabled = outOfRange || booked;
    if (validCheckOut) disabled = false;
    if (this.choosingCheckOut() && lastCheckOut && date > lastCheckOut) disabled = true;

    let status = 'available';
    if (booked) status = 'booked';
    if (booked && validCheckOut) status = 'checkOutAllowed';
    if (outOfRange) status = 'unavailable';
    if (isStart) status = 'checkIn';
    if (isEnd) status = 'checkOut';

    let classes = 'border border-border bg-card text-foreground hover:border-accent-deep';
    if (disabled) classes = 'cursor-default text-muted-foreground/40';
    if (disabled && booked && !outOfRange) classes = 'cursor-default bg-muted text-muted-foreground/60 line-through';
    if (inRange) classes = 'border border-accent bg-accent-muted text-foreground';
    if (hoverEnd) classes = 'border border-accent-deep bg-accent-muted text-foreground';
    if (isStart || isEnd) classes = 'bg-foreground font-medium text-background';

    return {
      date,
      day: Number(date.slice(8, 10)),
      label: `${this.ariaDate.format(new Date(`${date}T00:00:00Z`))}, ${this.transloco.translate(`picker.day.${status}`)}`,
      disabled,
      selected: isStart || isEnd,
      classes,
      tabIndex: -1,
    };
  }

  /** One day is reachable with Tab (roving tabindex): the focused date if visible, else the first visible choosable day. */
  private assignTabStop(views: MonthView[]): void {
    const days = views.flatMap((view) => view.days);
    const stop =
      days.find((day) => day.date === this.focusDate()) ??
      days.find((day) => !day.disabled) ??
      days[0];
    if (stop) stop.tabIndex = 0;
  }
}
