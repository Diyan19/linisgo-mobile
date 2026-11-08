import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { userGuard } from './core/guards/user.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'tabs/home',
    pathMatch: 'full',
  },
  {
    path: 'tabs',
    loadComponent: () =>
      import('./layouts/public-tabs/public-tabs.component').then(
        (m) => m.PublicTabsComponent
      ),
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/public/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'feed',
        loadComponent: () =>
          import('./features/public/feed/feed.page').then((m) => m.FeedPage),
      },
      {
        path: 'map',
        loadComponent: () =>
          import('./features/public/map/map.page').then((m) => m.MapPage),
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/public/search/search.page').then(
            (m) => m.SearchPage
          ),
      },
    ],
  },
  {
    path: 'post/:id',
    loadComponent: () =>
      import('./features/public/post-detail/post-detail.page').then(
        (m) => m.PostDetailPage
      ),
  },
  {
    path: 'user-profile/:id',
    loadComponent: () =>
      import('./features/public/user-profile/user-profile.page').then(
        (m) => m.UserProfilePage
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register.page').then(
        (m) => m.RegisterPage
      ),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page').then(
        (m) => m.ForgotPasswordPage
      ),
  },

  // --- Authenticated User Routes ---
  {
    path: 'user',
    redirectTo: 'user/tabs/home',
    pathMatch: 'full',
  },
  {
    path: 'user/tabs',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./layouts/user-tabs/user-tabs.component').then(
        (m) => m.UserTabsComponent
      ),
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/user/home/user-home.page').then(
            (m) => m.UserHomePage
          ),
      },
      {
        path: 'feed',
        loadComponent: () =>
          import('./features/public/feed/feed.page').then((m) => m.FeedPage),
      },
      {
        path: 'map',
        loadComponent: () =>
          import('./features/public/map/map.page').then((m) => m.MapPage),
      },
      {
        path: 'create',
        loadComponent: () =>
          import('./features/user/create-post/create-post.page').then(
            (m) => m.CreatePostPage
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/user/profile/user-profile-home.page').then(
            (m) => m.UserProfileHomePage
          ),
      },
    ],
  },
  {
    path: 'user/my-posts',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/my-posts/my-posts.page').then((m) => m.MyPostsPage),
  },
  {
    path: 'user/saved',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/saved-items/saved-items.page').then(
        (m) => m.SavedItemsPage
      ),
  },
  {
    path: 'user/notifications',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/notifications/notifications.page').then(
        (m) => m.NotificationsPage
      ),
  },
  {
    path: 'user/edit-profile',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/edit-profile/edit-profile.page').then(
        (m) => m.EditProfilePage
      ),
  },
  {
    path: 'user/settings',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/settings/settings.page').then(
        (m) => m.SettingsPage
      ),
  },
  {
    path: 'user/report',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/reports/report-form.page').then(
        (m) => m.ReportFormPage
      ),
  },
  {
    path: 'user/my-reports',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/reports/my-reports.page').then(
        (m) => m.MyReportsPage
      ),
  },
  {
    path: 'user/appeal',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/appeals/appeal-form.page').then(
        (m) => m.AppealFormPage
      ),
  },
  {
    path: 'user/my-appeals',
    canActivate: [userGuard],
    loadComponent: () =>
      import('./features/user/appeals/my-appeals.page').then(
        (m) => m.MyAppealsPage
      ),
  },

  // --- Authenticated Administrator Routes ---
  {
    path: 'admin',
    redirectTo: 'admin/tabs/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'admin/tabs',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./layouts/admin-tabs/admin-tabs.component').then(
        (m) => m.AdminTabsComponent
      ),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard/admin-dashboard.page').then(
            (m) => m.AdminDashboardPage
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users/admin-users.page').then(
            (m) => m.AdminUsersPage
          ),
      },
      {
        path: 'posts',
        loadComponent: () =>
          import('./features/admin/posts/admin-posts.page').then(
            (m) => m.AdminPostsPage
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/admin/reports/admin-reports.page').then(
            (m) => m.AdminReportsPage
          ),
      },
      {
        path: 'more',
        loadComponent: () =>
          import('./features/admin/more/admin-more.page').then(
            (m) => m.AdminMorePage
          ),
      },
    ],
  },
  {
    path: 'admin/user/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/users/admin-user-detail.page').then(
        (m) => m.AdminUserDetailPage
      ),
  },
  {
    path: 'admin/post/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/posts/admin-post-review.page').then(
        (m) => m.AdminPostReviewPage
      ),
  },
  {
    path: 'admin/report/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/reports/admin-report-review.page').then(
        (m) => m.AdminReportReviewPage
      ),
  },
  {
    path: 'admin/appeals',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/appeals/admin-appeals.page').then(
        (m) => m.AdminAppealsPage
      ),
  },
  {
    path: 'admin/appeal/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/appeals/admin-appeal-detail.page').then(
        (m) => m.AdminAppealDetailPage
      ),
  },
  {
    path: 'admin/notifications',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/notifications/admin-notifications.page').then(
        (m) => m.AdminNotificationsPage
      ),
  },
  {
    path: 'admin/audit-logs',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/audit-logs/admin-audit-logs.page').then(
        (m) => m.AdminAuditLogsPage
      ),
  },
  {
    path: 'admin/system-status',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/system-status/admin-system-status.page').then(
        (m) => m.AdminSystemStatusPage
      ),
  },
  {
    path: 'admin/settings',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/settings/admin-settings.page').then(
        (m) => m.AdminSettingsPage
      ),
  },

  {
    path: '**',
    redirectTo: 'tabs/home',
  },
];
