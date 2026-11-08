import { Component } from '@angular/core';
import { IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-public-layout',
  template: '<ion-router-outlet></ion-router-outlet>',
  standalone: true,
  imports: [IonRouterOutlet],
})
export class PublicLayoutComponent {}
