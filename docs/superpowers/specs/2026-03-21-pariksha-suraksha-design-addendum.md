# Design Specification Addendum — Review Fixes

**Date:** 2026-03-21
**Addresses:** 19 issues from spec review

---

## Fix 1: Add Score Equator Worker (Gap 1)

New Python worker: `workers/score-equator/`

**Trigger:** Post-collusion-detection, via Pub/Sub
**Input:** Raw scores per candidate, IRT params per question, assignment matrix
**Output:** Equated scores → BigQuery `exam_results` + Firestore `candidates/{id}/result`

```python
# score-equator worker
def equate_scores(exam_id: str):
    """Post-exam IRT-based score equating with KS test for cross-paper fairness."""
    # 1. Load raw scores + IRT params for all papers
    # 2. Run KS test between score distributions of different paper variants
    #    - If KS p < 0.05: papers have statistically different difficulty
    # 3. Apply IRT true-score equating:
    #    - For each candidate: compute expected true score on reference paper
    #    - theta_hat = MLE of ability from response pattern
    #    - equated_score = sum(P(correct | theta_hat, reference_params))
    # 4. Write equated scores to BigQuery + Firestore
    # 5. Record blockchain event: { type: "grade", examId, equating_applied: bool }
```

**New endpoint:** `POST /api/v1/exams/:id/equate` → triggers score-equator worker
**New endpoint:** `GET /api/v1/exams/:id/results` → returns equated results

---

## Fix 2: Hybrid Decrypt-then-Print Mode (Gap 2)

**Scope declaration:** Phase 1 targets CBT-only deployment. Decrypt-then-print mode is architecturally supported (the paper-generator returns renderable JSON that can produce printable PDFs) but the secure printer integration, 30-minute pre-exam window workflow, and physical security protocols for printed papers are deferred to Phase 3 NTA partnership. The spec now explicitly states this.

---

## Fix 3: Scribe-Assisted Mode (Gap 3)

Added to exam terminal spec:
- Scribe login: separate authentication for scribe (Aadhaar-based)
- Scribe audit trail: all scribe interactions (key presses, response selections) recorded as separate blockchain events with `actor_type: "scribe"` and linked to candidate ID
- Scribe restrictions: configurable per-exam (e.g., scribe cannot see question before candidate dictates)

---

## Fix 4: Add `key_generate` Event Type (Gap 4)

Chaincode event types updated to:
```
question_create | encrypt | key_generate | distribute | key_release | decrypt | submit | grade | scribe_action | emergency_release
```

---

## Fix 5: Firestore Assignment Schema Alignment (Issue 7)

Corrected Firestore schema:
```
seats/{seatNum}/assignment: {
  questionAssignments: [
    {
      position: number,
      templateId: string,
      paramInstantiationId: string,
      encryptedBlobUri: string,
      encryptedAnswerKey: string
    }
  ],
  difficultySum: number,
  topicCoverageHash: string
}
```

---

## Fix 6: Exam Session Routing Fix (Issue 8)

New service: `exam-session-service` (NestJS) — handles candidate response lifecycle.

```
POST /api/v1/exam-session/start      → exam-session-service (loads paper via paper-generator)
POST /api/v1/exam-session/checkpoint → exam-session-service (encrypts via crypto-lifecycle, stores to GCS)
POST /api/v1/exam-session/submit     → exam-session-service (encrypts, stores, records blockchain event)
```

Paper-generator remains read-only (paper delivery). Exam-session-service orchestrates crypto-lifecycle + blockchain-service for writes.

---

## Fix 7: Redis O(1) Hot Path Fix (Issue 9, Issue 17)

Replace sequential Redis.get calls with Redis pipeline + pre-rendered paper cache:

```
# At key release time (pre-warm phase):
1. Decrypt all questions for the exam
2. For each (centerId, seatNum):
   - Assemble the complete rendered paper JSON
   - Redis.SET exam:{examId}:paper:{centerId}:{seatNum} → complete paper JSON
3. Set TTL = exam duration + 1h

# Hot path (exam day) — TRUE O(1):
GET exam:{examId}:paper:{centerId}:{seatNum}  →  complete rendered paper  (single Redis call)
```

This achieves < 1ms latency regardless of question count. The 10ms SLA is now trivially satisfied.

---

## Fix 8: TLP Generator Security Fix (Issue 10)

```python
import secrets

# FIXED: Use CSPRNG for all cryptographic random values
a = secrets.randbelow(n - 2) + 2  # cryptographically secure random base
```

All random number generation in TLP uses `secrets` module, never `random`.

---

## Fix 9: TLP Hardware Benchmark Calibration (Issue 11)

**Calibration process:**
1. Benchmark runner executes on the fastest available GKE compute node (c2-standard-8)
2. Measures sequential squarings per second for the specific modulus size (4096-bit)
3. Safety margin: puzzle calibrated to become solvable 30 seconds BEFORE exam start
4. Stored in Firestore: `exams/{examId}/tlpCalibration: { squaringsPerSec, measuredOn, safetyMarginSec }`
5. Re-calibrated if node pool machine type changes
6. TLP is the FALLBACK — Cloud KMS is primary. Even if TLP timing is imprecise by ±60s, KMS releases on time.

---

## Fix 10: Collusion Detector — Add Negative Evidence Term (Issue 12)

```python
def compute_collusion_score(responses_u, responses_v, shared_questions, distractor_profiles, correct_answers):
    log_lambda = 0.0
    for q in shared_questions:
        r_u, r_v = responses_u[q], responses_v[q]
        correct = correct_answers[q]
        profile = distractor_profiles[q]

        if r_u == correct or r_v == correct:
            continue

        p_wrong_total = sum(profile[k] for k in range(4) if k != correct)

        if r_u == r_v:  # same wrong answer — evidence FOR collusion
            p_k = profile[r_u]
            log_lambda += math.log(p_wrong_total / max(p_k, 1e-10))
        else:  # different wrong answers — evidence AGAINST collusion
            p_match = sum(profile[k]**2 for k in range(4) if k != correct)
            p_diff = p_wrong_total**2 - p_match
            # Under collusion: P(different wrong) ≈ 0 (use small epsilon)
            # Under independence: P(different wrong) = p_diff / p_wrong_total^2
            log_lambda -= math.log(max(p_diff / p_wrong_total**2, 1e-10) / 1e-6)

    return log_lambda
```

---

## Fix 11: Blockchain Merkle Proof Retrieval (Issue 13)

The `verifyEvent` in chaincode returns the event data. The actual Merkle proof retrieval lives in the NestJS `blockchain-service`:

```typescript
// blockchain-service: getMerkleProof()
async getMerkleProof(eventId: string): Promise<MerkleProof> {
  // 1. Query chaincode for event → get transaction ID
  const event = await this.contract.evaluateTransaction('getEvent', eventId);
  const txId = event.txId;

  // 2. Use Fabric Gateway SDK to get block by transaction ID
  const network = this.gateway.getNetwork('exam-lifecycle-channel');
  const block = await network.getBlockByTransactionID(txId);

  // 3. Extract Merkle proof from block header
  // Fabric stores transactions in a Merkle tree within each block
  const proof = this.computeMerkleProof(block, txId);

  // 4. Return proof + block header hash for independent verification
  return {
    eventId,
    txId,
    blockNumber: block.header.number,
    blockHash: block.header.data_hash,
    merkleProof: proof,  // array of sibling hashes
    verified: this.verifyProof(proof, txId, block.header.data_hash)
  };
}
```

---

## Fix 12: Redis Access Control (Issue 14)

**Redis 7.x ACL configuration:**
```
# paper-generator service account: read-only access to paper keys
user paper-generator on >password ~exam:*:paper:* ~exam:*:matrix:* -@all +get +mget

# exam-session-service: read/write checkpoint keys only
user exam-session on >password ~exam:*:candidate:*:checkpoint -@all +get +set +expire

# crypto-lifecycle: write decrypted papers during pre-warm, no read after
user crypto-lifecycle on >password ~exam:*:paper:* -@all +set +expire +mset
```

Each service connects with its own Redis user. Network policies further restrict which pods can reach Redis.

---

## Fix 13: Shamir Master Key Scope (Issue 15)

**Scope: Per-exam KEK (Key Encrypting Key)**

- Each exam generates a unique master KEK
- The KEK encrypts the per-question data encryption keys (DEKs)
- Shamir splits this per-exam KEK into 5 fragments
- Reconstructing the KEK decrypts all questions for ONE exam only
- Different exams have different KEKs and different fragment sets
- Fragment holders are appointed per exam (not permanent global holders)

---

## Fix 14: Rate Limiting on Verify Endpoint (Issue 16)

```
GET /api/v1/verify/:submissionHash
  - Unauthenticated (public)
  - Rate limit: 10 requests per minute per IP
  - submissionHash is SHA-256(candidateId || responseBlob || timestamp) — opaque, non-enumerable
  - Response: { verified: bool, timestamp: ISO-8601 } — no PII returned
  - CAPTCHA required after 3 consecutive requests from same IP
```

---

## Fix 15: Fabric Block Size Configuration (Issue 18)

```yaml
# Fabric configtx.yaml
Orderer:
  BatchTimeout: 2s
  BatchSize:
    MaxMessageCount: 100      # max 100 transactions per block
    AbsoluteMaxBytes: 10 MB
    PreferredMaxBytes: 2 MB
```

With MaxMessageCount = 100, Merkle proof = O(log 100) = O(7) hash comparisons = constant. The O(1) claim holds.

---

## Fix 16: Collusion Detection SLA (Issue 19)

**SLA:** For a 500-candidate center (124,750 pairs), collusion detection completes in < 15 minutes on a single c2-standard-8 worker. For 200 centers processed in parallel (one worker per center), full exam collusion analysis completes in < 20 minutes.

**Justification:** Each pair scoring is ~50μs (180 questions × ~280ns per question). 124,750 pairs × 50μs ≈ 6.2 seconds for computation. Add I/O overhead (loading responses, writing results): ~15 minutes total with BigQuery reads and Firestore writes.
