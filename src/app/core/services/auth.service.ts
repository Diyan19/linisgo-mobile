import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  Unsubscribe,
} from 'firebase/auth';
import {
  getOrInitializeFirebaseAuth,
  getResolvedFirebaseConfig,
  hasConfiguredFirebaseApiKey,
  reinitializeFirebaseWithUpdatedConfig,
  saveRuntimeFirebaseWebConfig,
} from '../config/firebase.config';

export interface AuthActionResult {
  success: boolean;
  message: string;
  errorCode?: string;
  user?: User | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  /**
   * Isolated Development-Only Admin UI Sandbox storage key.
   * Explicitly separated from Firebase Authentication and never treated as real authorization.
   */
  private readonly DEV_ADMIN_SANDBOX_KEY = 'linisgo_dev_only_admin_ui_sandbox_v1';

  private auth: Auth | null = null;
  private authUnsubscribe: Unsubscribe | null = null;
  private initPromise: Promise<User | null> | null = null;
  private resolveInitPromise: ((user: User | null) => void) | null = null;

  // Core Firebase Auth state signals
  readonly firebaseUser = signal<User | null>(null);
  readonly authInitialized = signal<boolean>(false);
  readonly authLoading = signal<boolean>(true);
  readonly authError = signal<string | null>(null);
  readonly firebaseApiKeyConfigured = signal<boolean>(hasConfiguredFirebaseApiKey());

  // Email verification resend cooldown state (seconds remaining)
  readonly verificationCooldownSeconds = signal<number>(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  // Isolated development-only Admin UI sandbox flag (cannot bypass real user auth or backend claims)
  readonly devAdminSandboxActive = signal<boolean>(false);

  // Derived authentication state signals
  readonly isAuthenticatedUser = computed(() => this.firebaseUser() !== null);
  readonly isEmailVerified = computed(() => this.firebaseUser()?.emailVerified ?? false);
  readonly currentUserEmail = computed(() => this.firebaseUser()?.email ?? null);
  readonly currentUserDisplayName = computed(() => {
    const u = this.firebaseUser();
    if (!u) return null;
    return u.displayName || u.email?.split('@')[0] || 'LinisGo User';
  });

  /**
   * Real Firebase UID when signed in via Firebase Auth.
   * Distinct from mock user IDs ('demo', 'ana', 'ben', 'mira', 'carlos').
   */
  readonly currentUserId = computed<string>(() => {
    const u = this.firebaseUser();
    return u ? u.uid : 'guest';
  });

  /**
   * Role signal for UI navigation shells:
   * - 'user': Authenticated via real Firebase Authentication (regular user).
   * - 'admin': ONLY active when the isolated Development-Only Admin UI Sandbox is explicitly launched in dev mode.
   *   Regular Firebase users are never granted 'admin' role on the client.
   * - 'guest': Unauthenticated visitor.
   */
  readonly userRole = computed<'guest' | 'user' | 'admin'>(() => {
    if (this.firebaseUser()) {
      return 'user';
    }
    if (this.devAdminSandboxActive() && isDevMode()) {
      return 'admin';
    }
    return 'guest';
  });

  readonly isLoggedIn = computed(() => this.isAuthenticatedUser());
  readonly isUser = computed(() => this.isAuthenticatedUser());
  readonly isAdmin = computed(() => !this.isAuthenticatedUser() && this.devAdminSandboxActive() && isDevMode());

  constructor(private readonly router: Router) {
    this.restoreDevAdminSandboxFlag();
    this.initializeFirebaseAuthListener();
  }

  private restoreDevAdminSandboxFlag(): void {
    try {
      if (isDevMode() && typeof sessionStorage !== 'undefined') {
        const saved = sessionStorage.getItem(this.DEV_ADMIN_SANDBOX_KEY);
        this.devAdminSandboxActive.set(saved === 'true');
      }
    } catch {
      this.devAdminSandboxActive.set(false);
    }
  }

  private initializeFirebaseAuthListener(): void {
    this.firebaseApiKeyConfigured.set(hasConfiguredFirebaseApiKey());
    this.auth = getOrInitializeFirebaseAuth();

    this.initPromise = new Promise<User | null>(resolve => {
      this.resolveInitPromise = resolve;
    });

    if (!this.auth) {
      // Firebase Web API key not yet configured; mark auth initialized as guest
      this.firebaseUser.set(null);
      this.authLoading.set(false);
      this.authInitialized.set(true);
      if (this.resolveInitPromise) {
        this.resolveInitPromise(null);
        this.resolveInitPromise = null;
      }
      return;
    }

    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }

    this.authLoading.set(true);
    this.authUnsubscribe = onAuthStateChanged(
      this.auth,
      user => {
        this.firebaseUser.set(user);
        if (user) {
          // Real Firebase session takes precedence; clear any dev sandbox flag
          this.clearDevAdminSandboxFlag();
        }
        this.authLoading.set(false);
        this.authInitialized.set(true);
        if (this.resolveInitPromise) {
          this.resolveInitPromise(user);
          this.resolveInitPromise = null;
        }
      },
      err => {
        this.authError.set(this.mapFirebaseAuthError(err));
        this.firebaseUser.set(null);
        this.authLoading.set(false);
        this.authInitialized.set(true);
        if (this.resolveInitPromise) {
          this.resolveInitPromise(null);
          this.resolveInitPromise = null;
        }
      }
    );
  }

  /**
   * Waits for Firebase Authentication to finish restoring the initial session state.
   * Prevents route guards from prematurely redirecting authenticated users on browser refresh.
   */
  async waitForAuthInit(): Promise<User | null> {
    if (this.authInitialized()) {
      return this.firebaseUser();
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    return this.firebaseUser();
  }

  /**
   * Updates the runtime Firebase Web SDK API Key (`AIza...`) or config snippet for `linisgo-mobile`
   * and re-initializes the Firebase Auth listener immediately.
   */
  async applyRuntimeFirebaseConfig(rawInput: string): Promise<AuthActionResult> {
    const res = saveRuntimeFirebaseWebConfig(rawInput);
    if (!res.valid) {
      return {
        success: false,
        message: res.error || 'Invalid Firebase Web SDK configuration.',
      };
    }

    this.auth = await reinitializeFirebaseWithUpdatedConfig();
    this.firebaseApiKeyConfigured.set(hasConfiguredFirebaseApiKey());
    this.initializeFirebaseAuthListener();
    await this.waitForAuthInit();

    return {
      success: true,
      message: `Firebase Web SDK configured for project "${res.config?.projectId}" (${res.config?.authDomain}).`,
    };
  }

  getActiveFirebaseProjectSummary(): {
    projectId: string;
    authDomain: string;
    appId: string;
    apiKeyConfigured: boolean;
    previewHostname: string;
  } {
    const cfg = getResolvedFirebaseConfig();
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return {
      projectId: cfg.projectId,
      authDomain: cfg.authDomain,
      appId: cfg.appId,
      apiKeyConfigured: hasConfiguredFirebaseApiKey(),
      previewHostname: hostname,
    };
  }

  /**
   * Real Firebase Registration using createUserWithEmailAndPassword() + updateProfile().
   * New accounts are strictly regular users.
   */
  async registerWithEmail(params: {
    displayName: string;
    email: string;
    password: string;
  }): Promise<AuthActionResult> {
    this.authError.set(null);

    if (!this.auth || !hasConfiguredFirebaseApiKey()) {
      return {
        success: false,
        errorCode: 'auth/api-key-not-configured',
        message:
          'Firebase Web API Key for project "linisgo-mobile" is required before creating a live Firebase account. Paste your Web API Key (AIza...) in the Firebase Web SDK Setup box on this screen or in src/environments/environment.ts.',
      };
    }

    const cleanName = params.displayName.trim();
    const cleanEmail = params.email.trim();

    this.authLoading.set(true);
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, cleanEmail, params.password);

      if (cleanName) {
        await updateProfile(credential.user, { displayName: cleanName });
        // Refresh signal with updated displayName
        await credential.user.reload();
        this.firebaseUser.set(this.auth.currentUser);
      }

      // Attempt to dispatch initial verification email (non-blocking if rate-limited)
      try {
        await sendEmailVerification(credential.user);
        this.startVerificationCooldown(60);
      } catch {
        // Non-fatal: user can resend verification from Account Settings
      }

      this.clearDevAdminSandboxFlag();
      this.authLoading.set(false);
      return {
        success: true,
        user: credential.user,
        message:
          'Account registered via Firebase Authentication! A verification email has been requested. Redirecting to User Home...',
      };
    } catch (error: any) {
      this.authLoading.set(false);
      const friendly = this.mapFirebaseAuthError(error);
      this.authError.set(friendly);
      return {
        success: false,
        errorCode: error?.code || 'auth/unknown',
        message: friendly,
      };
    }
  }

  /**
   * Real Firebase Login using signInWithEmailAndPassword().
   * Fictional demo credentials are NOT bypassed in production authentication.
   */
  async signInWithEmail(email: string, password: string): Promise<AuthActionResult> {
    this.authError.set(null);
    const cleanEmail = email.trim();

    if (!this.auth || !hasConfiguredFirebaseApiKey()) {
      return {
        success: false,
        errorCode: 'auth/api-key-not-configured',
        message:
          'Firebase Web API Key for project "linisgo-mobile" is required to sign in with Firebase Authentication. Paste your Web API Key (AIza...) in the Firebase Web SDK Setup box below or in src/environments/environment.ts.',
      };
    }

    this.authLoading.set(true);
    try {
      const credential = await signInWithEmailAndPassword(this.auth, cleanEmail, password);
      this.clearDevAdminSandboxFlag();
      this.firebaseUser.set(credential.user);
      this.authLoading.set(false);
      return {
        success: true,
        user: credential.user,
        message: 'Signed in via Firebase Authentication. Redirecting...',
      };
    } catch (error: any) {
      this.authLoading.set(false);
      const friendly = this.mapFirebaseAuthError(error);
      this.authError.set(friendly);
      return {
        success: false,
        errorCode: error?.code || 'auth/unknown',
        message: friendly,
      };
    }
  }

  /**
   * Real Password Reset using sendPasswordResetEmail().
   * Uses privacy-preserving messaging so account existence is not leaked.
   */
  async requestPasswordReset(email: string): Promise<AuthActionResult> {
    this.authError.set(null);
    const cleanEmail = email.trim();

    if (!this.auth || !hasConfiguredFirebaseApiKey()) {
      return {
        success: false,
        errorCode: 'auth/api-key-not-configured',
        message:
          'Firebase Web API Key for project "linisgo-mobile" is required to send password reset emails. Paste your Web API Key (AIza...) in the Firebase Web SDK Setup box or in src/environments/environment.ts.',
      };
    }

    this.authLoading.set(true);
    try {
      await sendPasswordResetEmail(this.auth, cleanEmail);
      this.authLoading.set(false);
      return {
        success: true,
        message:
          'If an account is associated with this email address, a password reset link has been sent. Please check your inbox and spam folder.',
      };
    } catch (error: any) {
      this.authLoading.set(false);
      const code = error?.code || '';
      // Privacy protection: do not reveal whether a specific email address is registered
      if (code === 'auth/user-not-found') {
        return {
          success: true,
          message:
            'If an account is associated with this email address, a password reset link has been sent. Please check your inbox and spam folder.',
        };
      }
      const friendly = this.mapFirebaseAuthError(error);
      this.authError.set(friendly);
      return {
        success: false,
        errorCode: code,
        message: friendly,
      };
    }
  }

  /**
   * Sends a Firebase email verification message to the currently signed-in user with a 60s cooldown.
   */
  async sendVerificationEmail(): Promise<AuthActionResult> {
    const user = this.auth?.currentUser || this.firebaseUser();
    if (!user) {
      return {
        success: false,
        message: 'You must be signed in with a real Firebase account to request email verification.',
      };
    }

    if (user.emailVerified) {
      return {
        success: true,
        message: 'Your email address is already verified.',
      };
    }

    if (this.verificationCooldownSeconds() > 0) {
      return {
        success: false,
        message: `Please wait ${this.verificationCooldownSeconds()} seconds before requesting another verification email.`,
      };
    }

    try {
      await sendEmailVerification(user);
      this.startVerificationCooldown(60);
      return {
        success: true,
        message: `Verification email sent to ${user.email}. Please check your inbox and click "Refresh Verification Status" after verifying.`,
      };
    } catch (error: any) {
      return {
        success: false,
        errorCode: error?.code,
        message: this.mapFirebaseAuthError(error),
      };
    }
  }

  /**
   * Reloads the current Firebase user profile from Firebase servers (e.g., to update emailVerified).
   */
  async reloadCurrentUser(): Promise<AuthActionResult> {
    const user = this.auth?.currentUser || this.firebaseUser();
    if (!user) {
      return { success: false, message: 'No active Firebase user session.' };
    }
    try {
      await user.reload();
      // Trigger signal update by setting null then currentUser
      this.firebaseUser.set(null);
      this.firebaseUser.set(this.auth?.currentUser ?? user);
      return {
        success: true,
        message: user.emailVerified
          ? 'Email verification confirmed! Your account is now marked as Verified.'
          : 'Status refreshed. Your email is still marked as Unverified.',
      };
    } catch (error: any) {
      return {
        success: false,
        message: this.mapFirebaseAuthError(error),
      };
    }
  }

  /**
   * Updates the current Firebase user's displayName via updateProfile().
   */
  async updateFirebaseDisplayName(newDisplayName: string): Promise<void> {
    const user = this.auth?.currentUser || this.firebaseUser();
    if (!user || !newDisplayName.trim()) return;
    try {
      await updateProfile(user, { displayName: newDisplayName.trim() });
      this.firebaseUser.set(null);
      this.firebaseUser.set(this.auth?.currentUser ?? user);
    } catch {
      // Non-fatal fallback
    }
  }

  /**
   * Secure password update flow handling Firebase's recent-login requirement via re-authentication.
   */
  async updateUserPassword(currentPassword: string, newPassword: string): Promise<AuthActionResult> {
    const user = this.auth?.currentUser || this.firebaseUser();
    if (!user || !user.email) {
      return {
        success: false,
        message: 'You must be signed in with an Email/Password Firebase account to update your password.',
      };
    }

    if (!currentPassword) {
      return {
        success: false,
        message: 'Please enter your current password to verify your identity before setting a new password.',
      };
    }

    if (!newPassword || newPassword.length < 6) {
      return {
        success: false,
        message: 'Your new password must be at least 6 characters long.',
      };
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      return {
        success: true,
        message: 'Your Firebase account password has been updated securely.',
      };
    } catch (error: any) {
      return {
        success: false,
        errorCode: error?.code,
        message: this.mapFirebaseAuthError(error),
      };
    }
  }

  /**
   * Acquires the current Firebase user's JWT ID token for the upcoming Task 1.1 Private REST API.
   * Never returns hardcoded or mocked tokens.
   */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    const user = this.auth?.currentUser || this.firebaseUser();
    if (!user) {
      return null;
    }
    try {
      return await user.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }

  /**
   * Enters the explicitly isolated Development-Only Admin UI Sandbox.
   * This is ONLY for reviewing the Task 0.4 Admin UI in development prior to Task 1.1 backend custom claims.
   * It never grants real Firebase administrator privileges.
   */
  enterDevOnlyAdminUiSandbox(): boolean {
    if (!isDevMode()) {
      return false;
    }
    this.devAdminSandboxActive.set(true);
    try {
      sessionStorage.setItem(this.DEV_ADMIN_SANDBOX_KEY, 'true');
    } catch {}
    this.router.navigate(['/admin/tabs/dashboard']);
    return true;
  }

  private clearDevAdminSandboxFlag(): void {
    this.devAdminSandboxActive.set(false);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(this.DEV_ADMIN_SANDBOX_KEY);
      }
    } catch {}
  }

  /**
   * Signs out from Firebase Authentication using signOut() and clears any development sandbox state.
   */
  async logout(): Promise<void> {
    this.clearDevAdminSandboxFlag();
    if (this.auth) {
      try {
        await signOut(this.auth);
      } catch {
        // Ignore signOut transport error and clear local signal
      }
    }
    this.firebaseUser.set(null);
    await this.router.navigate(['/tabs/home']);
  }

  private startVerificationCooldown(seconds: number): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
    }
    this.verificationCooldownSeconds.set(seconds);
    this.cooldownTimer = setInterval(() => {
      const current = this.verificationCooldownSeconds();
      if (current <= 1) {
        this.verificationCooldownSeconds.set(0);
        if (this.cooldownTimer) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
        }
      } else {
        this.verificationCooldownSeconds.set(current - 1);
      }
    }, 1000);
  }

  /**
   * Translates Firebase Authentication error codes into clear, user-friendly guidance.
   */
  mapFirebaseAuthError(error: any): string {
    const code: string = error?.code || '';
    const msg: string = error?.message || '';

    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email address is already registered. Please sign in or use a different email address.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address (e.g., name@example.com).';
      case 'auth/weak-password':
        return 'Password is too weak. Please choose a stronger password with at least 6 characters.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please verify your credentials and try again.';
      case 'auth/user-disabled':
        return 'This Firebase user account has been disabled by an administrator.';
      case 'auth/too-many-requests':
        return 'Too many unsuccessful attempts or requests. Please wait a few minutes before trying again.';
      case 'auth/requires-recent-login':
        return 'For your security, this action requires recent authentication. Please enter your current password or sign in again.';
      case 'auth/network-request-failed':
        return 'Network error while communicating with Firebase Authentication. Please check your internet connection.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not yet enabled in the Firebase Console for project "linisgo-mobile". Enable it under Firebase Console > Authentication > Sign-in method.';
      case 'auth/unauthorized-domain':
        return `This preview domain (${typeof window !== 'undefined' ? window.location.hostname : 'current host'}) is not yet listed in Firebase Console > Authentication > Settings > Authorized domains for "linisgo-mobile".`;
      case 'auth/api-key-not-valid':
      case 'auth/invalid-api-key':
        return 'The configured Firebase Web API Key is invalid for project "linisgo-mobile". Please verify your Web App apiKey in Firebase Console > Project Settings.';
      default:
        if (msg.includes('api-key-not-valid')) {
          return 'The configured Firebase Web API Key is invalid for project "linisgo-mobile". Please check your Web App apiKey.';
        }
        return msg || 'An unexpected authentication error occurred. Please try again.';
    }
  }
}
