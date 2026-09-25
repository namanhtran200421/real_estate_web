import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Custom dropdown styled with the design system. Follows the WAI-ARIA
 * "select-only combobox" pattern: focus stays on the trigger, options are
 * announced via aria-activedescendant.
 */
@Component({
  selector: 'app-select',
  templateUrl: './select.html',
  host: {
    class: 'relative block',
    '(document:pointerdown)': 'onOutsidePointer($event)',
  },
})
export class Select {
  readonly options = input.required<SelectOption[]>();
  /** Selected value; two-way bindable with [(value)]. */
  readonly value = model<string>('');
  /** Id for the trigger, so an existing <label for="…"> points at it. */
  readonly inputId = input.required<string>();
  readonly placeholder = input('Chọn…');
  /** Optional form field name, submitted through a hidden input. */
  readonly name = input<string>();

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()));
  protected readonly listboxId = computed(() => `${this.inputId()}-listbox`);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly optionEls = viewChildren<ElementRef<HTMLElement>>('option');

  constructor() {
    // Keep the highlighted option visible while moving through a long list.
    effect(() => {
      const index = this.activeIndex();
      if (this.open()) this.optionEls()[index]?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  }

  protected optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  protected toggle(): void {
    this.open() ? this.close() : this.openList();
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (option) this.value.set(option.value);
    this.close();
    this.trigger().nativeElement.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    if (!count) return;
    const isOpen = this.open();

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) this.openList();
        else this.activeIndex.update((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
        break;
      case 'Home':
      case 'End':
        if (isOpen) {
          event.preventDefault();
          this.activeIndex.set(event.key === 'Home' ? 0 : count - 1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        isOpen ? this.choose(this.activeIndex()) : this.openList();
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.typeahead(event.key);
        }
    }
  }

  protected onOutsidePointer(event: PointerEvent): void {
    if (this.open() && !this.host().nativeElement.contains(event.target as Node)) this.close();
  }

  private openList(): void {
    const current = this.options().findIndex((o) => o.value === this.value());
    this.activeIndex.set(current >= 0 ? current : 0);
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
  }

  /** Jump to the next option starting with the typed character, like a native select. */
  private typeahead(char: string): void {
    const options = this.options();
    const start = this.open() ? this.activeIndex() : options.findIndex((o) => o.value === this.value());
    const needle = char.toLocaleLowerCase('vi');
    for (let step = 1; step <= options.length; step++) {
      const index = (start + step + options.length) % options.length;
      if (options[index].label.toLocaleLowerCase('vi').startsWith(needle)) {
        this.open() ? this.activeIndex.set(index) : this.value.set(options[index].value);
        return;
      }
    }
  }
}
