import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  logInOutline,
  personAddOutline,
  helpCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-auth-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCard,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
  ],
})
export class LoginPage {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  email = '';
  password = '';
  feedbackMessage = '';

  constructor() {
    addIcons({
      arrowBackOutline,
      logInOutline,
      personAddOutline,
      helpCircleOutline,
    });
  }

  fillUserDemo(): void {
    this.email = 'user@linisgo.demo';
    this.password = 'User123!';
    this.feedbackMessage = 'Filled demo user credentials.';
  }

  fillAdminDemo(): void {
    this.email = 'admin@linisgo.demo';
    this.password = 'Admin123!';
    this.feedbackMessage = 'Filled demo admin credentials.';
  }

  onSignIn(): void {
    const cleanEmail = this.email.trim().toLowerCase();
    if (cleanEmail === 'user@linisgo.demo' && this.password === 'User123!') {
      this.feedbackMessage = 'Signed in as Demo User. Redirecting to User Home...';
      this.authService.loginDemoUser();
    } else if (cleanEmail === 'admin@linisgo.demo' && this.password === 'Admin123!') {
      this.feedbackMessage = 'Signed in as Demo Administrator. Redirecting to Admin Dashboard...';
      this.authService.loginDemoAdmin();
    } else {
      this.feedbackMessage = 'Invalid demo credentials. Use "Fill Demo User" or "Fill Demo Admin".';
    }
  }

  continueAsGuest(): void {
    this.router.navigate(['/tabs/home']);
  }
}
