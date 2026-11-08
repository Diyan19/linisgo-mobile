import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly STORAGE_KEY = 'linisgo_user_session_v1';

  readonly userRole = signal<'guest' | 'user' | 'admin'>('guest');
  readonly currentUserId = signal<string>('demo');

  // Backwards compatible signals and role indicators
  readonly isLoggedIn = computed(() => this.userRole() !== 'guest');
  readonly isUser = computed(() => this.userRole() === 'user');
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  constructor(private router: Router) {
    this.restoreSession();
  }

  private restoreSession(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === 'admin') {
        this.userRole.set('admin');
        this.currentUserId.set('admin@linisgo.demo');
      } else if (saved === 'user') {
        this.userRole.set('user');
        this.currentUserId.set('demo');
      } else {
        this.userRole.set('guest');
      }
    } catch {
      this.userRole.set('guest');
    }
  }

  loginDemoUser(): void {
    this.userRole.set('user');
    this.currentUserId.set('demo');
    try {
      localStorage.setItem(this.STORAGE_KEY, 'user');
    } catch {}
    this.router.navigate(['/user/tabs/home']);
  }

  loginDemoAdmin(): void {
    this.userRole.set('admin');
    this.currentUserId.set('admin@linisgo.demo');
    try {
      localStorage.setItem(this.STORAGE_KEY, 'admin');
    } catch {}
    this.router.navigate(['/admin/tabs/dashboard']);
  }

  logout(): void {
    this.userRole.set('guest');
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {}
    this.router.navigate(['/tabs/home']);
  }
}
