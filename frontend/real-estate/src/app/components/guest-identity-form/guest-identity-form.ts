import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Select, SelectOption } from '../select/select';
import {
  GuestIdentityDraft,
  GuestIdentityDraftService,
  IdentityField,
  NationalityChoice,
} from '../../services/guest-identity-draft.service';

@Component({
  selector: 'app-guest-identity-form',
  imports: [RouterLink, TranslocoPipe, Select],
  templateUrl: './guest-identity-form.html',
})
export class GuestIdentityForm {
  private readonly drafts = inject(GuestIdentityDraftService);

  readonly identity = input.required<GuestIdentityDraft>();
  readonly index = input.required<number>();
  readonly submitted = input(false);
  readonly today = input.required<string>();

  protected readonly nationalityOptions: SelectOption[] = [
    { value: 'VN', label: 'Việt Nam' },
    { value: 'foreign', label: 'Nước ngoài / Foreign' },
  ];
  protected readonly genderOptions: SelectOption[] = [
    { value: 'female', label: 'Nữ / Female' },
    { value: 'male', label: 'Nam / Male' },
    { value: 'other', label: 'Khác / Other' },
  ];
  private readonly errors = computed(() => (this.submitted() ? this.drafts.errors()[this.index()] : undefined));

  protected set<K extends keyof GuestIdentityDraft>(field: K, value: GuestIdentityDraft[K]): void {
    this.drafts.update(this.index(), { [field]: value } as Partial<GuestIdentityDraft>);
  }

  protected setNationality(value: string): void {
    this.set('nationalityChoice', value as NationalityChoice);
  }

  protected setGender(value: string): void {
    this.set('gender', value as GuestIdentityDraft['gender']);
  }

  protected fromInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected error(field: IdentityField): string | undefined {
    const code = this.errors()?.[field];
    return code ? `booking.identity.errors.${code}` : undefined;
  }
}
