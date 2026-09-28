import { Component, computed, inject, resource, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toApiError } from '../../../core/api';
import { AdminApiService } from '../../admin-api.service';

/** Contact form inbox. */
@Component({
  selector: 'app-admin-messages',
  imports: [DatePipe],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-4xl">Tin nhắn</h1>
      <label class="flex items-center gap-3 text-sm">
        <input type="checkbox" class="h-4 w-4 accent-accent-deep" [checked]="unhandledOnly()" (change)="toggleFilter()" />
        Chỉ tin chưa xử lý
      </label>
    </div>

    @if (error(); as message) {
      <p class="mt-4 text-sm text-accent-deep" role="alert">{{ message }}</p>
    }

    @if (messages.hasValue()) {
      @if (messages.value().items.length) {
        <ul class="mt-8 space-y-4">
          @for (m of messages.value().items; track m.id) {
            <li class="card" [class.opacity-60]="m.handledAt">
              <div class="flex flex-wrap items-baseline justify-between gap-4">
                <p>
                  <span class="font-medium">{{ m.name }}</span>
                  · <a class="link" [href]="'tel:' + m.phone">{{ m.phone }}</a>
                  @if (m.email) {
                    · <a class="link" [href]="'mailto:' + m.email">{{ m.email }}</a>
                  }
                </p>
                <span class="text-sm text-muted-foreground">{{ m.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ m.topic }}
                @if (m.apartmentName) {
                  · {{ m.apartmentName }}
                }
              </p>
              <p class="mt-4 whitespace-pre-line">{{ m.message }}</p>
              <button type="button" class="link mt-4 text-sm" (click)="setHandled(m.id, !m.handledAt)">
                @if (m.handledAt) {
                  Đánh dấu chưa xử lý
                } @else {
                  Đánh dấu đã xử lý
                }
              </button>
            </li>
          }
        </ul>
        <nav class="mt-6 flex items-center justify-between" aria-label="Phân trang">
          <button type="button" class="btn btn-outline" [disabled]="page() === 1" (click)="page.set(page() - 1)">← Trước</button>
          <span class="text-sm text-muted-foreground">Trang {{ page() }} / {{ pages() }}</span>
          <button type="button" class="btn btn-outline" [disabled]="page() >= pages()" (click)="page.set(page() + 1)">Sau →</button>
        </nav>
      } @else {
        <p class="mt-8 text-muted-foreground">Không có tin nhắn.</p>
      }
    } @else if (messages.isLoading()) {
      <p class="mt-8 text-muted-foreground" role="status">Đang tải…</p>
    }
  `,
})
export class AdminMessages {
  private readonly api = inject(AdminApiService);

  protected readonly unhandledOnly = signal(true);
  protected readonly page = signal(1);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly messages = resource({
    params: () => ({ unhandledOnly: this.unhandledOnly(), page: this.page() }),
    loader: ({ params }) => this.api.messages(params.unhandledOnly, params.page),
  });

  protected readonly pages = computed(() => {
    if (!this.messages.hasValue()) return 1;
    const { total, pageSize } = this.messages.value();
    return Math.max(1, Math.ceil(total / pageSize));
  });

  protected toggleFilter(): void {
    this.unhandledOnly.set(!this.unhandledOnly());
    this.page.set(1);
  }

  protected async setHandled(id: string, handled: boolean): Promise<void> {
    this.error.set(undefined);
    try {
      await this.api.setMessageHandled(id, handled);
      this.messages.reload();
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
