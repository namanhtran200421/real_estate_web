import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentCard } from '../../components/apartment-card/apartment-card';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-home',
  imports: [ApartmentCard, TranslocoPipe],
  templateUrl: './home.html',
})
export class Home {
  private readonly apartments = inject(ApartmentService).all;

  /** The first apartment gets the wide featured card; the rest go in the grid. */
  protected readonly featured = computed(() => this.apartments()[0]);
  protected readonly others = computed(() => this.apartments().slice(1));

  /** Translation keys under home.promises (each has a title and a text). */
  protected readonly promises = ['availability', 'prices', 'vietqr'].map((key) => `home.promises.${key}`);
}
