<p align="center">
  <h1 align="center">🛡️ ParikshaSuraksha</h1>
  <p align="center">
    <strong>AI-Powered Exam Integrity & Anti-Cheating Engine</strong>
  </p>
  <p align="center">
    Eliminating paper leaks · Detecting cheating · Proving fairness
  </p>
  <p align="center">
    <a href="https://pariksha.dmj.one">Live Demo</a> ·
    <a href="https://pariksha.dmj.one/about">About</a> ·
    <a href="https://pariksha.dmj.one/pitch">Pitch Deck</a> ·
    <a href="docs/superpowers/specs/2026-03-21-pariksha-suraksha-design.md">Design Spec</a>
  </p>
</p>

---

## The Problem

India's examination system is broken. **40+ major exam paper leaks** in 2023-2024. The NEET-UG 2024 scandal affected **24 lakh candidates** and required Supreme Court intervention. UGC-NET June 2024 was cancelled entirely. **15 million+ aspirants** are affected annually.

The root cause: a single question paper passes through 5-8 custody handoffs before the exam. **One compromised link destroys the entire exam.**

## The Solution

ParikshaSuraksha introduces three interlocking innovations that make exams **leak-proof, cheat-proof, and audit-proof**:

### 🎯 Innovation 1: O(1) Isomorphic Question Generation

Every candidate receives a **unique question paper** — same difficulty, same topics, different questions. Leaking one paper is useless.

- Parameterized question templates calibrated using **Item Response Theory (3PL model)**
- Precomputed **combinatorial assignment matrix** ensures identical difficulty distributions
- Paper generation per candidate: **O(1) table lookup** (single Redis GET, <1ms)
- Adjacent candidates share **<10% of questions**

### 🔍 Innovation 2: Statistical Collusion Detection

AI detects cheating patterns humans can't see — with **mathematical proof, not guesswork**.

- Pairwise **log-likelihood ratio** analysis of answer patterns
- Precomputed **distractor attractiveness profiles** from field testing
- False positive rate: **<0.0001** (calibrated threshold)
- BFS-based **cheating ring detection** across exam centers
- PDF evidence reports that **withstand legal scrutiny**

### 🔐 Innovation 3: Zero-Knowledge Exam Lifecycle

The complete question paper **never exists** as a single document until exam start.

- Each question **individually encrypted** (AES-256-GCM via Cloud KMS HSMs)
- **Time-lock puzzles** (RSA, 4096-bit) as cryptographic fallback
- **Shamir's Secret Sharing** (3-of-5 threshold) for emergency key release
- **Hyperledger Fabric** blockchain audit trail (3 organizations, Raft consensus)
- **O(1) Merkle proof verification** for any lifecycle event

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUDFLARE (DDoS/WAF)                 │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                     GKE CLUSTER                          │
│                                                          │
│  ┌── API Services (NestJS) ──────────────────────────┐  │
│  │ API Gateway · Question Service · Paper Generator   │  │
│  │ Crypto Lifecycle · Exam Session · Collusion Engine │  │
│  │ Blockchain Service                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌── Web Apps (Next.js) ─────────────────────────────┐  │
│  │ Admin Dashboard · Candidate Portal · Exam Terminal │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌── Python Workers ─────────────────────────────────┐  │
│  │ IRT Calibrator · Matrix Solver · Collusion Detector│  │
│  │ TLP Generator · Score Equator                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌── Hyperledger Fabric ─────────────────────────────┐  │
│  │ 3 Organizations · 5 Peers · 3 Orderers (Raft)     │  │
│  │ exam-audit chaincode · Merkle proof verification   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
         │              │              │
    ┌────▼────┐  ┌──────▼──────┐  ┌───▼────┐
    │Firestore│  │Cloud KMS/HSM│  │BigQuery│
    │  Redis  │  │  GCS Blobs  │  │Pub/Sub │
    └─────────┘  └─────────────┘  └────────┘
```

### Defense in Depth (7 Layers)

| Layer | Protection |
|-------|-----------|
| 0 | **Cloudflare** — DDoS, WAF, bot detection |
| 1 | **GKE Network Policies** — namespace isolation, pod-to-pod firewall |
| 2 | **API Gateway** — JWT (RS256), RBAC (6 roles), rate limiting |
| 3 | **Service Guards** — per-service auth re-validation, input sanitization |
| 4 | **Data Layer** — Firestore rules, KMS IAM, Redis ACLs |
| 5 | **Crypto** — AES-256-GCM, HSM-backed keys, TLP fallback, Shamir 3-of-5 |
| 6 | **Audit** — every mutation blockchain-recorded, Merkle proof verifiable |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | TypeScript, NestJS 10+, gRPC, Protocol Buffers |
| **Frontend** | Next.js 15, React 19, Tailwind CSS, shadcn/ui |
| **Compute** | Python 3.12 (NumPy, SciPy, reportlab) |
| **Database** | Firestore, Redis 7 (Memorystore), BigQuery |
| **Crypto** | Cloud KMS (HSM), AES-256-GCM, RSA TLP, Shamir GF(256) |
| **Blockchain** | Hyperledger Fabric 2.5, CouchDB, Raft consensus |
| **AI** | Gemini 2.5 Pro (Vertex AI) for question generation |
| **Infra** | GKE, Terraform, Helm, Docker |
| **Monitoring** | Prometheus, Cloud Monitoring, alert policies |

## Project Structure

```
pariksha-suraksha/
├── packages/                          # TypeScript services & frontends
│   ├── shared/                        #   Shared types, validation, constants
│   ├── api-gateway/                   #   Auth, RBAC, rate limiting, routing
│   ├── question-service/              #   Template CRUD, Gemini integration
│   ├── paper-generator/               #   O(1) matrix lookup, rendering
│   ├── crypto-lifecycle/              #   KMS, TLP, Shamir, key scheduling
│   ├── exam-session-service/          #   Checkpoints, responses, encryption
│   ├── collusion-engine/              #   Detection triggers, results, clusters
│   ├── blockchain-service/            #   Fabric SDK, Merkle proofs, events
│   ├── admin-dashboard/               #   Exam authority UI (Next.js)
│   └── candidate-portal/             #   Candidate UI + exam terminal (Next.js)
├── workers/                           # Python compute workers
│   ├── irt-calibrator/                #   3PL IRT model fitting (MMLE)
│   ├── matrix-solver/                 #   Constraint satisfaction + sim. annealing
│   ├── collusion-detector/            #   Pairwise log-likelihood + clustering
│   ├── tlp-generator/                 #   RSA time-lock puzzle generation
│   └── score-equator/                #   IRT-based score equating + KS test
├── chaincode/                         # Hyperledger Fabric smart contract
│   └── exam-audit/                    #   Audit event recording + queries
├── proto/                             # gRPC protobuf definitions (6 services)
├── terraform/                         # GCP infrastructure (12 modules)
│   ├── modules/                       #   network, gke, kms, storage, etc.
│   ├── env/                           #   prod.tfvars, mvp.tfvars, dev.tfvars
│   └── scripts/                       #   fabric-setup.sh, fabric-teardown.sh
├── helm/                              # Kubernetes deployment (57 templates)
│   ├── templates/                     #   Per-service deployments, services, HPAs
│   └── values-{env}.yaml             #   Environment-specific configs
├── docs/                              # Design specs and addendum
├── Makefile                           # One-click deploy / destroy
├── docker-compose.dev.yml             # Local development environment
└── package.json                       # Monorepo workspace root
```

## Quick Start

### One-Click Deploy (GCP)

```bash
# Set your GCP project
export PROJECT_ID=your-gcp-project

# Deploy everything: infra + build + push + helm
make deploy ENV=prod PROJECT_ID=$PROJECT_ID REGION=asia-south1
```

### One-Click Destroy

```bash
make destroy ENV=prod PROJECT_ID=$PROJECT_ID REGION=asia-south1
```

### Local Development

```bash
# Start all services locally with emulators
make dev

# Or use docker compose directly
docker compose -f docker-compose.dev.yml up --build
```

### Run Tests

```bash
make test          # All services + workers
make test-services # TypeScript services only
make test-workers  # Python workers only
```

## Key Metrics

| Metric | Target | How |
|--------|--------|-----|
| Paper generation | <1ms per candidate | Single Redis GET (pre-rendered) |
| Collusion detection | <15min per 500-candidate center | O(1) per pair, parallelized |
| Key release precision | ±5 seconds | Cloud KMS scheduled + TLP fallback |
| Audit verification | <5ms per event | O(log 100) Merkle proof |
| False positive rate | <0.0001 | Calibrated log-likelihood threshold |

## Mathematical Foundations

**3PL IRT Model** for question calibration:

$$P(X = 1 | \theta) = c + \frac{1-c}{1+e^{-a(\theta-b)}}$$

**Collusion Log-Likelihood Ratio:**

$$\log \Lambda_{uv} = \sum_{q=1}^{Q} \ell_q(u, v)$$

**Time-Lock Puzzle:**

$$C = k + a^{2^t} \bmod n$$

## Roadmap

- [x] Phase 1: Question bank + isomorphic generation MVP
- [x] Phase 2: Collusion detection + crypto lifecycle
- [x] Phase 3: Full deployment with blockchain audit trail
- [ ] Phase 4: NTA pilot partnership
- [ ] Phase 5: Multi-language support (Hindi, regional languages)
- [ ] Phase 6: Global expansion

## Global Applicability

Exam fraud is a **$14.8 billion global problem**:

- **China (Gaokao):** 13.4M students, organized fraud despite 7-year prison sentences
- **UK (A-Levels 2020):** Algorithmic grading scandal, 40% downgrades, resignations
- **US (SAT):** Repeated security breaches, test recycling across administrations

ParikshaSuraksha's architecture is **language-agnostic and exam-format-agnostic**.

## Vision

**Aatmnirbhar Viksit Bharat 2047** — Built in India. For India. And beyond.

ParikshaSuraksha is part of the [dmj.one](https://dmj.one) ecosystem — *Dream. Manifest. Journey. Together as one.*

300 million aspirants deserve an exam system where **merit, not manipulation**, determines outcomes. ParikshaSuraksha provides **mathematical proof of exam fairness** — transforming trust from faith-based to evidence-based.

## License

Proprietary. Patent pending. All rights reserved.

**Author:** [Divya Mohan](https://github.com/divyamohan1993)

---

<p align="center">
  <strong>परीक्षा सुरक्षा — Protecting the exam. Protecting the dream.</strong>
</p>
