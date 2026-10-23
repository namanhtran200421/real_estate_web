import {
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { LANG } from '../../i18n/i18n';

/** The part of Cloudflare's Turnstile browser API used here. */
interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Whether this build has a CAPTCHA; forms wait for a solved token only when it does. */
export const CAPTCHA_ENABLED = environment.turnstileSiteKey.length > 0;

let loading: Promise<Turnstile> | undefined;

/** Loads Turnstile once per page, on first use (never during server rendering). */
function loadTurnstile(document: Document): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('Turnstile load timed out'));
    }, 15_000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.turnstile) resolve(window.turnstile);
      else {
        script.remove();
        reject(new Error('Turnstile missing'));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

/**
 * "I am not a robot" check (Cloudflare Turnstile) for public forms. Most visitors pass without
 * doing anything. Emits the solved token, or '' when it expires; the API accepts each token
 * once, so call `reset()` after every submit. Renders nothing when no site key is configured.
 */
@Component({
  selector: 'app-captcha',
  imports: [TranslocoPipe],
  template: `
    @if (enabled) {
      <div
        #container
        class="flex justify-center"
        [style.min-height.px]="compact() ? 150 : 65"
      ></div>
      @if (failed()) {
        <p class="mt-2 text-sm text-accent-deep" role="alert">{{ 'captcha.failed' | transloco }}</p>
        <button type="button" class="btn btn-outline mt-2" [disabled]="retrying()" [attr.aria-busy]="retrying()" (click)="retry()">
          {{ 'common.retry' | transloco }}
        </button>
      }
    }
  `,
})
export class Captcha implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly lang = inject(LANG);
  private readonly container = viewChild<ElementRef<HTMLElement>>('container');

  /** Shown in Cloudflare's analytics, e.g. "booking"; letters, digits, - and _ only. */
  readonly action = input<string>();
  readonly token = output<string>();

  protected readonly enabled = CAPTCHA_ENABLED;
  protected readonly failed = signal(false);
  protected readonly retrying = signal(false);

  private turnstile: Turnstile | undefined;
  private widgetId: string | undefined;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  private widgetSize?: 'compact' | 'flexible';
  protected readonly compact = signal(false);

  constructor() {
    afterNextRender(() => {
      if (this.enabled) void this.render();
    });
  }

  /** Clears the used token and asks for a fresh one. */
  reset(): void {
    this.token.emit('');
    if (this.turnstile && this.widgetId !== undefined) this.turnstile.reset(this.widgetId);
  }

  hasFailed(): boolean {
    return this.failed();
  }

  protected async retry(): Promise<void> {
    if (this.retrying()) return;
    this.retrying.set(true);
    try {
      if (this.turnstile && this.widgetId !== undefined) this.reset();
      else await this.render();
    } finally {
      this.retrying.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (this.turnstile && this.widgetId !== undefined) this.turnstile.remove(this.widgetId);
  }

  private async render(): Promise<void> {
    const container = this.container()?.nativeElement;
    if (!container) return;
    this.compact.set(container.clientWidth < 300);
    try {
      this.turnstile = await loadTurnstile(this.document);
    } catch {
      this.failed.set(true);
      return;
    }
    if (this.destroyed) return;
    this.mountWidget(container);
    this.resizeObserver = new ResizeObserver(() => this.mountWidget(container));
    this.resizeObserver.observe(container);
  }

  private mountWidget(container: HTMLElement): void {
    if (this.destroyed || !this.turnstile) return;
    const size = container.clientWidth < 300 ? 'compact' : 'flexible';
    if (size === this.widgetSize) return;
    this.compact.set(size === 'compact');
    if (this.widgetId !== undefined) {
      this.turnstile.remove(this.widgetId);
      this.token.emit('');
    }
    this.widgetSize = size;
    this.widgetId = this.turnstile.render(container, {
      sitekey: environment.turnstileSiteKey,
      action: this.action(),
      language: this.lang,
      theme: 'light',
      size,
      'response-field': false,
      'refresh-expired': 'auto',
      callback: (token: string) => {
        this.failed.set(false);
        this.token.emit(token);
      },
      'expired-callback': () => this.token.emit(''),
      'error-callback': () => {
        this.token.emit('');
        this.failed.set(true);
        // Handled here (the message above); Turnstile keeps retrying on its own.
        return true;
      },
    });
  }
}
