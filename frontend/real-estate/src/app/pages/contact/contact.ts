import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Select, SelectOption } from '../../components/select/select';
import { API_URL, ApiError, ApiErrorMessages, toApiError } from '../../core/api';
import { SITE } from '../../data/site';
import { ApartmentService } from '../../services/apartment.service';

interface ContactForm {
  name: string;
  phone: string;
  email: string;
  topic: string;
  apartmentSlug: string;
  message: string;
  /** Honeypot, hidden from people; bots fill it and are ignored by the API. */
  website: string;
}

@Component({
  selector: 'app-contact',
  imports: [RouterLink, TranslocoPipe, Select],
  templateUrl: './contact.html',
})
export class Contact {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly transloco = inject(TranslocoService);
  protected readonly errorMessages = inject(ApiErrorMessages);
  protected readonly contact = SITE.contact;
  private readonly apartments = inject(ApartmentService).all;

  /** The value is what the owner reads in the admin inbox, so it stays Vietnamese in every language. */
  protected readonly topicOptions: SelectOption[] = [
    { value: 'Đặt phòng', key: 'booking' },
    { value: 'Thông tin căn hộ', key: 'apartment' },
    { value: 'Thanh toán', key: 'payment' },
    { value: 'Hợp tác cho thuê', key: 'partnership' },
    { value: 'Khác', key: 'other' },
  ].map(({ value, key }) => ({ value, label: this.transloco.translate(`contact.topics.${key}`) }));

  protected readonly apartmentOptions = computed<SelectOption[]>(() =>
    this.apartments().map((a) => ({ value: a.slug, label: a.name })),
  );

  protected readonly form = signal<ContactForm>({
    name: '',
    phone: '',
    email: '',
    topic: 'Đặt phòng',
    apartmentSlug: '',
    message: '',
    website: '',
  });

  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);

  protected set<K extends keyof ContactForm>(field: K, value: ContactForm[K]): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  protected fromInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected fieldError(path: string): string | undefined {
    return this.errorMessages.field(this.error(), path);
  }

  protected async submit(): Promise<void> {
    this.sending.set(true);
    this.error.set(undefined);
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/api/v1/contact`, this.form()));
      this.sent.set(true);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.sending.set(false);
    }
  }
}
