import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  newspaperOutline,
  mapOutline,
  searchOutline,
  logInOutline,
  personAddOutline,
  arrowBackOutline,
  arrowForwardOutline,
  funnelOutline,
  refreshOutline,
  closeCircleOutline,
  checkmarkCircleOutline,
  locationOutline,
  callOutline,
  logoFacebook,
  pricetagOutline,
  personOutline,
  sparklesOutline,
  helpCircleOutline,
  timeOutline,
} from 'ionicons/icons';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { firebaseAuthInterceptor } from './app/core/interceptors/firebase-auth.interceptor';

addIcons({
  homeOutline,
  newspaperOutline,
  mapOutline,
  searchOutline,
  logInOutline,
  personAddOutline,
  arrowBackOutline,
  arrowForwardOutline,
  funnelOutline,
  refreshOutline,
  closeCircleOutline,
  checkmarkCircleOutline,
  locationOutline,
  callOutline,
  logoFacebook,
  pricetagOutline,
  personOutline,
  sparklesOutline,
  helpCircleOutline,
  timeOutline,
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([firebaseAuthInterceptor])),
  ],
}).catch((err) => console.error(err));
