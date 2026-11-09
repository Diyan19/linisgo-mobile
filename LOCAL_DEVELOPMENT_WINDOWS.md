# LinisGo Finder — Windows Local Development & Secure Cloud Firestore Setup Guide

This guide provides step-by-step instructions for setting up **LinisGo Finder** on a Windows machine using **PowerShell**, running isolated local **Firebase Firestore Emulator** security rules tests, and connecting the local Node.js/Express backend to the live `linisgo-mobile` Cloud Firestore database using **keyless Application Default Credentials (ADC) with Service Account Impersonation**.

---

##Confirmed Project & Database Configuration

| Setting | Value |
| :--- | :--- |
| **Firebase Project ID** | `linisgo-mobile` |
| **Firestore Database ID** | `(default)` |
| **Firestore Location** | `nam5` (United States multi-region) |
| **Firestore Edition** | `Standard` |
| **Firestore Mode** | `Firestore Native` |
| **Billing Plan** | `Spark Free Only` (No paid GCP APIs) |
| **Frontend Dev Port** | `http://localhost:3000` |
| **Backend API Port** | `http://localhost:3001` |

---

## 1. Required Software on Windows

Install the following tools on Windows 10 or Windows 11 before starting:

1. **Node.js LTS (v20.x or v22.x LTS):**
   - Download the Windows `.msi` installer from [https://nodejs.org/](https://nodejs.org/).
   - Ensure **"Add to PATH"** is checked during installation.
2. **Git for Windows:**
   - Download from [https://git-scm.com/download/win](https://git-scm.com/download/win).
3. **Java JDK 17 or 21 LTS (Required ONLY for the local Firebase Firestore Emulator):**
   - Download Eclipse Temurin JDK 21 LTS `.msi` from [https://adoptium.net/](https://adoptium.net/).
   - Check **"Set JAVA_HOME variable"** and **"Add to PATH"** in the installer.
4. **Google Cloud CLI (`gcloud`):**
   - Download the Windows installer (`GoogleCloudSDKInstaller.exe`) from [https://cloud.google.com/sdk/docs/install#windows](https://cloud.google.com/sdk/docs/install#windows).
5. **Firebase CLI (`firebase-tools`):**
   - Installed via `npm` after Node.js is installed:
     ```powershell
     npm install -g firebase-tools
     ```

---

## 2. Verifying Installed Tools in Windows PowerShell

Open a **new Windows PowerShell** window (non-Administrator is fine) and verify every prerequisite:

```powershell
# 1. Verify Node.js and npm
node -v
npm -v

# 2. Verify Git
git --version

# 3. Verify Java 17+ (required by Firebase Firestore Emulator)
java -version

# 4. Verify Google Cloud CLI
gcloud --version

# 5. Verify Firebase CLI
firebase --version
```

> **If PowerShell blocks `npm` or `firebase` scripts with an `ExecutionPolicy` error:**
> Run this once for your current Windows user account:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

---

## 3. Exporting or Cloning the Project from Google AI Studio

1. In Google AI Studio, click **Download / Export to ZIP** (or push to a private GitHub repository and `git clone` it).
2. Extract the project to a clean path without spaces if possible, for example:
   `C:\dev\linisgo-finder`
3. Open PowerShell and navigate to the project root:
   ```powershell
   cd C:\dev\linisgo-finder
   ```

---

## 4. Installing Project Dependencies

Install all frontend and backend dependencies from the root `package.json`:

```powershell
npm install
```

*(Optional — for live local Firestore Emulator rules unit tests)* Install `@firebase/rules-unit-testing` locally as a dev dependency if you plan to run the live JVM emulator suite:

```powershell
npm install --save-dev @firebase/rules-unit-testing
```

Compile the backend TypeScript code to verify everything builds cleanly:

```powershell
npx tsc -p api/tsconfig.json
```

---

## 5. Creating the Local `.env` File Safely

1. Copy `.env.example` to `.env` in PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Open `.env` in your code editor (e.g., VS Code) and verify the values match the confirmed configuration:
   ```dotenv
   NODE_ENV=development
   API_HOST=0.0.0.0
   API_PORT=3001
   FIREBASE_PROJECT_ID=linisgo-mobile
   FIRESTORE_DATABASE_ID=(default)
   FIRESTORE_LOCATION=nam5
   FIRESTORE_EDITION=Standard
   FIRESTORE_MODE=Firestore Native
   ALLOW_LOCAL_SMOKE_TEST_WRITE=false
   ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUEST=100
   ```
3. **Security check:** Confirm `.env` is listed in `.gitignore` and **never** commit `.env` or any credential files to Git:
   ```powershell
   git status
   ```

---

## 6. Service Account & IAM Preparation (Manual Console Steps)

To connect your local Express backend to Cloud Firestore **without downloading JSON private keys**, create a dedicated backend service account and grant minimum-privilege IAM roles.

### Why These Roles Are Needed
- **Dedicated Service Account (`linisgo-backend-local@linisgo-mobile.iam.gserviceaccount.com`):** Represents the LinisGo Finder Express backend server identity.
- **`roles/datastore.user` (Cloud Datastore User) on project `linisgo-mobile`:** The minimum IAM role required by the Firebase Admin / Cloud Firestore Server SDK to read, write, query, and run transactions on `(default)` in `nam5`.
- **`roles/iam.serviceAccountTokenCreator` (Service Account Token Creator) granted to your personal developer Google account *on the backend service account resource only*:** Allows your `gcloud` session to request short-lived, memory-only OAuth2 access tokens on behalf of the backend service account without ever creating a downloadable JSON key.
- *(Later, Separately Approved Permission)* **`roles/firebaseauth.admin` (Firebase Authentication Admin):** Not required for Firestore connectivity or public-certificate JWT verification, and only needed later if the backend performs privileged Firebase Auth user management (e.g., custom claims or server-side account revocation).

### Manual Setup in Google Cloud Console (Free Under Spark Plan)
1. Open [Google Cloud Console — Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=linisgo-mobile) for project `linisgo-mobile`.
2. Click **+ Create Service Account**:
   - **Service account name:** `linisgo-backend-local`
   - **Service account ID:** `linisgo-backend-local` (`linisgo-backend-local@linisgo-mobile.iam.gserviceaccount.com`)
   - **Description:** `Local Express backend identity for LinisGo Finder (keyless ADC impersonation)`
   - Click **Create and Continue**.
3. Under **Grant this service account access to project**, select the single minimum role:
   - **Role:** `Cloud Datastore User` (`roles/datastore.user`)
   - Click **Continue**, then **Done**.
4. **Do NOT create or download a JSON key.** (And never reuse any previously exposed key such as `db6ff4441b`.)
5. Click on the newly created `linisgo-backend-local@linisgo-mobile.iam.gserviceaccount.com` service account, go to the **Permissions** (or **Principals with access**) tab, and click **Grant Access**:
   - **New principals:** Enter your personal developer Google email address.
   - **Role:** `Service Account Token Creator` (`roles/iam.serviceAccountTokenCreator`)
   - Click **Save**.

---

## 7. Configuring Keyless Google Cloud ADC with Service-Account Impersonation

In Windows PowerShell, sign in to `gcloud`, select `linisgo-mobile`, and configure Application Default Credentials (ADC) to impersonate your backend service account:

```powershell
# 1. Authenticate your Google Cloud CLI session
gcloud auth login

# 2. Set the active project to linisgo-mobile
gcloud config set project linisgo-mobile

# 3. Configure keyless ADC with service-account impersonation
gcloud auth application-default login --impersonate-service-account=linisgo-backend-local@linisgo-mobile.iam.gserviceaccount.com
```

When the browser opens, approve the login using your developer Google account. `gcloud` writes an impersonation configuration file (containing **no private keys**) to:
`%APPDATA%\gcloud\application_default_credentials.json`

Verify that `GOOGLE_APPLICATION_CREDENTIALS` is **not** pointing to any legacy JSON key file:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS
# Expected output: empty / blank (Firebase Admin SDK automatically discovers gcloud ADC)
```

---

## 8. Running the Express Backend on Port 3001

Open **PowerShell Window 1** in `C:\dev\linisgo-finder` and start the Express API server:

```powershell
npx tsx api/src/server.ts
```

Expected startup log:
```text
[LinisGo API] Private backend listening on http://0.0.0.0:3001 (env: development, project: linisgo-mobile, credentialReady: true)
```

---

## 9. Running the Ionic Angular Frontend on Port 3000

Open **PowerShell Window 2** in `C:\dev\linisgo-finder` and start the Angular development server (which proxies `/api/*` requests to `http://localhost:3001` via `proxy.conf.json`):

```powershell
npx ng serve --host 0.0.0.0 --port 3000 --no-hmr
```

Once compiled, open `http://localhost:3000` in your browser.

---

## 10. Running Unit Tests & the Local Firestore Emulator Security Rules Suite

### A. Run Backend & Schema Unit Tests (No Java Required)
```powershell
npx tsc -p api/tsconfig.json
node --test api/tests/api.test.mjs
node --test api/tests/firestore-schema-and-rules.test.mjs
node --test tests/location.test.mjs
```

### B. Run Live Firestore Emulator Security Rules Tests (Requires Java 17+ and `@firebase/rules-unit-testing`)
The emulator test suite uses the isolated offline project ID `demo-linisgo-emulator` so it **never** contacts live `linisgo-mobile` production Firestore:

```powershell
npx firebase emulators:exec --only firestore --project demo-linisgo-emulator "node --test tests/firestore-emulator.rules.test.mjs"
```

---

## 11. Running the Controlled Local Firestore Smoke Test (CLI Only)

> **Security Policy:** `POST /api/schema/smoke-test` is **permanently disabled over HTTP** (`403 FORBIDDEN_SMOKE_TEST_CLI_ONLY`) in all environments so no browser or external caller can trigger Firestore writes. Live smoke testing is restricted exclusively to the local developer CLI script (`api/src/scripts/run-firestore-smoke-test.ts`).

### Step A: Non-Destructive Read Probe Only (Steps 1–3)
Verify configuration, ADC resolution, and a real non-destructive read against `projects/linisgo-mobile/databases/(default)` without writing any document:

```powershell
npx tsx api/src/scripts/run-firestore-smoke-test.ts
```

### Step B: Full 8-Step Disposable Read / Write / Verify / Delete Smoke Test
To authorize the disposable write/read/delete cycle inside `/_linisgo_stage1_smoke_test/{docId}`, pass `--allow-disposable-write`:

```powershell
npx tsx api/src/scripts/run-firestore-smoke-test.ts --allow-disposable-write
```

Expected output when impersonated ADC is active:
- `"overallStatus": "passed"`
- `"steps"` 1 through 8 all `"status": "passed"`
- Disposable test document automatically deleted in Step 7 and confirmed absent in Step 8 (`NOT_FOUND`).

---

## 12. Verifying `/api/health`, `/api/auth/me`, and `/api/schema/status`

In a separate PowerShell window while the backend (`:3001`) and frontend (`:3000`) are running:

```powershell
# 1. Verify /api/health (Expected: HTTP 200)
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get | ConvertTo-Json -Depth 5

# 2. Verify /api/schema/status (Expected: HTTP 200, smokeTestAccessPolicy.httpEndpointEnabled = false)
Invoke-RestMethod -Uri "http://localhost:3000/api/schema/status" -Method Get | ConvertTo-Json -Depth 5

# 3. Verify /api/schema/smoke-test is blocked over HTTP (Expected: HTTP 403 FORBIDDEN_SMOKE_TEST_CLI_ONLY)
try {
  Invoke-RestMethod -Uri "http://localhost:3000/api/schema/smoke-test" -Method Post
} catch {
  Write-Host "HTTP Status:" $_.Exception.Response.StatusCode.value__
}

# 4. Verify /api/auth/me without token (Expected: HTTP 401 UNAUTHORIZED_MISSING_TOKEN)
try {
  Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" -Method Get
} catch {
  Write-Host "HTTP Status:" $_.Exception.Response.StatusCode.value__
}
```

To test `GET /api/auth/me` with a signed-in user:
1. Open `http://localhost:3000/auth/login` in your browser and sign in with a Firebase Auth user.
2. Navigate to `http://localhost:3000/user/settings` and click **Verify Live Token with Backend (`/api/auth/me`)** to confirm HTTP `200 OK` and matching `uid`.

---

## 13. Security Checklist — Never Commit or Paste Credentials

- [ ] **Never** generate, download, or paste a Firebase Admin SDK service-account `.json` private key.
- [ ] **Never** reuse any previously exposed private key (such as key ID `db6ff4441b`).
- [ ] **Never** paste raw Firebase ID tokens, OAuth2 access tokens, or `.env` files into chat prompts or commits.
- [ ] **Never** enable client-side direct writes in `firestore.rules` (`allow create, update, delete: if false;` must remain enforced across all collections).
- [ ] Keep `ALLOW_LOCAL_SMOKE_TEST_WRITE=false` in `.env` during normal development and pass `--allow-disposable-write` only when running the CLI smoke test intentionally.
