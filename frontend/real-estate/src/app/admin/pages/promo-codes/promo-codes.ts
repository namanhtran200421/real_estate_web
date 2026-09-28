import { Component, inject, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ApiError, toApiError } from '../../../core/api';
import { AdminApiService } from '../../admin-api.service';
import { PromoCode, PromoCodeInput } from '../../admin.types';

interface PromoForm {
  code: string;
  kind: 'percent' | 'amount';
  value: number;
  maxRedemptions: number;
  minNights: number;
  validFrom: string;
  validUntil: string;
  description: string;
}

const EMPTY: PromoForm = {
  code: '',
  kind: 'percent',
  value: 10,
  maxRedemptions: 1,
  minNights: 1,
  validFrom: '',
  validUntil: '',
  description: '',
};

@Component({
  selector: 'app-admin-promo-codes',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './promo-codes.html',
})
export class AdminPromoCodes {
  private readonly api = inject(AdminApiService);

  protected readonly codes = resource({ loader: () => this.api.promoCodes() });
  protected readonly form = signal<PromoForm>({ ...EMPTY });
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);

  protected set(field: keyof PromoForm, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    let value: string | number = target.value;
    if (target.type === 'number') value = Number(target.value);
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await action();
      this.codes.reload();
      return true;
    } catch (error) {
      this.error.set(toApiError(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async create(): Promise<void> {
    const form = this.form();
    const input: PromoCodeInput = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      maxRedemptions: form.maxRedemptions,
      minNights: form.minNights,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
      isActive: true,
    };
    if (form.kind === 'percent') input.discountPercent = form.value;
    else input.discountAmount = form.value;

    const created = await this.run(() => this.api.createPromoCode(input));
    if (created) this.form.set({ ...EMPTY });
  }

  /** Turns a code off (or back on) without changing anything else. */
  protected toggle(promo: PromoCode): void {
    void this.run(() =>
      this.api.updatePromoCode(promo.code, {
        description: promo.description ?? undefined,
        discountPercent: promo.discountPercent ?? undefined,
        discountAmount: promo.discountAmount ?? undefined,
        maxRedemptions: promo.maxRedemptions,
        minNights: promo.minNights,
        validFrom: promo.validFrom ?? undefined,
        validUntil: promo.validUntil ?? undefined,
        isActive: !promo.isActive,
      }),
    );
  }
}
