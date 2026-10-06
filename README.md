# Smart File Backup System — Team D (BFF & Frontend)

Enterprise management portal and Backend-for-Frontend (BFF) orchestrator for the Smart File Backup System.

---

## 1. Project Overview & Team Ownership

Team D is responsible for the **Frontend User Interface** and the **Backend-for-Frontend (BFF)** API layer:
- **Frontend**: Responsive React 18 / Vite enterprise dashboard.
- **BFF**: API orchestration, RBAC security, dashboard aggregation, idempotency management, and user administration.

### Domain Boundaries
- **Team A**: Backup Job Scheduler & Queue Metrics (System of record for jobs).
- **Team B**: Deduplication Ratios & Merkle Tree Integrity (System of record for hashes).
- **Team C**: Metadata, File Versions, Backup Metadata & Restores (Authoritative System of Record).
- **Team D**: Frontend UI, BFF orchestration, authentication, role authorization, reporting presentation.

---

## 2. Architecture Diagram

```
+-------------------------------------------------------------------------+
|                      React 18 Frontend Application                      |
+-------------------------------------------------------------------------+
                                    |
                                    v (HTTP REST / JSON Envelopes)
+-------------------------------------------------------------------------+
|                           Team D BFF Layer                              |
|   Routes -> Controllers -> Services -> Team Clients (Adapter Pattern)   |
+-------------------------------------------------------------------------+
               |                          |                          |
               v                          v                          v
+-----------------------------+ +-------------------+ +-------------------+
|    Team A (Scheduler API)   | | Team B (Dedup API)| | Team C (Record DB)|
+-----------------------------+ +-------------------+ +-------------------+
```

---

## 3. Quick Start & Execution Commands

### Prerequisites
- Node.js `v18+` (Tested on `v24.14.1`)
- npm `v9+`

### Installation
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### IMPORTANT: always run `npm run safe-start`, not `npm start`, after pulling new changes or extracting a new zip - otherwise your browser will load an old, stale version of the app even if the source code has been fixed.

Running `npm start` without first running `npm run build` serves an outdated frontend, causing already-fixed bugs to appear to still exist.

```bash
npm run safe-start
```

### Running the Project

#### Option A: Unified Server (Backend + Built Frontend)
```bash
# Build frontend assets
cd frontend && npm run build && cd ..

# Start BFF backend server
npm start
```
- **React Portal**: `http://localhost:4000/`
- **Interactive Test Console**: `http://localhost:4000/test.html`
- **Health Check**: `http://localhost:4000/health`

#### Option B: Development Mode (Hot Reloading)
```bash
# Terminal 1: Run BFF Server
npm start

# Terminal 2: Run Vite Dev Server
cd frontend
npm run dev
```
- **Vite Dev Portal**: `http://localhost:3000/` (proxies `/api` to `http://localhost:4000`)

---

## 4. Automated Testing

Run the automated backend test suite (48 assertions covering 47 test cases):

```bash
npm test
```

Output:
```
✔ AUTH: 1. valid login
✔ AUTH: 2. invalid username
✔ AUTH: 3. invalid password
...
✔ ERRORS: 47. 404
ℹ pass 48 / fail 0
```

---

## 5. Environment Configuration

Configured via `.env`:

```env
PORT=4000
API_VERSION=v1

TEAM_A_MODE=mock
TEAM_B_MODE=mock
TEAM_C_MODE=mock

TEAM_A_BASE_URL=http://localhost:5001
TEAM_B_BASE_URL=http://localhost:5002
TEAM_C_BASE_URL=http://localhost:5003
```

---

## 6. Default Credentials

| Username | Password | Role | Permitted Access Scope |
|---|---|---|---|
| `employee1` | `employee123` | Employee | Dashboard, Own Files, Backups, Restores, Settings |
| `admin1` | `admin123` | IT Admin | Full System Access, All Files, User Management, Audit |
| `auditor1` | `auditor123` | Auditor | Read-only Dashboard, Reports, Audit Logs, Settings |

---

## 7. Role Permission Matrix

| Endpoint / Feature | Verb | Employee | IT Admin | Auditor |
|---|---|:---:|:---:|:---:|
| `/session` (Login/Logout) | POST/DELETE | Allowed | Allowed | Allowed |
| `/session/change-password` | POST | Allowed | Allowed | Allowed |
| `/dashboard` | GET | Allowed | Allowed | Allowed |
| `/files` | GET | Own Files | All Files | All Files |
| `/files/:id/versions` | GET | Own File | All Files | All Files |
| `/backups` | GET | Own Backups | All Backups | All Backups |
| `/backups` (Start Backup) | POST | Allowed | Allowed | **Forbidden** |
| `/restores` | GET | Own Restores | All Restores | All Restores |
| `/files/:id/versions/:vid/restore` | POST | Own File | Allowed | **Forbidden** |
| `/reports/*` | GET | Allowed | Allowed | Allowed |
| `/audit` | GET | **Forbidden** | Allowed | Allowed |
| `/users/*` | GET/POST/PATCH | **Forbidden** | Allowed | **Forbidden** |

---

## 8. Manual Demonstration Guide

### Demo 1: Employee Backup & Restore Workflow
1. Navigate to `http://localhost:4000` and sign in as `employee1` / `employee123`.
2. Inspect the **Dashboard** KPIs and recent activity.
3. Click **Files**, locate `budget.xlsx`, and click **Backup** (generates unique `Idempotency-Key`).
4. Click **Versions** for `budget.xlsx` and click **Restore** on version `v3`.
5. Confirm the modal prompt ("This will restore the selected file version...").
6. Verify redirection to **Restore Operations** showing state `PENDING` / `COMPLETED`.
7. Click **Logout**.

### Demo 2: IT Admin User Creation
1. Sign in as `admin1` / `admin123`.
2. Navigate to **User Management** (`/users`).
3. Click **Add User**, enter Name `Rohan Gupta`, Username `employee2`, Role `Employee`, Password `temp123`.
4. Click **Create User** and verify success toast.
5. Click **Logout**.

### Demo 3: Login with Newly Created User
1. Sign in as `employee2` / `temp123`.
2. Verify access to Employee dashboard and empty file scope.
3. Click **Logout**.

### Demo 4: Account Disabling & Security Check
1. Sign in as `admin1` / `admin123`.
2. Navigate to **User Management**, locate `employee2`, and click **Disable**.
3. Sign out and attempt to log in as `employee2` / `temp123`.
4. Verify login rejection: *"Your user account has been disabled by an IT Administrator."*

### Demo 5: Auditor Read-Only Inspection & Forbidden Action Attempt
1. Sign in as `auditor1` / `auditor123`.
2. Access **Reports** and **Audit Log** pages.
3. Attempt to trigger a backup or navigate to `/users`.
4. Verify HTTP `403 Forbidden` response and security boundary enforcement.

---

## 9. Documentation References

- [`docs/ARCHITECTURE.md`](file:///d:/team-d-bff/docs/ARCHITECTURE.md)
- [`docs/API_CONTRACT.md`](file:///d:/team-d-bff/docs/API_CONTRACT.md)

---

## 10. Known Limitations & Upstream Preparation

- **Upstream Real Mode**: When Team A, B, and C deploy real microservices, update `.env` URLs. No frontend changes required.
- **Session Tokens**: Mock tokens format `mock-token-u_XXX-TIMESTAMP`. Real auth mode connects directly to Team C JWT verification adapter.
