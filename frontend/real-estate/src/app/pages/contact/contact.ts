import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContactCards } from '../../components/contact-cards/contact-cards';

@Component({
  selector: 'app-contact',
  imports: [RouterLink, ContactCards],
  templateUrl: './contact.html',
})
export class Contact {}
