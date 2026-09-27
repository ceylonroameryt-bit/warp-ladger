# Warp Ladger 🔷

**Commercial Smart Accounting SaaS Platform**

A double-entry, multi-tenant accounting platform built with FastAPI, Next.js 15, PostgreSQL, and Redis.

---

## System Status & Roadmap

### Implemented & Production-Verified
- **Foundation & Security**:
  - Argon2id password hashing with rotating, revocable refresh tokens
  - HttpOnly, SameSite, Secure cookie-based authentication sessions
  - Central CSRF protection for state-changing browser requests (`POST`, `PUT`, `PATCH`, `DELETE`)
  - Sliding-window rate limiting on sensitive routes (auth, uploads, AI processing)
  - Strict tenant isolation across all database queries and route handlers
  - Central file security pipeline: size limits, magic-byte MIME inspection, filename sanitization, SHA-256 checksums, and malware scanning abstraction
  - Clean unbroken Alembic migration chain (`0001_foundation` through `0008_financial_reports`) tested against blank PostgreSQL
- **Multi-Tenancy & Context**:
  - Global `OrganisationProvider` and `useOrganisation()` hook managing tenant state
  - Real tenant switcher with immediate context synchronization across all routes
- **Contacts**:
  - Customer, Supplier, and Dual-entity contacts with search, pagination, and archiving
- **Sales Invoicing**:
  - Line-item editor with exact Decimal arithmetic
  - Approval flow assigning official sequential invoice numbers
  - Direct General Ledger posting: Dr Accounts Receivable / Cr Revenue / Cr VAT Output
  - Live server-calculated summary metrics (`/invoices/metrics`)
- **Supplier Bills**:
  - Multi-status bill lifecycle (Draft, Awaiting Approval, Approved, Overdue, Paid)
  - Direct General Ledger posting: Dr Expense / Dr VAT Input / Cr Accounts Payable
  - Duplicate invoice detection based on supplier, invoice number, date, and amount
- **Smart Document Capture**:
  - Secure upload pipeline with camera capture support (`Permissions-Policy: camera=(self)`)
  - AI extraction and classification (human-in-the-loop review before bill conversion)
  - Document duplicate warnings with audited manual override
  - Zero mock documents in production environments (`[]` initial state with empty states)
- **Payments & Settlements**:
  - Atomic customer receipts and supplier bill payments with row-level locking
  - Multi-invoice split allocations, partial settlements, and unallocated credit balances
  - General Ledger payment postings (Dr Bank / Cr AR for receipts, Dr AP / Cr Bank for bills)
  - Atomic payment voiding and journal counter-reversals
- **Accounting & General Ledger**:
  - Central idempotent `AccountingPostingService`
  - Global financial lock dates and accounting period locking
  - Immutable journals with audited reversal entries (never silently mutated)
- **Financial Reports Hub**:
  - Real ledger-derived Balance Sheet, Profit & Loss, Trial Balance
  - Dynamic accounting periods based on organization financial year end
  - Real aged receivables and aged payables subledgers

### In Progress
- **Banking Operations**:
  - Bank Account Management
  - CSV Bank Statement Import
  - Bank Transaction Reconciliation matching rules

### Planned (Future Phases)
- Open Banking automated bank feeds (regulated provider integration)
- HMRC Making Tax Digital (MTD) VAT returns submission (subject to formal accountant validation)
- Multi-currency revaluation and foreign exchange accounting

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2 (asyncio), Pydantic v2 |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7, ARQ |
| File Storage | MinIO (local dev), AWS S3 / Cloudflare R2 (production) |
| Auth | JWT (HttpOnly cookies), Argon2id |
| Migrations | Alembic |
| CI/CD | GitHub Actions, Render, Vercel |

---

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
python -m app.core.bootstrap_admin --email admin@example.com --password YourStrongPassword123!
uvicorn app.main:app --port 8001 --reload
```

### 2. Frontend Setup
```bash
cd apps/web
npm install
npm run dev
```

Visit `http://localhost:3001` to access Warp Ladger.

---

## Running Verification Tests

### Backend Golden Accounting & Security Tests
```bash
pytest -v backend/tests/test_golden_accounting_posting.py backend/tests/test_security_csrf_and_ratelimit.py backend/tests/test_tenant_isolation_bills.py backend/tests/test_phase6_payments.py
```

### Frontend Typecheck & Build
```bash
cd apps/web
npm run typecheck
npm run build
```

---

## License

Proprietary — © Warp Ladger. All rights reserved.
