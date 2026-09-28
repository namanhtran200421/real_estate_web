import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Select, SelectOption } from '../../components/select/select';
import { API_URL, ApiError, fieldError, toApiError } from '../../core/api';
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
  imports: [RouterLink, Select],
  templateUrl: './contact.html',
})
export class Contact {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  protected readonly contact = SITE.contact;
  private readonly apartments = inject(ApartmentService).all;

  protected readonly topicOptions: SelectOption[] = [
    'Đặt phòng',
    'Thông tin căn hộ',
    'Thanh toán',
    'Hợp tác cho thuê',
    'Khác',
  ].map((t) => ({ value: t, label: t }));

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
    return fieldError(this.error(), path);
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
