# @workspace/scripts

Utility scripts for database operations and performance testing.

## Load test — scale simulation

Runs concurrent load against the API server to assert p95 < 800 ms across all
high-traffic list and report endpoints.

### Quick start (test-server mode, no real auth token required)

```bash
# 1. Build the API server
pnpm --filter @workspace/api-server run build

# 2. Start the API in test mode (separate terminal)
NODE_ENV=test PORT=8091 pnpm --filter @workspace/api-server run start

# 3. Run the load test
USE_TEST_HEADERS=1 TEST_DISTRICT_ID=6 BASE_URL=http://localhost:8091 \
  pnpm --filter @workspace/scripts run load-test
```

### Production / staging (real Clerk token)

```bash
AUTH_TOKEN=<bearer> BASE_URL=https://your-api.example.com \
  pnpm --filter @workspace/scripts run load-test
```

### Environment variables

| Variable          | Default                   | Description                                      |
|-------------------|---------------------------|--------------------------------------------------|
| `BASE_URL`        | `http://localhost:8080`   | API server base URL                              |
| `AUTH_TOKEN`      | _(empty)_                 | Bearer token for real auth                       |
| `USE_TEST_HEADERS`| `0`                       | Set to `1` to inject x-test-* headers (NODE_ENV=test only) |
| `TEST_DISTRICT_ID`| `6`                       | District ID injected via x-test-district-id      |
| `TEST_ROLE`       | `admin`                   | Role injected via x-test-role                    |
| `ENFORCE_5K`      | `0`                       | Set to `1` to fail when dataset has < 5 000 students |
| `TEST_STUDENT_ID` | _(auto-detected)_         | Student ID used for the /api/documents endpoint  |

### Pass criteria

- All endpoints: p95 < 800 ms
- All endpoints: error rate = 0 (no non-2xx responses)
- All list endpoints: response contains `{ data, total, page, pageSize, hasMore }`

### Covered endpoints

| Endpoint                                | Shape check |
|-----------------------------------------|-------------|
| `GET /api/students?limit=100&offset=0`  | ✓           |
| `GET /api/sessions?limit=100&offset=0`  | ✓           |
| `GET /api/alerts?limit=100`             | ✓           |
| `GET /api/documents?limit=100`          | ✓           |
| `GET /api/audit-logs?limit=100`         | ✓           |
| `GET /api/students?status=active`       | ✓           |
| `GET /api/dashboard/summary`            | —           |
| `GET /api/reports/compliance-risk-report` | —         |
| `GET /api/reports/audit-package`        | —           |

## Other scripts

- **check-tenant-scope.sh** — audits route files for missing district-scope guards
- **post-merge.sh** — post-merge setup hook (run by the platform after task merges)
