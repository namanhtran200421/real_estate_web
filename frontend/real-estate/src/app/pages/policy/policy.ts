import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApartmentService } from '../../services/apartment.service';

interface PolicyItem {
  title: string;
  body: string[];
  steps?: string[];
}

/**
 * House rules and policies. The items live in the translation files (`policy.items`); the
 * translations are loaded before the first render (see provideI18n), so the server renders the
 * whole page.
 */
@Component({
  selector: 'app-policy',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './policy.html',
})
export class Policy {
  private readonly transloco = inject(TranslocoService);
  private readonly apartments = inject(ApartmentService);

  // Emits once the language file is loaded (already so before the first render), then on language changes.
  private readonly raw = toSignal(this.transloco.selectTranslateObject('policy.items'));

  protected readonly items = computed<PolicyItem[]>(() => {
    const percent = this.apartments.resolve()?.depositPercent ?? 20;
    // translateObject leaves the strings inside arrays untouched, so the percent is filled in here.
    const items = this.raw();
    if (!Array.isArray(items)) return [];
    const fill = (text: string) => text.replace(/\{\{\s*percent\s*\}\}/g, String(percent));
    return (items as PolicyItem[]).map((item) => ({ ...item, body: item.body.map(fill) }));
  });
}
