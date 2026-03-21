# ParikshaSuraksha — AI-Powered Exam Integrity Engine

## Project Overview
Production-grade exam integrity system with three innovations:
1. O(1) Isomorphic Question Generation (IRT-calibrated templates)
2. Statistical Collusion Detection (O(1) per-pair scoring)
3. Zero-Knowledge Exam Lifecycle (Cloud KMS + TLP + Blockchain audit)

## Tech Stack
- **Backend:** TypeScript/NestJS microservices (8 services)
- **Workers:** Python (5 compute workers: IRT, Matrix, Collusion, TLP, Score Equator)
- **Frontend:** Next.js (3 apps: Admin Dashboard, Candidate Portal, Exam Terminal)
- **Blockchain:** Hyperledger Fabric (3 orgs, Node.js chaincode)
- **Infrastructure:** GKE + Terraform + Helm (one-click deploy/destroy)
- **Data:** Firestore, Redis, BigQuery, GCS, Cloud KMS

## Key Commands
```bash
make deploy ENV=prod PROJECT_ID=your-project    # Deploy everything
make destroy ENV=prod PROJECT_ID=your-project    # Destroy everything
make dev                                          # Local development
make test                                         # Run all tests
make status                                       # Check deployment status
```

## Architecture
- Monorepo: packages/ (TS services), workers/ (Python), chaincode/, terraform/, helm/
- Inter-service: gRPC (internal), REST (external)
- Defense in depth: Cloudflare → GKE Network Policies → API Gateway → Service Guards → Data Layer → Crypto → Audit

## Critical Paths
- **O(1) Paper Generation:** Single Redis GET for pre-rendered paper (< 1ms)
- **Key Release:** Cloud KMS scheduled at exam start ± 5s, TLP as cryptographic fallback
- **Collusion Detection:** Pairwise log-likelihood ratio with FPR < 0.0001

## Design Docs
- specs/2026-03-21-pariksha-suraksha-design.md — Full design specification
- specs/2026-03-21-pariksha-suraksha-design-addendum.md — Review fixes (19 issues)
