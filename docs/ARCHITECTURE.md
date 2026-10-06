# Architecture & System Design — Team D BFF & Frontend

## 1. Executive Summary & Team Boundaries

The Smart File Backup System is a multi-team microservice system. **Team D** is solely responsible for:
1. **Frontend Interface (React / Vite)**: Providing an enterprise-grade, responsive user interface.
2. **Backend-for-Frontend (BFF)**: API orchestration, role-based authorization (RBAC), session management, correlation ID propagation, and aggregated dashboard/reporting APIs.

Team D **must not** act as the system of record for domain data belonging to other teams:
- **Team A (Scheduler)**: Authoritative for backup job scheduling, queues, and scheduler metrics.
- **Team B (Deduplication & Integrity Engine)**: Authoritative for chunking, deduplication ratios, checksums, and Merkle tree verification.
- **Team C (System of Record)**: Authoritative database for files, metadata, file versions, backup metadata, restore operations, and user accounts.

---

## 2. Architecture Flow Diagram

```
+-------------------------------------------------------------------------+
|                         Browser / Web Client                            |
|                          (React 18 + Vite)                              |
+-------------------------------------------------------------------------+
                                    |
                                    v (HTTP REST / JSON Envelopes)
+-------------------------------------------------------------------------+
|                           Team D BFF Layer                              |
|                                                                         |
|  [ Routes ] ----> [ Controllers ] ----> [ Services ]                    |
|  (Auth Guard)     (Input Validation)    (Business Logic / Aggregation)  |
|                                                |                        |
|                                         [ Team Clients ]                |
|                                         (Adapter Pattern)               |
+-------------------------------------------------------------------------+
               |                          |                          |
               | (HTTP / Mock)            | (HTTP / Mock)            | (HTTP / Mock)
               v                          v                          v
+-----------------------------+ +-------------------+ +-------------------+
|       Team A Microservice   | | Team B Engine     | | Team C Database   |
|   (Backup Job Scheduler)    | | (Dedup & Hash)    | | (System Record)   |
+-----------------------------+ +-------------------+ +-------------------+
```

---

## 3. Layered Design Pattern

The BFF is built with a strict single-responsibility layered pattern:

1. **Routes (`src/routes/`)**: Map URL endpoints to controllers. Apply security middleware (`auth.js` token validation and `roleGuard.js` RBAC enforcement).
2. **Controllers (`src/controllers/`)**: Handle HTTP request/response lifecycles, validate payload structures, delegate to business services, and output standard response envelopes.
3. **Services (`src/services/`)**: Orchestrate business rules, perform parallel multi-team requests (`Promise.all` / `Promise.allSettled`), enforce file ownership rules, and manage client-side idempotency caching.
4. **Team Clients (`src/clients/`)**: Isolated HTTP adapters (`teamAClient`, `teamBClient`, `teamCClient`) that communicate with upstream microservices.
5. **Base HTTP Client (`src/clients/httpClient.js`)**: Provides fetch timeouts using `AbortController`, JSON parsing safety, correlation ID headers, and error normalization.

---

## 4. Upstream Integration Strategy (Mock vs. Real Modes)

To ensure Team D is fully prepared for final integration when Team A, B, and C ship their microservices, the BFF implements environment-driven adapters:

```env
TEAM_A_MODE=mock | real
TEAM_B_MODE=mock | real
TEAM_C_MODE=mock | real

TEAM_A_BASE_URL=http://localhost:5001
TEAM_B_BASE_URL=http://localhost:5002
TEAM_C_BASE_URL=http://localhost:5003
```

- **Mock Mode (`mock`)**: Team clients resolve structured mock datasets in-memory without making external network calls.
- **Real Mode (`real`)**: Team clients delegate requests through `httpClient.js` to Team A, B, and C's live REST endpoints.

**Crucial Guarantee**: Switching from `mock` to `real` requires zero changes to the React frontend or BFF business service layer.
