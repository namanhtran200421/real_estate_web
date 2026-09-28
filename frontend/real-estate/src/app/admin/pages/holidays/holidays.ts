import { Component, inject, resource, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toApiError } from '../../../core/api';
import { AdminApiService } from '../../admin-api.service';

/** Holiday dates: nights on them use the holiday price and get no long-stay discount. */
@Component({
  selector: 'app-admin-holidays',
  imports: [DatePipe],
  template: `
    <h1 class="text-4xl">Ngày lễ</h1>
    <p class="mt-2 max-w-2xl text-muted-foreground">
      Đêm vào các ngày này tính giá ngày lễ. Hãy thêm các ngày lễ âm lịch (Tết, Giỗ Tổ Hùng Vương)
      và ngày nghỉ bù của từng năm.
    </p>

    <div class="mt-8 flex items-center gap-3">
      <button type="button" class="icon-btn" aria-label="Năm trước" (click)="year.set(year() - 1)">←</button>
      <span class="font-serif text-2xl">{{ year() }}</span>
      <button type="button" class="icon-btn" aria-label="Năm sau" (click)="year.set(year() + 1)">→</button>
    </div>

    <form class="card mt-6 grid max-w-2xl gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" (submit)="$event.preventDefault(); add()">
      <div>
        <label class="label" for="holiday-date">Ngày</label>
        <input id="holiday-date" class="input" type="date" [value]="date()" (input)="date.set(value($event))" />
      </div>
      <div>
        <label class="label" for="holiday-name">Tên</label>
        <input id="holiday-name" class="input" type="text" maxlength="100" placeholder="Tết Nguyên Đán" [value]="name()" (input)="name.set(value($event))" />
      </div>
      <button type="submit" class="btn btn-primary" [disabled]="busy() || !date() || !name().trim()">Thêm</button>
    </form>

    @if (error(); as message) {
      <p class="mt-4 text-sm text-accent-deep" role="alert">{{ message }}</p>
    }

    @if (holidays.hasValue()) {
      @if (holidays.value().length) {
        <ul class="mt-8 max-w-2xl divide-y divide-border rounded-lg border border-border bg-card">
          @for (h of holidays.value(); track h.date) {
            <li class="flex items-center justify-between gap-4 px-5 py-3">
              <span><span class="inline-block w-36">{{ h.date | date: 'EEE dd/MM/yyyy' }}</span> {{ h.name }}</span>
              <button type="button" class="link text-sm" [disabled]="busy()" (click)="remove(h.date)">Xoá</button>
            </li>
          }
        </ul>
      } @else {
        <p class="mt-8 text-muted-foreground">Chưa có ngày lễ nào trong năm {{ year() }}.</p>
      }
    }
  `,
})
export class AdminHolidays {
  private readonly api = inject(AdminApiService);

  protected readonly year = signal(new Date().getFullYear());
  protected readonly date = signal('');
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly holidays = resource({
    params: () => this.year(),
    loader: ({ params }) => this.api.holidays(params),
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await action();
      this.holidays.reload();
      return true;
    } catch (error) {
      this.error.set(toApiError(error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async add(): Promise<void> {
    const saved = await this.run(() => this.api.saveHoliday({ date: this.date(), name: this.name().trim() }));
    if (!saved) return;
    this.year.set(Number(this.date().slice(0, 4)));
    this.date.set('');
    this.name.set('');
  }

  protected remove(date: string): void {
    void this.run(() => this.api.removeHoliday(date));
  }
}
