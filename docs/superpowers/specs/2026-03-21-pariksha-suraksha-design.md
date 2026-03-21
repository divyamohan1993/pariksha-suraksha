# ParikshaSuraksha — Implementation Design Specification

**Date:** 2026-03-21
**Status:** Approved
**Author:** Divya Mohan + Claude
**Deploy Target:** pariksha.dmj.one on GCP (GKE)

---

## 1. Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full system — all 3 innovations, no placeholders | User requirement |
| Infrastructure | GKE + Terraform (one-click deploy/destroy) | Microservices architecture, auto-scaling, production-grade |
| Blockchain | Multi-org Hyperledger Fabric (3 orgs) on GKE | True multi-party trust model per spec vision |
| Question generation | Gemini API generates templates, human reviews | Spec-defined workflow |
| Time-lock crypto | Cloud KMS primary + real TLP fallback | Full patent claim compliance |
| Backend stack | TypeScript (NestJS) APIs + Python compute workers | Type-safe APIs, math-optimized workers |
| Frontend stack | Next.js (3 apps sharing component library) | Shared types with backend, SSR for SEO |
| Inter-service comm | gRPC (service-to-worker), REST (client-to-gateway) | Performance for internal, compatibility for external |

---

## 2. System Architecture

### 2.1 Service Decomposition

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE                               │
│              DDoS · WAF · Bot Protection · DNS                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     GKE CLUSTER                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  NAMESPACE: pariksha-api                                 │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌────────────┐ │    │
│  │  │ API Gateway  │→ │ Question Service│  │ Paper Gen  │ │    │
│  │  │ (NestJS)     │→ │ (NestJS)        │  │ (NestJS)   │ │    │
│  │  │ Auth/RBAC    │→ │ Template CRUD   │  │ O(1) Lookup│ │    │
│  │  │ Rate Limit   │  │ Gemini SDK      │  │ Rendering  │ │    │
│  │  └──────────────┘  └─────────────────┘  └────────────┘ │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌────────────┐ │    │
│  │  │ Crypto       │  │ Collusion       │  │ Blockchain │ │    │
│  │  │ Lifecycle    │  │ Engine          │  │ Service    │ │    │
│  │  │ (NestJS)     │  │ (NestJS)        │  │ (NestJS)   │ │    │
│  │  │ KMS + TLP    │  │ Triggers Workers│  │ Fabric SDK │ │    │
│  │  └──────────────┘  └─────────────────┘  └────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  NAMESPACE: pariksha-web                                 │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌────────────┐ │    │
│  │  │ Admin        │  │ Candidate       │  │ Exam       │ │    │
│  │  │ Dashboard    │  │ Portal          │  │ Terminal   │ │    │
│  │  │ (Next.js)    │  │ (Next.js)       │  │ (Next.js)  │ │    │
│  │  └──────────────┘  └─────────────────┘  └────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  NAMESPACE: pariksha-workers                             │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌────────────┐ │    │
│  │  │ IRT          │  │ Matrix          │  │ Collusion  │ │    │
│  │  │ Calibrator   │  │ Solver          │  │ Detector   │ │    │
│  │  │ (Python Job) │  │ (Python Job)    │  │ (Python Job│ │    │
│  │  └──────────────┘  └─────────────────┘  └────────────┘ │    │
│  │                                                          │    │
│  │  ┌──────────────┐                                        │    │
│  │  │ TLP          │                                        │    │
│  │  │ Generator    │                                        │    │
│  │  │ (Python Job) │                                        │    │
│  │  └──────────────┘                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  NAMESPACE: pariksha-fabric                              │    │
│  │                                                          │    │
│  │  ParikshaSurakshaOrg    NTAOrg         AuditorOrg       │    │
│  │  ┌─────┐ ┌─────┐  ┌─────┐ ┌─────┐  ┌─────┐           │    │
│  │  │Peer0│ │Peer1│  │Peer0│ │Peer1│  │Peer0│           │    │
│  │  └─────┘ └─────┘  └─────┘ └─────┘  └─────┘           │    │
│  │  ┌──┐              ┌──┐              ┌──┐               │    │
│  │  │CA│              │CA│              │CA│               │    │
│  │  └──┘              └──┘              └──┘               │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │    │
│  │  │Orderer0 │  │Orderer1 │  │Orderer2 │  (Raft)         │    │
│  │  └─────────┘  └─────────┘  └─────────┘                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  NAMESPACE: pariksha-data                                │    │
│  │  Redis (Memorystore) · Firestore · GCS · BigQuery        │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Defense in Depth Layers

```
Layer 0: Cloudflare          — DDoS, WAF, bot detection, TLS termination
Layer 1: GKE Network Policy  — namespace isolation, pod-to-pod firewall
Layer 2: API Gateway         — JWT validation, RBAC guards, rate limiting (token bucket)
Layer 3: Service Guards      — per-service auth re-validation, input sanitization (class-validator)
Layer 4: Data Access         — Firestore security rules, KMS IAM, least-privilege service accounts
Layer 5: Crypto              — per-question AES-256-GCM, HSM-backed keys, TLP fallback
Layer 6: Audit               — every mutation → blockchain event, Merkle proof verifiable
Layer 7: Monitoring          — anomaly detection on access patterns, real-time alerting
```

### 2.3 Inter-Service Communication

```
Client → API Gateway:         HTTPS/REST (JSON)
API Gateway → Services:       gRPC (protobuf) via cluster-internal DNS
Services → Python Workers:    Cloud Pub/Sub (job trigger) + GCS (data exchange)
Services → Fabric:            Fabric Gateway SDK (gRPC to peers)
Services → Firestore:         Firestore SDK (gRPC)
Services → Redis:             ioredis (RESP protocol)
Services → KMS:               Cloud KMS SDK (gRPC)
Services → Gemini:            Vertex AI SDK (gRPC)
```

---

## 3. Data Architecture

### 3.1 Firestore Collections

```
exams/{examId}
  ├── metadata: { name, date, subjects, totalQuestions, totalCandidates, status }
  ├── blueprint: { difficultyDist, topicCoverage, questionsPerPaper }
  └── centers/{centerId}
        └── seats/{seatNum}
              └── assignment: { questionIds[], paramInstantiationIds[], encryptedBlobUris[] }

questions/{templateId}
  ├── metadata: { subject, topic, subtopic, bloomLevel, fieldTestCount, calibrationDate }
  ├── template: { text, parameters[], answerFormula, distractors[] }
  ├── irtParams: { aMean, aStd, bMean, bStd, cMean, cStd }
  └── instantiations/{instId}
        ├── params: { paramName: value, ... }
        ├── irt: { a, b, c }
        └── distractorProfile: { A: prob, B: prob, C: prob, D: prob }

candidates/{candidateId}
  ├── profile: { name, examId, centerId, seatNum, accommodations }
  ├── responses: { encrypted blob URI }
  └── result: { score, equatedScore, verificationHash }

collusionResults/{examId}/{centerId}
  └── pairs/{pairId}: { candidateU, candidateV, logLambda, threshold, flagged, evidence }
```

### 3.2 Redis Schema (Exam Day Hot Cache)

```
Key Pattern                                          Value                TTL
────────────────────────────────────────────────────────────────────────────
exam:{examId}:matrix:{centerId}:{seatNum}           JSON assignment vec   24h
exam:{examId}:question:{questionId}:decrypted       Decrypted question    exam duration + 1h
exam:{examId}:candidate:{candidateId}:checkpoint    Response snapshot     exam duration + 1h
exam:{examId}:status                                 "pending|active|done" 7d
```

### 3.3 BigQuery Tables

```
dataset: pariksha_analytics

tables:
  field_test_responses    — raw calibration data (candidateId, templateId, instId, response, correct, timeSpent)
  irt_parameters          — fitted IRT params per instantiation
  distractor_profiles     — per-question distractor attractiveness vectors
  exam_results            — per-candidate scores for post-exam analytics
  collusion_scores        — pairwise log-likelihood ratios per center
```

### 3.4 GCS Buckets

```
pariksha-encrypted-questions/    — AES-256-GCM encrypted question blobs
  └── {examId}/{questionId}.enc

pariksha-field-test-data/        — raw field test CSVs for IRT calibration
pariksha-backups/                — Firestore exports, encrypted
pariksha-reports/                — generated collusion evidence reports (PDF)
```

---

## 4. Service Specifications

### 4.1 API Gateway (`api-gateway`)

**Framework:** NestJS
**Port:** 3000
**Responsibilities:** Authentication, authorization, rate limiting, request routing

**Endpoints (proxied to downstream):**
```
POST   /auth/login                    → JWT token
POST   /auth/verify-mfa              → MFA validation

GET    /api/v1/questions              → question-service
POST   /api/v1/questions              → question-service
POST   /api/v1/questions/generate     → question-service (Gemini)
PUT    /api/v1/questions/:id          → question-service

POST   /api/v1/exams                  → question-service (create exam)
POST   /api/v1/exams/:id/blueprint    → question-service
POST   /api/v1/exams/:id/matrix       → paper-generator (triggers matrix solver)
GET    /api/v1/exams/:id/matrix/status → paper-generator

GET    /api/v1/exams/:id/paper/:centerId/:seatNum → paper-generator (O(1) lookup)

POST   /api/v1/exams/:id/encrypt      → crypto-lifecycle
POST   /api/v1/exams/:id/distribute   → crypto-lifecycle
GET    /api/v1/exams/:id/keys/status  → crypto-lifecycle
POST   /api/v1/exams/:id/keys/release → crypto-lifecycle (emergency manual)

POST   /api/v1/exams/:id/collusion/run    → collusion-engine
GET    /api/v1/exams/:id/collusion/results → collusion-engine

GET    /api/v1/audit/events/:examId   → blockchain-service
GET    /api/v1/audit/verify/:eventId  → blockchain-service
GET    /api/v1/audit/proof/:eventId   → blockchain-service

POST   /api/v1/exam-session/start     → paper-generator + crypto-lifecycle
POST   /api/v1/exam-session/submit    → paper-generator
POST   /api/v1/exam-session/checkpoint → paper-generator

GET    /api/v1/verify/:submissionHash → candidate verification
```

**Guards (Defense in Depth):**
```typescript
@UseGuards(JwtAuthGuard)          // Layer 2: validate JWT
@UseGuards(RbacGuard)             // Layer 2: role-based access
@UseGuards(RateLimitGuard)        // Layer 2: token bucket per IP/user
@UsePipes(ValidationPipe)         // Layer 3: class-validator schemas
@UseInterceptors(AuditInterceptor) // Layer 6: blockchain audit logging
```

**Roles:** `SUPER_ADMIN`, `EXAM_CONTROLLER`, `QUESTION_SETTER`, `INVIGILATOR`, `CANDIDATE`, `AUDITOR`

### 4.2 Question Service (`question-service`)

**Responsibilities:** Template CRUD, Gemini-based template generation, validation, field test data ingestion

**Gemini Integration:**
```
Input:  { subject, topic, subtopic, bloomLevel, exampleTemplate? }
Output: { templateText, parameters[], answerFormula, distractors[] }
Model:  gemini-2.5-pro (via Vertex AI)
```

**Validation Pipeline:**
1. Gemini generates candidate template
2. Symbolic answer formula verified (SymPy via Python worker)
3. Parameter range check (all instantiations yield solvable problems)
4. Distractor plausibility check (distractors ≠ correct answer for any instantiation)
5. Human review in Admin Dashboard
6. Field testing triggered (IRT Calibrator worker)
7. IRT params verified within tolerance → template enters production bank

### 4.3 Paper Generator (`paper-generator`)

**Responsibilities:** Matrix solver orchestration, O(1) paper lookup, rendering

**O(1) Hot Path (exam day):**
```
GET /paper/:centerId/:seatNum
  1. Redis.get(exam:{examId}:matrix:{centerId}:{seatNum})     — O(1)
  2. For each questionId in assignment:
       Redis.get(exam:{examId}:question:{questionId}:decrypted) — O(1)
  3. Render paper JSON                                          — O(Q) = O(1) for fixed Q
  4. Return to exam terminal
```

**Matrix Solver (batch, pre-exam):**
- Triggers `matrix-solver` Python worker via Pub/Sub
- Worker runs constraint satisfaction + simulated annealing
- Result written to Firestore + preloaded into Redis
- Progress reported via Pub/Sub → WebSocket to Admin Dashboard

### 4.4 Crypto Lifecycle (`crypto-lifecycle`)

**Responsibilities:** Per-question encryption, TLP generation, key scheduling, emergency key release

**Encryption Flow:**
```
1. For each question in assignment matrix:
   a. Cloud KMS: generateDataEncryptionKey() → (plaintext_key, encrypted_key)
   b. AES-256-GCM encrypt question blob with plaintext_key
   c. Store encrypted blob → GCS
   d. Store encrypted_key → Firestore
   e. Trigger TLP Generator worker: seal plaintext_key in time-lock puzzle
   f. Record blockchain event: { type: "encrypt", hash: SHA256(question) }
   g. Destroy plaintext_key from memory (zeroize)
```

**Scheduled Key Release:**
```
1. Cloud Scheduler triggers at exam_start_time - 60s
2. Service pre-warms: loads encrypted keys from Firestore
3. At exam_start_time ± 0s:
   a. Cloud KMS decrypt all encrypted_keys for the exam
   b. Push decrypted questions to Redis cache
   c. Record blockchain event: { type: "key_release", timestamp }
4. Simultaneously: TLP puzzles become solvable (calibrated timing)
```

**Shamir's Secret Sharing (Emergency):**
```
- 5 key fragments distributed to: 2 exam controllers, 2 NTA officials, 1 independent auditor
- Any 3 fragments reconstruct the master key
- Emergency release requires 3-of-5 approval in Admin Dashboard
- All emergency events blockchain-recorded
```

### 4.5 Collusion Engine (`collusion-engine`)

**Responsibilities:** Trigger collusion detection, serve results, generate evidence reports

**Flow:**
```
1. POST /collusion/run → publish job to Pub/Sub
2. Python collusion-detector worker:
   a. Load responses for all candidates at center
   b. Load distractor profiles from BigQuery materialized view
   c. For each pair (u,v) sharing questions:
      - Compute log-likelihood ratio Λ_uv (O(1) per question)
      - Compare against threshold τ (calibrated for FPR < 0.0001)
   d. Cluster analysis: connected components of flagged pairs
   e. Write results to Firestore + BigQuery
   f. Generate PDF evidence reports → GCS
3. Admin Dashboard polls for completion, displays results
```

### 4.6 Blockchain Service (`blockchain-service`)

**Responsibilities:** Fabric SDK operations, event recording, Merkle proof generation/verification

**Chaincode Functions:**
```javascript
// exam-audit chaincode (Node.js)

async recordEvent(ctx, eventType, examId, entityHash, metadata) {
  const event = {
    eventId: uuid(),
    eventType,        // question_create | encrypt | distribute | key_release | decrypt | submit | grade
    examId,
    entityHash,       // SHA-256 of affected entity
    timestamp: new Date().toISOString(),
    actorId: ctx.clientIdentity.getID(),
    actorOrg: ctx.clientIdentity.getMSPID(),
    metadata: JSON.parse(metadata)
  };
  await ctx.stub.putState(event.eventId, Buffer.from(JSON.stringify(event)));
  // Composite key for range queries
  await ctx.stub.putState(
    ctx.stub.createCompositeKey('exam~event', [examId, event.eventId]),
    Buffer.from(JSON.stringify(event))
  );
  return event;
}

async verifyEvent(ctx, eventId) {
  const eventBytes = await ctx.stub.getState(eventId);
  if (!eventBytes || eventBytes.length === 0) {
    return { verified: false, reason: 'Event not found' };
  }
  // Merkle proof is implicit in Fabric's block structure
  // Return event + block metadata for external verification
  return { verified: true, event: JSON.parse(eventBytes.toString()) };
}

async getEventsByExam(ctx, examId) {
  const iterator = await ctx.stub.getStateByPartialCompositeKey('exam~event', [examId]);
  const events = [];
  while (true) {
    const result = await iterator.next();
    if (result.done) break;
    events.push(JSON.parse(result.value.value.toString()));
  }
  return events;
}
```

**Endorsement Policy:**
```
Writes: AND('ParikshaSurakshaMSP.peer', 'NTAMSP.peer')
Reads:  OR('ParikshaSurakshaMSP.peer', 'NTAMSP.peer', 'AuditorMSP.peer')
```

---

## 5. Python Workers

### 5.1 IRT Calibrator (`irt-calibrator`)

**Input:** Field test response data (CSV from BigQuery)
**Output:** IRT parameters per instantiation → BigQuery + Firestore

```python
# 3PL IRT model fitting using marginal maximum likelihood
# Libraries: numpy, scipy, pyirt or custom implementation

def fit_3pl(responses: np.ndarray) -> Tuple[float, float, float]:
    """Fit 3PL IRT model: returns (a, b, c) parameters."""
    # Marginal Maximum Likelihood Estimation (MMLE)
    # E-step: estimate ability distribution
    # M-step: maximize item parameters
    # Iterate until convergence
    pass

def verify_isomorphic_equivalence(params_by_inst: Dict[str, Tuple]) -> bool:
    """Verify all instantiations of a template are within tolerance."""
    a_vals = [p[0] for p in params_by_inst.values()]
    b_vals = [p[1] for p in params_by_inst.values()]
    c_vals = [p[2] for p in params_by_inst.values()]
    return (
        max(a_vals) - min(a_vals) < EPSILON_A and  # 0.3
        max(b_vals) - min(b_vals) < EPSILON_B and  # 0.15
        max(c_vals) - min(c_vals) < EPSILON_C      # 0.05
    )
```

### 5.2 Matrix Solver (`matrix-solver`)

**Input:** Exam blueprint, question bank IRT params, center/seat layout
**Output:** Assignment matrix → Firestore

```python
# Constraint satisfaction + simulated annealing
# Objective: minimize max difficulty deviation while satisfying:
#   1. Topic coverage per blueprint
#   2. < 10% overlap between adjacent seats
#   3. < 15% overlap between different centers

def solve_assignment_matrix(
    blueprint: ExamBlueprint,
    questions: List[CalibratedQuestion],
    centers: List[CenterLayout]
) -> AssignmentMatrix:
    # Initialize random valid assignments
    # Simulated annealing: swap questions between papers
    # Energy function: weighted sum of constraint violations
    # Temperature schedule: exponential cooling
    # Convergence: all constraints satisfied or max iterations
    pass
```

### 5.3 Collusion Detector (`collusion-detector`)

**Input:** Candidate responses, distractor profiles, seating layout
**Output:** Flagged pairs with evidence → Firestore + BigQuery + GCS (PDF reports)

```python
def compute_collusion_score(
    responses_u: np.ndarray,
    responses_v: np.ndarray,
    shared_questions: List[int],
    distractor_profiles: Dict[int, np.ndarray],
    correct_answers: Dict[int, int]
) -> float:
    """Compute log-likelihood ratio for pair (u, v). O(Q) = O(1) for fixed Q."""
    log_lambda = 0.0
    for q in shared_questions:
        r_u, r_v = responses_u[q], responses_v[q]
        correct = correct_answers[q]
        profile = distractor_profiles[q]  # precomputed, O(1) lookup

        if r_u == correct or r_v == correct:
            continue  # only analyze wrong-wrong matches

        if r_u == r_v:  # same wrong answer
            p_k = profile[r_u]
            p_wrong_total = sum(profile[k] for k in range(4) if k != correct)
            # Under independence: (p_k / p_wrong_total)^2
            # Under collusion: p_k / p_wrong_total
            log_lambda += math.log(p_wrong_total / p_k)  # O(1)
        # else: different wrong answers → evidence against collusion
    return log_lambda
```

### 5.4 TLP Generator (`tlp-generator`)

**Input:** Encryption key, target release time
**Output:** Time-lock puzzle params → Firestore

```python
def generate_time_lock_puzzle(
    key: bytes,
    target_time: datetime,
    hardware_benchmark_squarings_per_sec: int
) -> TimeLockPuzzle:
    """Generate RSA time-lock puzzle sealing key until target_time."""
    # Generate safe primes p, q (2048-bit each)
    p = generate_safe_prime(2048)
    q = generate_safe_prime(2048)
    n = p * q

    # Calculate required sequential squarings
    seconds_until_release = (target_time - datetime.utcnow()).total_seconds()
    t = int(seconds_until_release * hardware_benchmark_squarings_per_sec)

    # Random base
    a = random.randint(2, n - 1)

    # Compute a^(2^t) mod n USING THE SHORTCUT (we know φ(n))
    phi_n = (p - 1) * (q - 1)
    e = pow(2, t, phi_n)          # 2^t mod φ(n) — fast
    result = pow(a, e, n)         # a^(2^t) mod n — fast with shortcut

    # Seal the key
    key_int = int.from_bytes(key, 'big')
    cipher = (key_int + result) % n

    # DESTROY p, q, phi_n — without these, solving requires t sequential squarings
    del p, q, phi_n, e

    return TimeLockPuzzle(n=n, a=a, t=t, cipher=cipher)
```

---

## 6. Frontend Specifications

### 6.1 Shared Component Library (`packages/shared-ui`)

**Design System:** Tailwind CSS + shadcn/ui components
**State Management:** Zustand (lightweight, TypeScript-first)
**Data Fetching:** TanStack Query (React Query)
**Real-time:** WebSocket (Socket.io) for exam-day monitoring

**Shared Components:**
- `QuestionRenderer` — renders parameterized question with LaTeX (KaTeX)
- `BlockchainVerifier` — input event ID, display Merkle proof verification
- `DifficultyHistogram` — visualize IRT difficulty distribution across papers
- `AuditTimeline` — chronological blockchain event display
- `AccessibleExamShell` — screen reader, high contrast, large font wrapper

### 6.2 Admin Dashboard

**Pages:**
```
/admin
├── /dashboard              — overview: exams, question bank stats, alerts
├── /questions
│   ├── /bank               — browse/search templates
│   ├── /generate           — Gemini template generation + review
│   ├── /calibrate          — field test management, IRT results
│   └── /:id               — template detail + instantiation viewer
├── /exams
│   ├── /create             — new exam wizard
│   ├── /:id/blueprint      — topic/difficulty distribution builder
│   ├── /:id/matrix         — matrix generation progress + preview
│   ├── /:id/encrypt        — encryption + distribution workflow
│   ├── /:id/monitor        — exam-day real-time dashboard
│   ├── /:id/collusion      — collusion detection results + evidence
│   └── /:id/results        — score distribution, equating, publish
├── /audit                  — blockchain event explorer
├── /centers                — center management, terminal status
└── /settings               — users, roles, MFA, system config
```

### 6.3 Candidate Portal

**Pages:**
```
/
├── /                       — landing page
├── /verify/:hash           — blockchain verification of submission
├── /results/:examId        — score + Merkle proof
└── /exam                   — exam terminal (authenticated)
```

### 6.4 Exam Terminal (CBT Interface)

**Features:**
- Question display with KaTeX rendering
- Navigation panel (question grid, mark-for-review, visited/unvisited status)
- Countdown timer with warnings at 15m, 5m, 1m
- Auto-checkpoint every 30 seconds (local + cloud)
- Offline mode: all encrypted questions pre-loaded, responses cached locally
- Accessibility: NVDA/JAWS compatible, switch access, eye tracking input
- Submit → encrypted response blob → GCS + blockchain audit event

---

## 7. Terraform Infrastructure

### 7.1 Module Structure

```
terraform/
├── main.tf                  — root module, calls all child modules
├── variables.tf             — input variables (project_id, region, env)
├── outputs.tf               — key outputs (cluster endpoint, URLs)
├── backend.tf               — GCS remote state backend
├── env/
│   ├── prod.tfvars
│   └── dev.tfvars
├── modules/
│   ├── network/             — VPC, subnets, Cloud NAT, firewall rules
│   ├── gke/                 — GKE cluster, node pools, workload identity
│   ├── kms/                 — key rings, crypto keys, IAM
│   ├── storage/             — GCS buckets with encryption
│   ├── firestore/           — Firestore database, indexes
│   ├── redis/               — Memorystore for Redis
│   ├── bigquery/            — dataset, tables, views
│   ├── pubsub/              — topics + subscriptions for worker triggers
│   ├── dns/                 — Cloud DNS zone + records
│   ├── monitoring/          — dashboards, alert policies, uptime checks
│   ├── iam/                 — service accounts, workload identity, least-privilege
│   └── fabric/              — GKE resources for Hyperledger Fabric
└── scripts/
    ├── deploy.sh            — terraform apply + helm install
    └── destroy.sh           — helm uninstall + terraform destroy
```

### 7.2 GKE Node Pools

```hcl
# General workloads (API services, web frontends)
node_pool "general" {
  machine_type = "e2-standard-4"   # 4 vCPU, 16 GB
  min_count    = 2
  max_count    = 10
  auto_scaling = true
}

# Compute-intensive (Python workers: matrix solver, IRT calibration)
node_pool "compute" {
  machine_type = "c2-standard-8"   # 8 vCPU, 32 GB
  min_count    = 0
  max_count    = 5
  auto_scaling = true
  taint        = "workload=compute:NoSchedule"
}

# Fabric peers and orderers (persistent storage needs)
node_pool "fabric" {
  machine_type = "e2-standard-4"
  min_count    = 3
  max_count    = 5
  auto_scaling = true
  taint        = "workload=fabric:NoSchedule"
}
```

### 7.3 One-Click Commands

```makefile
# Makefile at repo root

deploy:
	cd terraform && terraform init && terraform apply -auto-approve -var-file=env/$(ENV).tfvars
	gcloud container clusters get-credentials pariksha-$(ENV) --region $(REGION)
	./scripts/fabric-setup.sh $(ENV)
	helm upgrade --install pariksha ./helm -f helm/values-$(ENV).yaml --wait --timeout 10m
	@echo "Deployed to https://pariksha.dmj.one"

destroy:
	helm uninstall pariksha || true
	./scripts/fabric-teardown.sh $(ENV) || true
	cd terraform && terraform destroy -auto-approve -var-file=env/$(ENV).tfvars
	@echo "All resources destroyed"
```

---

## 8. Helm Chart Structure

```
helm/
├── Chart.yaml
├── values.yaml                — defaults
├── values-prod.yaml           — production overrides
├── values-dev.yaml            — development overrides
├── templates/
│   ├── _helpers.tpl
│   ├── namespaces.yaml
│   ├── network-policies.yaml
│   ├── api-gateway/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml
│   │   └── ingress.yaml
│   ├── question-service/
│   ├── paper-generator/
│   ├── crypto-lifecycle/
│   ├── collusion-engine/
│   ├── blockchain-service/
│   ├── admin-dashboard/
│   ├── candidate-portal/
│   ├── exam-terminal/
│   ├── workers/
│   │   ├── irt-calibrator-job.yaml
│   │   ├── matrix-solver-job.yaml
│   │   ├── collusion-detector-job.yaml
│   │   └── tlp-generator-job.yaml
│   ├── fabric/
│   │   ├── configmap-fabric-config.yaml
│   │   ├── statefulset-peers.yaml
│   │   ├── statefulset-orderers.yaml
│   │   ├── statefulset-cas.yaml
│   │   └── job-chaincode-install.yaml
│   └── monitoring/
│       ├── servicemonitor.yaml
│       └── prometheusrule.yaml
```

---

## 9. CI/CD & Testing Strategy

**Testing Pyramid:**
- Unit tests: each service (Jest for TS, pytest for Python)
- Integration tests: service-to-database, service-to-KMS, service-to-Fabric
- Contract tests: gRPC protobuf schema validation
- E2E tests: Playwright for admin dashboard, candidate portal, exam terminal
- Load tests: k6 for exam-day simulation (10K concurrent candidates)
- Crypto tests: TLP correctness verification, KMS key lifecycle

**O(1) Verification Tests:**
- Paper generation: benchmark must complete in < 10ms regardless of candidate count
- Collusion per-pair: benchmark must complete in < 1ms regardless of exam size
- Audit verification: Merkle proof check must complete in < 5ms

---

## 10. Monitoring & Observability

**Metrics (Cloud Monitoring):**
- Paper generation latency (p50, p95, p99)
- Key release timing accuracy (deviation from scheduled time)
- Blockchain event recording latency
- Collusion detection job duration
- Per-service error rates and throughput

**Alerts:**
- Key release deviation > 5 seconds → P0
- Paper generation latency > 100ms → P1
- Fabric peer disconnection → P1
- Any unauthorized KMS key access attempt → P0

**Dashboards:**
- Exam Day Operations: real-time center status, decryption progress, candidate throughput
- Security: KMS access audit, blockchain event rate, anomaly detection
- Infrastructure: GKE node utilization, pod health, network throughput

---

## 11. Compliance & Data Lifecycle

- **DPDP Act 2023**: Candidate PII encrypted at rest (AES-256-GCM) and in transit (TLS 1.3)
- **Retention**: Response data retained 90 days post-result, then irreversibly anonymized
- **Right to erasure**: Candidate can request PII deletion (blockchain events are anonymized, not deleted)
- **FIPS 140-2**: Cloud KMS HSMs are FIPS 140-2 Level 3 certified
- **ISO 27001**: GKE + managed services inherit GCP's ISO 27001 certification
- **RPwD Act 2016**: Full accessibility compliance (screen reader, switch access, compensatory time)
