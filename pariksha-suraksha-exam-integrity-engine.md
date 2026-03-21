# ParikshaSuraksha — AI-Powered Exam Integrity & Anti-Cheating Engine

> **Type:** Patent
> **Status:** Draft
> **Date:** 2026-03-03
> **Author(s):** Divya Mohan
> **Initiative:** dmj.one — *Dream. Manifest. Journey. Together as one.*
> **Vision:** Aatmnirbhar Viksit Bharat 2047

## Abstract

ParikshaSuraksha is an AI-powered exam integrity system that eliminates paper leak vulnerability, detects cheating collusion with statistical rigor, and ensures end-to-end exam lifecycle security through cryptographic guarantees — addressing India's exam integrity crisis that has affected over 15 million competitive exam aspirants in 2023-2024 alone. India witnessed 40+ major exam paper leaks in 2023-2024, including the NEET-UG 2024 scandal (24 lakh candidates affected, Supreme Court intervention) and the UGC-NET June 2024 cancellation. The fundamental problem: question papers exist as complete documents weeks before the exam, pass through 5-8 custody handoffs, and a single compromised link destroys the entire exam. ParikshaSuraksha introduces three novel technical contributions: (1) O(1) isomorphic question generation via precomputed parameterized question templates with Item Response Theory (IRT)-calibrated difficulty equivalence, where each candidate receives a unique question paper drawn from a precomputed combinatorial assignment matrix that guarantees identical difficulty distribution, topic coverage, and cognitive level — with O(1) paper generation per candidate via table lookup; (2) statistical anomaly detection for answer pattern collusion with O(1) per-pair scoring, using precomputed distractor attractiveness profiles from field testing to compute likelihood ratios that distinguish collusion from chance similarity with a false positive rate below 0.0001; and (3) a zero-knowledge exam lifecycle where the complete question paper never exists as a single document — questions are individually encrypted, decryption keys are time-locked to release only at exam start, and every access event is recorded on a blockchain audit trail with O(1) Merkle tree verification. Built on GCP with Gemini APIs, Cloud KMS, and Hyperledger Fabric, deployed at pariksha.dmj.one.

## Background

### Problem Statement

India's examination system is broken. The question paper — a single document meant to evaluate millions of lives — has become the weakest link in the nation's meritocracy.

**The paper leak epidemic:**
- **40+ major exam paper leaks** in 2023-2024 (Parliamentary committee findings)
- **NEET-UG 2024**: 24 lakh candidates affected. Paper leaked in Patna and Hazaribagh. Supreme Court intervention. Re-exam demanded. National outrage. Students' lives disrupted for months.
- **UGC-NET June 2024**: Cancelled entirely within hours of completion due to paper leak. 9 lakh candidates affected. Credibility of NTA (National Testing Agency) shattered.
- **BPSC Teacher Recruitment Exam**: Cancelled 3 times in 2023-2024 due to paper leaks in Bihar
- **SSC exams** have been challenged in court 20+ times for integrity concerns
- **15 million+ competitive exam aspirants** affected annually by paper leaks, cancellations, and integrity concerns
- **Rs 600+ crore** cost per cancelled exam cycle — re-conduct, logistics, legal proceedings, administrative overhead [CITATION NEEDED - TO BE VERIFIED]

**The fundamental vulnerability:**
- Question papers are printed **weeks before the exam** at designated printing presses
- Papers pass through **5-8 custody handoffs**: question setters → moderators → printing press → secure storage → district transport → city transport → center coordinator → invigilator
- **Each handoff is a potential leak point** — the NEET leak involved printing press employees who photographed papers
- Once a single paper is leaked, the ENTIRE exam is compromised — all candidates answered the same questions
- No technological solution exists for the core problem: **the question paper should not exist in its final form until the exam starts**

**The trust deficit:**
- **78% of candidates** report a "trust deficit" in the exam system (FICCI survey 2024) [CITATION NEEDED - TO BE VERIFIED]
- India conducts **~100 major competitive exams** annually affecting **300 million+ candidates** across UPSC, SSC, banking, railways, state PSCs, medical, engineering, and university entrance
- NTA handles 50+ exams but has **no technological anti-leak solution** — relying entirely on physical security that has repeatedly failed
- The coaching industry (Rs 58,000 crore market) has vested interests in early access to paper patterns
- Entire careers, families, and futures depend on exam integrity — cheating is not a victimless crime

**Collusion detection is absent:**
- When papers aren't leaked but candidates cheat through collaboration (copying, Bluetooth devices, proxy examinees), detection relies on invigilator vigilance — highly unreliable
- No systematic statistical analysis of answer patterns is performed post-exam
- Organized cheating rings operate with impunity — selling exam answers via Bluetooth earpieces and smartwatches
- Even when cheating is suspected, proving it requires forensic analysis that is rarely conducted

### Prior Art

1. **NTA (National Testing Agency)**: India's primary exam conducting body for NEET, JEE, UGC-NET, CUET, etc. **Limitations**: Relies on physical paper security (sealed packets, armed escorts). No cryptographic protection. No isomorphic question generation. No statistical collusion detection. Repeated high-profile failures (NEET 2024, UGC-NET 2024).

2. **Computer-Based Testing (CBT) Platforms**: Several exams (JEE Main, SSC CGL) have moved to CBT. **Limitations**: CBT platforms randomize question ORDER within a fixed set — all candidates see the same questions. If the question set leaks, randomization is useless. No isomorphic question generation. No IRT-calibrated difficulty equivalence. No blockchain audit trail.

3. **llm-evaluator (@divyamohan1993)**: AI-powered assessment and evaluation system. **Limitations**: Designed for educational assessment, not high-stakes competitive exam integrity. No isomorphic paper generation. No collusion detection. No cryptographic lifecycle. ParikshaSuraksha extends llm-evaluator's assessment intelligence with exam integrity guarantees.

4. **Proctoring Solutions (Proctorio, ExamSoft, etc.)**: AI-based remote proctoring with webcam monitoring. **Limitations**: Remote proctoring only — useless for in-person exam centers where most Indian competitive exams are held. High false positive rate for flagging suspicious behavior. Privacy concerns. No protection against paper leaks. No statistical collusion detection.

5. **Question Bank Management Systems**: Various commercial systems for creating and managing question banks. **Limitations**: Store questions but do not guarantee IRT-calibrated difficulty equivalence across generated papers. No combinatorial assignment matrices. No cryptographic zero-knowledge lifecycle. No collusion detection.

6. **dmjone Education Platform (@divyamohan1993)**: Open-source CSE education platform. **Limitations**: Educational content delivery, not exam integrity. ParikshaSuraksha provides the tamper-proof assessment layer for dmj.one's education ecosystem.

## Detailed Description

### Core Innovation

ParikshaSuraksha eliminates the fundamental vulnerability of exam systems: the existence of a single, complete question paper that can be leaked. Three interlocking systems make exams leak-proof, cheat-proof, and audit-proof.

**Innovation 1 — O(1) Isomorphic Question Generation via IRT-Calibrated Templates**: Instead of one question paper for all candidates, ParikshaSuraksha generates a unique paper for each candidate. Questions are defined as parameterized templates — e.g., a physics question about projectile motion might have variable initial velocity, angle, and height, with the answer computed symbolically. Each template is calibrated using Item Response Theory (IRT) to ensure that all parameter instantiations yield questions of equivalent difficulty (measured by IRT difficulty parameter $b$), discrimination (parameter $a$), and guessing probability (parameter $c$). A combinatorial assignment matrix is precomputed that maps (exam_id, center_id, seat_number) → specific question selection, guaranteeing: (a) identical difficulty distribution across all papers, (b) identical topic and subtopic coverage, (c) no two adjacent candidates share more than 10% of questions. At exam time, paper generation per candidate is an O(1) lookup in this precomputed matrix.

**Innovation 2 — Statistical Anomaly Detection for Collusion with O(1) Per-Pair Scoring**: After the exam, ParikshaSuraksha detects cheating collusion by analyzing answer patterns. For each pair of candidates at the same center, the system computes a collusion likelihood ratio. The key insight: for each question, the probability of two independent candidates choosing the same incorrect distractor is known from the question's precomputed distractor attractiveness profile (obtained from field testing or IRT calibration). If two candidates have an improbably high rate of matching wrong answers — particularly on difficult questions where random agreement is unlikely — collusion is indicated. The likelihood ratio $\Lambda = P(\text{observed pattern} | \text{collusion}) / P(\text{observed pattern} | \text{independent})$ is computed using precomputed per-question probability tables, making each question's contribution O(1). For a fixed number of questions Q, total scoring per pair is O(Q) = O(1).

**Innovation 3 — Zero-Knowledge Exam Lifecycle with Blockchain Audit Trail**: The complete question paper NEVER exists as a single document at any point before the exam. Each question is individually encrypted with a unique key. The encrypted questions are distributed to exam centers days in advance — but they are computationally indistinguishable from random data without the keys. The decryption keys are generated using a time-locked cryptographic scheme: they are sealed inside a time-lock puzzle that becomes solvable ONLY at the scheduled exam start time. Even if an attacker steals all encrypted questions AND all time-locked key containers, they cannot decrypt until the designated time. Every access event — question creation, encryption, distribution, key generation, decryption, candidate assignment — is recorded on a Hyperledger Fabric blockchain with O(1) integrity verification via Merkle tree root comparison.

### Devil's Advocate

> **DA: NTA institutional inertia is the real barrier, not technology.** NTA has conducted exams the same way for years. Even after the NEET 2024 crisis, the institutional response was to add more physical security (armed escorts, CCTV), not to adopt fundamentally new technology. Government procurement cycles take 2-5 years. A startup proposing to change how 50+ exams are conducted faces bureaucratic inertia that no amount of mathematical elegance can overcome. **Rebuttal:** The NEET crisis created unprecedented political will — PM-level intervention, Supreme Court hearings, NTA leadership changes. The window for technological solutions has never been more open. The deployment strategy is deliberately incremental: pilot with low-stakes university exams first (via dmj.one), build a track record, then approach NTA with proven results. Institutional inertia is real, but the current moment is unusually receptive to change.

> **DA: Question bank creation requires massive subject matter expert effort.** Each parameterized template needs expert authoring, multiple parameter instantiations, field testing on 200+ students per instantiation, and IRT calibration. For a single NEET exam (180 questions × multiple instantiations), this requires thousands of calibration responses and months of SME time. Scaling this across 50+ NTA exams is operationally enormous. **Rebuttal:** The upfront investment is real but amortizable. Once a template is calibrated, it generates unlimited unique questions forever — the cost per exam decreases with each subsequent use. Gemini can assist with initial template generation (human experts validate and refine). Calibration can be integrated into existing coaching platform mock tests (millions of students already take these). The question bank is a moat, not just a cost — once built, it becomes an insurmountable competitive advantage.

> **DA: What if parameterized templates reduce question diversity and make exams predictable?** If templates parameterize only numerical values (change velocity from 20 m/s to 25 m/s), students may recognize the underlying template pattern and prepare for template types rather than concepts. This could reduce the exam's ability to test genuine understanding, turning it into a pattern-matching exercise. **Rebuttal:** Templates are not limited to numerical parameterization — they can vary entity names, scenario contexts, diagram configurations, and conceptual framing. The isomorphic equivalence constraint ensures all instantiations test the same cognitive skill at the same difficulty level, but the surface presentation varies significantly. Additionally, the combinatorial assignment matrix ensures no student sees the same template combination, making pattern recognition across papers infeasible. Post-exam analysis of score distributions (KS test) explicitly checks whether template-based generation introduces any measurable bias.

### Technical Implementation

#### Architecture/Design

```
┌─────────────────────────────────────────────────────────┐
│                   EXAM INTERFACES                        │
│  Exam Center Terminal │ Admin Dashboard │ Candidate Portal│
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌────────────┐  ┌────────────────┐  ┌──────────────────┐
│ ISOMORPHIC │  │  COLLUSION     │  │  ZERO-KNOWLEDGE  │
│ QUESTION   │  │  DETECTION     │  │  LIFECYCLE       │
│ GENERATOR  │  │  ENGINE        │  │  MANAGER         │
│            │  │                │  │                  │
│ IRT-calib. │  │ Distractor     │  │ Per-question     │
│ templates  │  │ probability    │  │ encryption +     │
│ + combina- │  │ tables +       │  │ time-locked      │
│ torial     │  │ likelihood     │  │ keys +           │
│ assignment │  │ ratio          │  │ blockchain       │
│ O(1) gen.  │  │ O(1)/pair      │  │ O(1) verify      │
└─────┬──────┘  └───────┬────────┘  └────────┬─────────┘
      │                 │                     │
      ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                             │
│  Cloud KMS (keys) │ Firestore (metadata) │ BigQuery       │
│  Blockchain (audit) │ GCS (encrypted questions)          │
│  Assignment Matrix │ IRT Parameters │ Distractor Tables   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              EXTERNAL INTEGRATIONS                        │
│  NTA APIs │ Exam Center Systems │ Cloud KMS │ HSM          │
│  Hyperledger Fabric │ Confidential VMs                    │
└─────────────────────────────────────────────────────────┘
```

#### Key Components

1. **Isomorphic Question Generator**: Parameterized question templates with IRT-calibrated difficulty equivalence. Precomputed combinatorial assignment matrix. O(1) paper generation per candidate.

2. **Collusion Detection Engine**: Precomputed distractor attractiveness profiles from field testing. Likelihood ratio computation for answer pattern similarity. O(1) per question per pair. False positive rate < 0.0001.

3. **Zero-Knowledge Lifecycle Manager**: Per-question encryption via Cloud KMS. Time-locked key release. Hyperledger Fabric blockchain audit trail. O(1) Merkle tree integrity verification.

4. **Admin Dashboard**: Exam authorities monitor lifecycle events, review collusion alerts, verify blockchain integrity, and manage question bank calibration.

#### Mathematical Foundations

**IRT-Calibrated Isomorphic Question Generation**

Each question template $T_i$ has parameters $\boldsymbol{\theta}_i$ (e.g., numerical values, entity names) that can be instantiated in multiple ways. Define a question instance $q_{i,j}$ as template $T_i$ with parameter instantiation $j$.

**Three-Parameter Logistic (3PL) IRT Model:**

The probability that a candidate with ability $\theta$ answers question $q_{i,j}$ correctly:

$$
P(X_{i,j} = 1 | \theta) = c_{i,j} + \frac{1 - c_{i,j}}{1 + e^{-a_{i,j}(\theta - b_{i,j})}}
$$

where:
- $a_{i,j}$ = discrimination parameter (how well the question separates high/low ability)
- $b_{i,j}$ = difficulty parameter (ability level at which P(correct) = 0.5 + c/2)
- $c_{i,j}$ = guessing parameter (probability of correct answer by pure guessing)

**Isomorphic equivalence constraint:**

For all instantiations $j, j'$ of template $T_i$:

$$
|a_{i,j} - a_{i,j'}| < \epsilon_a, \quad |b_{i,j} - b_{i,j'}| < \epsilon_b, \quad |c_{i,j} - c_{i,j'}| < \epsilon_c
$$

These constraints are verified through field testing (administering all instantiations to calibration groups) before the template enters the production question bank.

**Combinatorial Assignment Matrix:**

For an exam with $N$ candidates across $C$ centers, each center with $S$ seats, and a question bank of $Q$ IRT-calibrated questions organized into $G$ topic groups:

$$
\mathbf{A}[e, c, s] = (q_1^{(e,c,s)}, q_2^{(e,c,s)}, \ldots, q_Q^{(e,c,s)})
$$

Subject to constraints:
1. **Difficulty balance**: $\forall (c_1,s_1), (c_2,s_2): \sum_{q \in \mathbf{A}[e,c_1,s_1]} b_q \approx \sum_{q \in \mathbf{A}[e,c_2,s_2]} b_q$ (within $\epsilon_b$)
2. **Topic coverage**: Each paper covers all required subtopics per exam blueprint
3. **Neighbor dissimilarity**: For adjacent seats $s, s+1$ at center $c$: $|\mathbf{A}[e,c,s] \cap \mathbf{A}[e,c,s+1]| / Q < 0.1$
4. **Cross-center dissimilarity**: For different centers $c_1 \neq c_2$: $|\mathbf{A}[e,c_1,s] \cap \mathbf{A}[e,c_2,s']| / Q < 0.15$

**Precomputation**: The matrix $\mathbf{A}$ is constructed offline using constraint satisfaction with simulated annealing. Cost: O(N × Q × iterations). Performed once per exam.

**Runtime (O(1) per candidate)**: For candidate at (exam $e$, center $c$, seat $s$):

$$
\text{Paper}(e, c, s) = \mathbf{A}[e, c, s] \quad \text{(single table lookup)}
$$

**Statistical Collusion Detection — Likelihood Ratio**

For each question $q$, define the distractor attractiveness profile from field testing:

$$
\mathbf{p}_q = (p_{q,A}, p_{q,B}, p_{q,C}, p_{q,D})
$$

where $p_{q,k}$ is the probability of a random candidate selecting option $k$ (with $\sum_k p_{q,k} = 1$ and $p_{q,\text{correct}}$ being the largest).

**Probability of two independent candidates matching on question $q$:**

$$
P_q^{\text{match}} = \sum_{k \in \{A,B,C,D\}} p_{q,k}^2
$$

**Probability of matching on wrong answers only:**

$$
P_q^{\text{wrong\_match}} = \sum_{k \neq \text{correct}} p_{q,k}^2
$$

**For a pair of candidates $(u, v)$ answering $Q$ questions, let:**
- $m_{uv}$ = number of questions where both gave the same wrong answer
- $n_{uv}$ = number of questions where both answered incorrectly

**Likelihood ratio (O(1) per question, O(Q) = O(1) total for fixed Q):**

Under independence:

$$
P(\text{observed} | \text{independent}) = \prod_{q: \text{both wrong, same}} \frac{p_{q,k_{uv}}^2}{(\sum_{j \neq \text{correct}} p_{q,j})^2} \prod_{q: \text{both wrong, different}} \left(1 - \frac{\sum_{j \neq \text{correct}} p_{q,j}^2}{(\sum_{j \neq \text{correct}} p_{q,j})^2}\right)
$$

Under collusion (one copies from the other):

$$
P(\text{observed} | \text{collusion}) = \prod_{q: \text{both wrong, same}} \frac{p_{q,k_{uv}}}{\sum_{j \neq \text{correct}} p_{q,j}} \prod_{q: \text{both wrong, different}} 0^+
$$

The log-likelihood ratio:

$$
\log \Lambda_{uv} = \sum_{q=1}^{Q} \ell_q(u, v)
$$

where $\ell_q(u, v)$ is the per-question log-likelihood contribution — computed from precomputed $\mathbf{p}_q$ in O(1) per question.

**Decision rule:**

$$
\text{Collusion}(u, v) = \mathbb{1}\left[\log \Lambda_{uv} > \tau_{\text{collusion}}\right]
$$

$\tau_{\text{collusion}}$ is calibrated to achieve false positive rate < 0.0001 from the null distribution of $\log \Lambda$ under independence.

**Zero-Knowledge Exam Lifecycle — Time-Locked Cryptography**

Each question $q_i$ is encrypted individually:

$$
E_i = \text{AES-256-GCM}(q_i, k_i)
$$

where $k_i$ is a unique per-question key generated by Cloud KMS.

**Time-locked key release:**

Each key $k_i$ is sealed inside a time-lock puzzle:

$$
\text{TLP}_i = (n_i, t_i, C_i) \quad \text{where } C_i = k_i + a_i^{2^{t_i}} \mod n_i
$$

Based on Rivest, Shamir, Wagner (1996): solving the puzzle requires $t_i$ sequential squarings modulo $n_i$ — inherently sequential, cannot be parallelized. $t_i$ is calibrated so that solving takes exactly until the exam start time on the fastest known hardware.

**Practical implementation**: Use GCP Cloud KMS with scheduled key release backed by Hardware Security Modules (HSMs). Time-lock puzzles serve as a cryptographic fallback if the key management system is compromised.

**Blockchain audit trail:**

Every lifecycle event is recorded as a transaction on a permissioned Hyperledger Fabric blockchain:

$$
\text{Block}_j = (H(\text{Block}_{j-1}), \text{timestamp}, \text{event\_data}, \text{digital\_signature})
$$

**O(1) integrity verification:**

To verify that a specific event $e$ at time $t$ occurred and has not been tampered with:

$$
\text{Verify}(e) = \mathbb{1}\left[\text{MerkleProof}(e, \text{root}_{\text{block}}) = \text{true}\right]
$$

A Merkle proof requires $O(\log T)$ hash comparisons where $T$ is the number of events in the block — bounded by block size, effectively O(1).

### Implementation Details

#### Algorithms/Processes

```
Algorithm: IsomorphicPaperGeneration
Input: Exam ID, Center ID, Seat Number
Output: Unique question paper with guaranteed difficulty equivalence

1. Precomputation Phase (offline, weeks before exam)
   a. Question Bank Preparation:
      - For each question template T_i:
        * Generate M parameter instantiations
        * Field test all instantiations on calibration groups
        * Fit 3PL IRT model: estimate (a, b, c) per instantiation
        * Verify isomorphic equivalence: |b_j - b_j'| < ε_b
        * Compute distractor attractiveness profiles p_q for each
      - Result: IRT-calibrated question bank with N_total questions

   b. Combinatorial Assignment Matrix Construction:
      - Input: exam blueprint (topic coverage, difficulty dist.,
        number of questions, candidate count, center layout)
      - Use constraint satisfaction + simulated annealing:
        * Initialize random assignments
        * Swap questions between papers to minimize:
          - Difficulty variance across papers
          - Topic coverage deviation from blueprint
          - Neighbor question overlap
        * Converge when all constraints satisfied
      - Store matrix A[exam_id, center_id, seat_number]

2. Runtime Paper Generation (O(1) per candidate)
   - Input: (exam_id, center_id, seat_number)
   - Lookup: question_list = A[exam_id, center_id, seat_number]
   - For each question in list:
     * Retrieve encrypted question blob E_i from GCS
     * At exam start: decrypt with released key k_i
     * Render question with assigned parameter instantiation
   - Deliver paper to candidate's terminal

3. Answer Key Generation (automatic)
   - Each candidate's paper has a unique answer key derived from
     the parameter instantiation
   - Answer keys precomputed and stored encrypted
   - Auto-grading: compare candidate answers against their
     specific answer key
```

```
Algorithm: CollusionDetection
Input: All candidate answer sheets from a center
Output: Flagged pairs with collusion probability

1. Answer Pattern Extraction
   - For each candidate u: extract response vector
     R_u = (r_u1, r_u2, ..., r_uQ) where r_ui ∈ {A,B,C,D,blank}
   - NOTE: Since papers are different, only compare on SHARED
     questions between each pair

2. Pairwise Scoring (for all pairs at same center)
   - For candidates u, v sharing question set S_uv:
     a. Count: m_uv = number of matching wrong answers
     b. Count: n_uv = number of questions both answered wrong
     c. For each shared question q ∈ S_uv:
        - Lookup precomputed distractor profile p_q
        - Compute per-question log-likelihood ℓ_q(u,v)
     d. Sum: log_Λ_uv = Σ ℓ_q(u,v) over shared questions

3. Statistical Testing
   - Compare log_Λ_uv against null distribution threshold τ
   - If log_Λ_uv > τ (calibrated for FPR < 0.0001):
     FLAG pair (u, v) for investigation
   - Generate evidence report: matching questions, distractor
     patterns, seating positions, statistical significance

4. Cluster Analysis
   - If multiple flagged pairs share a common candidate:
     Identify potential cheating rings
   - If flagged pairs are in adjacent seats:
     Strong evidence of visual copying
   - Generate investigation report for exam authority
```

```
Algorithm: ZeroKnowledgeExamLifecycle
Input: Question bank, exam schedule, center list
Output: Encrypted exam packages with time-locked keys

1. Question Encryption (weeks before exam)
   - For each question q_i in the assignment matrix:
     a. Generate unique key k_i via Cloud KMS (HSM-backed)
     b. Encrypt: E_i = AES-256-GCM(q_i, k_i)
     c. Generate time-lock puzzle TLP_i for k_i
     d. Record on blockchain: {event: "encrypt", q_hash: H(q_i),
        timestamp, signer: question_setter_id}

2. Distribution (days before exam)
   - Package encrypted questions per center:
     Package_c = {E_i : i ∈ questions_assigned_to_center_c}
   - Distribute to exam centers via secure channel
   - Centers cannot decrypt — they only have ciphertext
   - Record on blockchain: {event: "distribute",
     center_id, package_hash, timestamp}

3. Key Release (at exam start time, ±0 seconds)
   - Cloud KMS releases keys k_i at scheduled time
   - Simultaneously: time-lock puzzles become solvable
   - Center systems decrypt questions and render papers
   - Record on blockchain: {event: "decrypt", center_id,
     key_release_time, timestamp}

4. Audit Verification (anytime, O(1))
   - Any party can verify any lifecycle event:
     a. Retrieve Merkle proof for the event
     b. Verify proof against block's Merkle root
     c. Verify block hash chain to genesis
   - Proof size: O(log T) ≈ constant for bounded block size
   - Detects: unauthorized decryption, premature key access,
     audit log tampering
```

#### Data Structures

**Question Template Schema:**
```json
{
  "template_id": "string",
  "subject": "string (Physics, Chemistry, Biology, Math, etc.)",
  "topic": "string",
  "subtopic": "string",
  "bloom_level": "remember | understand | apply | analyze | evaluate | create",
  "template_text": "string (with {{param}} placeholders)",
  "parameters": [
    {"name": "string", "type": "float | int | string", "range": "..."}
  ],
  "answer_formula": "string (symbolic expression computing correct answer)",
  "distractors": [
    {"formula": "string", "type": "common_misconception | calculation_error | unit_error"}
  ],
  "irt_parameters": {
    "a_mean": "number", "a_std": "number",
    "b_mean": "number", "b_std": "number",
    "c_mean": "number", "c_std": "number"
  },
  "distractor_attractiveness": {"A": "number", "B": "number", "C": "number", "D": "number"},
  "field_test_count": "number",
  "calibration_date": "ISO-8601"
}
```

**Assignment Matrix Entry Schema:**
```json
{
  "exam_id": "string",
  "center_id": "string",
  "seat_number": "number",
  "question_assignments": [
    {
      "position": "number (1-based question number in paper)",
      "template_id": "string",
      "parameter_instantiation_id": "string",
      "encrypted_blob_uri": "gs://bucket/encrypted/q_hash.enc",
      "answer_key": "string (encrypted)"
    }
  ],
  "difficulty_sum": "number",
  "topic_coverage_hash": "string (verifies blueprint compliance)"
}
```

**Blockchain Audit Event Schema:**
```json
{
  "event_id": "string (UUID)",
  "event_type": "question_create | encrypt | distribute | key_generate | key_release | decrypt | answer_submit | grade",
  "timestamp": "ISO-8601",
  "actor_id": "string (authenticated identity)",
  "exam_id": "string",
  "entity_hash": "string (SHA-256 of the affected entity)",
  "digital_signature": "string (actor's Ed25519 signature)",
  "merkle_proof": "string (proof within block's Merkle tree)",
  "block_number": "number"
}
```

## Applications and Use Cases

### Primary Applications

1. **Leak-Proof Exam Conduct**: Every candidate gets a unique, IRT-calibrated question paper. Leaking one paper is useless — no other candidate has the same paper. The complete paper never exists until exam start time.
2. **Post-Exam Collusion Detection**: Statistical analysis of answer patterns detects cheating rings with mathematical rigor and false positive rate below 0.0001. Evidence reports withstand legal scrutiny.
3. **Tamper-Proof Audit Trail**: Every lifecycle event (question creation through grading) is recorded on a blockchain. Any unauthorized access attempt is permanently logged and detectable. Courts and candidates can independently verify exam integrity.

### Use Cases

#### Use Case 1: NEET-Type Paper Leak Prevention
- **Scenario**: A printing press employee in Patna attempts to photograph the NEET question paper the night before the exam — the exact scenario that caused the NEET-UG 2024 crisis.
- **Implementation**: With ParikshaSuraksha, there IS no single question paper to photograph. The printing press receives only encrypted question blobs that are computationally indistinguishable from random data. Even if the employee photographs all the encrypted blobs and all the time-lock puzzle containers, they cannot decrypt any question before exam start time. Additionally, since each candidate gets a unique paper, even if one paper were somehow compromised, it would benefit only one candidate — not the thousands who benefited from the NEET leak.
- **Benefits**: Eliminates the single point of failure that caused the NEET crisis. Makes printing press compromise futile. Protects 24 lakh candidates' futures.

#### Use Case 2: Detecting Bluetooth-Based Answer Sharing
- **Scenario**: In an SSC exam at a center in Lucknow, an organized cheating ring uses Bluetooth earpieces to share answers among 15 candidates seated in a cluster.
- **Implementation**: Since each candidate has a different paper (with at most 10% overlap with neighbors), sharing answers is inherently less useful — the answers don't apply to different questions. For the shared questions that do overlap, ParikshaSuraksha's collusion detection engine analyzes post-exam answer patterns. The 15 candidates show statistically improbable matching patterns on their overlapping questions — specifically, they match on the SAME wrong distractors on difficult questions where random agreement probability is < 0.02. The likelihood ratio for each pair exceeds the collusion threshold. The cluster analysis identifies all 15 as a connected cheating ring.
- **Benefits**: Detects collusion with mathematical proof. Unique papers reduce the value of answer sharing by 90%. Evidence withstands legal challenge.

#### Use Case 3: UGC-NET Type Post-Conduct Integrity Verification
- **Scenario**: After a UGC-NET exam, allegations of paper leak emerge on social media. In the 2024 incident, the entire exam was cancelled based on suspicion, wasting Rs 100+ crore and 9 lakh candidates' preparation.
- **Implementation**: With ParikshaSuraksha's blockchain audit trail, the exam authority can instantly verify: (a) no decryption event occurred before the scheduled start time (O(1) Merkle proof verification); (b) all key releases happened within the designated time window; (c) no unauthorized access events are recorded. The verification is independently reproducible — even courts or third-party auditors can verify the blockchain proofs. Instead of cancelling the exam based on suspicion, authorities can cryptographically PROVE that no leak occurred.
- **Benefits**: Prevents Rs 100+ crore waste from unnecessary cancellations. Provides courts with cryptographic proof of integrity. Restores candidate trust.

## Advantages and Benefits

### Technical Advantages

1. **Mathematical Paper Leak Immunity**: First system where leaking a question paper is provably useless — every candidate has a unique, IRT-calibrated paper, and the complete paper doesn't exist until exam start. O(1) per-candidate paper generation via precomputed assignment matrices.
2. **Rigorous Collusion Detection**: First system using IRT-calibrated distractor attractiveness profiles for likelihood-ratio-based collusion detection with provably bounded false positive rate (< 0.0001). O(1) per pair per question.
3. **Cryptographic Lifecycle Guarantee**: First exam system where the complete question paper provably cannot exist before exam start — time-locked cryptography with blockchain audit trail providing O(1) integrity verification. Eliminates all 5-8 custody handoff vulnerabilities.

### Business/Research Value

1. **Every Exam-Conducting Body is a Customer**: NTA (50+ exams), UPSC, SSC, state PSCs, banking recruitment (IBPS), railways (RRB), state education boards. B2G model: Rs 5-50 lakh per exam conduct.
2. **National Priority**: Exam integrity is a matter of national debate — PM, Supreme Court, and Parliament have intervened. ParikshaSuraksha addresses a crisis with national attention and political will for change.
3. **Restoring Meritocracy**: 300 million+ candidates and their families need to trust that merit, not manipulation, determines outcomes. ParikshaSuraksha provides mathematical proof of exam fairness — transforming trust from faith-based to evidence-based.

## Potential Challenges and Solutions

| Challenge | Proposed Solution | Priority |
|-----------|------------------|----------|
| Building a sufficiently large IRT-calibrated question bank | Partner with NTA and subject matter experts. Use Gemini for initial question template generation, then calibrate via field testing. Start with one subject (Physics for NEET) as pilot. | High |
| Field testing question templates for IRT calibration | Integrate with coaching platforms (dmj.one, other ed-tech) for calibration testing on large student populations. Ensure calibration and production question banks are strictly separated. | High |
| Exam center infrastructure (terminals, network for decryption) | Support both CBT (computer-based) and hybrid (decrypt-then-print) modes. For paper-based exams: decrypt and print at center using secure printers 30 minutes before exam. | High |
| Time-locked cryptography implementation complexity | Use GCP Cloud KMS with scheduled key release as primary. Time-lock puzzles as cryptographic fallback. Extensive testing of key release timing precision (±5 seconds target). | Medium |
| Legal acceptance of statistical collusion evidence | Calibrate false positive rate to legal evidence standards (< 0.0001). Provide detailed statistical methodology documentation. Train investigating officers on interpreting evidence reports. | Medium |
| Resistance from stakeholders who benefit from current vulnerabilities | Government mandate driven — position as enabling tool for NTA/UPSC, not a replacement. Demonstrate with low-stakes pilot exam before high-stakes deployment. | High |
| AI/IRT misdiagnosis of question difficulty equivalence | Multi-stage validation pipeline: (a) expert review of all template instantiations before field testing; (b) field testing on calibration groups of 200+ students per instantiation; (c) statistical verification that IRT parameters fall within tolerance bounds ($\epsilon_b < 0.15$); (d) any instantiation failing validation is automatically excluded from the production bank. Post-exam analysis: if score distributions across papers show statistically significant differences (KS test p < 0.05), affected papers are flagged and equating adjustments applied before result declaration. | High |
| Accessibility for differently-abled candidates | Full compliance with RPwD Act 2016 provisions for exam accommodations. Screen reader compatible CBT interface (NVDA, JAWS) for visually impaired candidates. Extended time (compensatory time as per NTA guidelines) configurable per candidate in the assignment matrix. Scribe-assisted mode with scribe-specific audit trail on blockchain. Large font / high contrast mode. Motor impairment: switch access and eye-tracking input support for CBT terminals. All accessibility accommodations recorded in blockchain audit trail for transparency. | High |
| Candidate abandonment during exam (network failure, terminal crash) | Exam state checkpointed every 30 seconds to encrypted local storage and cloud backup. If terminal crashes, candidate resumes from last checkpoint on any terminal at the same center — assignment matrix lookup is terminal-agnostic. Network failure: all encrypted questions are pre-distributed, so the exam continues offline. Answers are cached locally and synced post-exam. Candidate receives compensatory time for interruption duration (automatically calculated and blockchain-recorded). | High |
| Privacy and security of exam data and candidate information | All candidate PII encrypted at rest (AES-256-GCM) and in transit (TLS 1.3). Question bank access restricted to authorized personnel via IAM with hardware key (YubiKey) MFA. Candidate response data retained only until result declaration plus appeal period (90 days), then irreversibly anonymized. DPDP Act 2023 compliant. Annual third-party security audit with published summary. | High |

## Claims (for patent ideas)

### Independent Claims

1. **Claim 1 (Method)**: A computer-implemented method for conducting examinations with individual paper uniqueness and difficulty equivalence, comprising: (a) maintaining a question bank of parameterized question templates, each template having multiple parameter instantiations calibrated using Item Response Theory to have statistically equivalent difficulty, discrimination, and guessing parameters within specified tolerance bounds; (b) precomputing a combinatorial assignment matrix that maps each candidate identifier to a specific selection of question templates and parameter instantiations, subject to constraints on difficulty distribution equivalence, topic coverage completeness, and minimum dissimilarity between papers assigned to physically adjacent candidates; (c) at examination time, generating each candidate's unique question paper by performing an O(1) lookup in the precomputed assignment matrix; (d) automatically generating a corresponding unique answer key for each candidate's paper from the symbolic answer formulae of the assigned template instantiations; and (e) grading each candidate's responses against their individually unique answer key, wherein the method guarantees that no two adjacent candidates share more than a specified fraction of questions while maintaining statistically identical difficulty distributions across all generated papers.

2. **Claim 2 (System)**: A system for examination lifecycle security with zero-knowledge question paper distribution, comprising: (a) a question encryption module that individually encrypts each question in the question bank with a unique cryptographic key using authenticated encryption; (b) a time-locked key management module that seals each question's decryption key inside a time-lock cryptographic construct that is computationally infeasible to solve before the scheduled examination start time; (c) a distribution module that transmits encrypted question packages to examination centers, wherein the packages are computationally indistinguishable from random data without the corresponding decryption keys; (d) a key release module that makes decryption keys available at the scheduled examination start time; and (e) a blockchain audit trail module that records every lifecycle event including encryption, distribution, key generation, key release, and decryption on a permissioned blockchain with Merkle tree integrity proofs enabling O(1) verification of any recorded event.

### Dependent Claims

3. **Claim 3** (dependent on Claim 1): The method of Claim 1, further comprising a post-examination collusion detection module that, for each pair of candidates sharing overlapping questions, computes a likelihood ratio comparing the probability of their observed answer matching pattern under a collusion hypothesis versus an independence hypothesis, using precomputed distractor attractiveness profiles for each question derived from field testing.

4. **Claim 4** (dependent on Claim 1): The method of Claim 1, wherein the parameterized question templates include symbolic answer formulae that compute the correct answer and generate plausible distractors as functions of the template parameters, such that the distractors correspond to common mathematical misconceptions, unit conversion errors, or formula application errors specific to each parameter instantiation.

5. **Claim 5** (dependent on Claim 2): The system of Claim 2, wherein the time-locked key management module employs repeated squaring puzzles based on the intractability of sequential modular exponentiation, calibrated such that the puzzle solution time on the fastest available hardware matches the scheduled examination start time.

6. **Claim 6** (dependent on Claim 1): The method of Claim 1, wherein the combinatorial assignment matrix is constructed using constraint satisfaction optimization that minimizes the maximum difficulty deviation between any two candidate papers while maximizing the minimum Hamming distance between papers assigned to candidates within a specified physical proximity.

7. **Claim 7** (dependent on Claim 2): The system of Claim 2, further comprising a third-party verification interface that enables courts, auditors, or candidate representatives to independently verify the integrity of any examination lifecycle event by computing the Merkle proof from the event data to the published blockchain state root, without requiring access to the examination questions or candidate responses.

## Complete Citizen Experience Design

### First 5 Minutes: The Authority Experience

An exam controller at NTA logs into the ParikshaSuraksha admin dashboard at pariksha.dmj.one. They upload their question bank — 500 Physics questions in a structured CSV/JSON format (template text, parameters, answer formulae, distractor formulae). The system immediately begins validation: checking for duplicate concepts, verifying parameter ranges yield solvable problems, and flagging questions that lack sufficient parameterization for isomorphic generation. Within 60 seconds, the dashboard shows: "478 questions validated. 22 flagged for review (12 insufficient parameterization, 6 ambiguous answer formulae, 4 duplicate concepts)." The controller reviews flagged items, fixes or removes them, and clicks "Generate Exam Blueprint." They specify: 180 questions per paper, 4 subjects, difficulty distribution (30% easy, 50% medium, 20% hard), and 50,000 candidates across 200 centers. The system generates the combinatorial assignment matrix in under 3 minutes. A preview shows 5 sample papers side by side — visually different questions, but the difficulty histogram is identical. The controller clicks "Encrypt & Distribute." Each question is individually encrypted, time-lock puzzles are generated for the exam date, and encrypted packages are queued for distribution to center systems. Total time from upload to distribution-ready: under 10 minutes.

### First 5 Minutes: The Candidate Experience

A NEET aspirant in Kota arrives at the exam center. They present their admit card and government ID. The center system verifies identity (photo match, biometric if configured) and assigns them to a seat. At exactly 2:00 PM (exam start), the time-lock releases. The candidate's terminal decrypts and renders their unique question paper. The interface looks identical to any CBT exam — numbered questions, navigation panel, mark-for-review, timer. The candidate does not know or need to know that their paper is unique. They answer questions normally. At submission, responses are encrypted and recorded with a blockchain transaction hash. The candidate receives a printout: "Your response submission ID: [hash]. Verify at pariksha.dmj.one/verify." They can independently verify that their responses were recorded unaltered at any time after the exam.

### End-to-End Resolution: Complete Exam Lifecycle

**Stage 1 — Question Bank Creation (Weeks Before Exam):** Subject matter experts author parameterized question templates using the authoring tool. Each template undergoes IRT calibration via field testing on calibration groups (minimum 200 responses per instantiation). The system verifies isomorphic equivalence constraints: $|b_{j} - b_{j'}| < \epsilon_b$ across all parameter instantiations. Validated templates enter the production question bank.

**Stage 2 — Assignment Matrix Construction (Days Before Exam):** The system generates a combinatorial assignment matrix mapping every (center_id, seat_number) to a unique question selection. Constraint satisfaction ensures: identical difficulty distributions, complete topic coverage per blueprint, and < 10% question overlap between adjacent seats. This is precomputed — no real-time generation needed during the exam.

**Stage 3 — Encryption & Distribution (Days Before Exam):** Each question is individually encrypted with a unique Cloud KMS key. Encrypted packages are distributed to exam centers. Centers receive ciphertext — computationally indistinguishable from random data. Every distribution event is recorded on the blockchain.

**Stage 4 — Exam Conduct (Exam Day):** At the scheduled start time, Cloud KMS releases decryption keys. Time-lock puzzles become solvable simultaneously as a cryptographic fallback. Centers decrypt and render unique papers for each candidate. The exam proceeds as normal. Every key release and decryption event is blockchain-recorded.

**Stage 5 — Post-Exam Collusion Detection (Hours After Exam):** The collusion detection engine analyzes all candidate response patterns within each center. For every pair sharing overlapping questions, it computes the likelihood ratio using precomputed distractor attractiveness profiles. Pairs exceeding the collusion threshold ($\log \Lambda > \tau$, calibrated for FPR < 0.0001) are flagged. Cluster analysis identifies cheating rings. An evidence report is generated for each flagged pair, including: matched wrong answers, distractor analysis, seating proximity, and statistical significance.

**Stage 6 — Result Declaration (Days After Exam):** Each candidate's responses are graded against their unique answer key. Score equating ensures cross-paper fairness — if post-exam analysis reveals any difficulty variance beyond tolerance, IRT-based equating adjustments are applied. Results are published with blockchain verification: any candidate can cryptographically verify that their specific response record and grading are untampered.

### Failure Recovery

**Time-lock fails to release on time:** Dual-redundancy design. Primary: Cloud KMS scheduled key release (±5 second precision). Secondary: time-lock puzzles calibrated to become solvable 30 seconds before exam start. Tertiary: exam controller holds emergency key fragments (Shamir's Secret Sharing, 3-of-5 threshold) that can be combined to release keys manually. All fallback activations are blockchain-recorded. In the worst case, exam start is delayed by 2-5 minutes — not cancelled.

**Terminal crashes mid-exam:** Candidate's response state is checkpointed every 30 seconds. If a terminal fails, the candidate is moved to a backup terminal. The assignment matrix lookup retrieves their unique paper by (center_id, seat_number) — no data loss. Compensatory time is automatically calculated and added. The interruption event is blockchain-recorded for audit.

**Collusion detection false positive:** Every flagged pair receives a detailed statistical evidence report. The exam authority reviews before any action. The system explicitly provides the probability that the matching pattern could occur by chance (e.g., "The probability of this pattern under independent answering is < 0.00003"). Candidates have the right to appeal, and the evidence report is designed to withstand legal scrutiny. No automatic penalties — human authority makes all final decisions.

### Human Handoff: Exam Authority Override

ParikshaSuraksha provides data and evidence — never makes punishment decisions. At every stage, the exam authority retains full control: (a) the authority can override the assignment matrix to accommodate special circumstances (candidate disability accommodations, late arrivals); (b) the authority reviews all collusion detection flags and decides whether to investigate, with the system providing evidence but never auto-disqualifying; (c) the authority can trigger re-examination for specific candidates or centers if integrity is compromised, with the system generating a fresh assignment matrix in minutes; (d) the authority can verify any lifecycle event independently via blockchain proof, without relying on ParikshaSuraksha's systems.

## Global Applicability

### Exam Fraud is a Global Crisis

**China (Gaokao):** 13.42 million students registered for the gaokao in 2024 — the single exam that determines university placement and, often, life trajectory. China has criminalized exam cheating since 2015, with penalties of up to 7 years in prison. Despite this, organized fraud persists: a Shandong province investigation uncovered 280+ people involved in identity theft of gaokao candidates. Chinese provinces have deployed AI across 386 examination sites and use facial recognition, metal detectors, drones, and cellphone-signal blockers. Law enforcement catches 200+ people annually manufacturing wireless cheating devices. The core vulnerability remains: all candidates answer the same questions. ParikshaSuraksha's isomorphic generation eliminates this — even if answers are shared, they apply to a different paper.

**UK (A-Level Grading Scandal 2020):** When COVID-19 cancelled exams, the UK government replaced them with an algorithm (Ofqual) that factored in school historical performance. The result: 40% of Centre Assessment Grades were downgraded, with students from state schools and disadvantaged backgrounds disproportionately affected. 15,000 students were rejected by their first-choice university based on algorithmic grades. The head of Ofqual and the Department for Education's permanent secretary both resigned. ParikshaSuraksha's approach — making exams conductable with cryptographic integrity rather than replacing them with algorithms — directly prevents this class of failure.

**US (SAT Security Breaches):** The College Board's SAT has suffered repeated security failures. In 2016, hundreds of confidential test items were leaked — described as "one of the most serious security lapses in the history of college-admissions testing." In 2019, SAT Biology Subject Test questions circulated on Reddit hours before U.S. testing. The root cause: test recycling across international administrations. Approximately 2,000 students per year have SAT scores invalidated. The College Board has since moved to digital adaptive testing, but still delivers the same questions to all candidates in a session. ParikshaSuraksha's per-candidate unique papers eliminate the recycling vulnerability entirely.

### Global Market Size

The global digital exam solutions market was valued at $4.9 billion in 2024 and is projected to reach $14.8 billion by 2033 (CAGR 15.1%). Every country with high-stakes standardized testing — China, India, South Korea, Japan, Brazil, Nigeria, Egypt — faces some variant of the paper leak or cheating problem. ParikshaSuraksha's architecture is language-agnostic and exam-format-agnostic, requiring only localization of the question template authoring interface.

## Product Design Lessons Applied

### Lesson 1: Blockchain Hype Killed Many EdTech Projects — Do Not Over-Promise

Multiple exam integrity startups (particularly in 2017-2020) built "blockchain-based" exam systems that were essentially traditional databases with a blockchain layer bolted on. They marketed "immutable exam records" without solving the actual vulnerability — that all candidates answer the same questions. ParikshaSuraksha uses blockchain where it genuinely adds value (audit trail for lifecycle events where immutability and third-party verifiability matter) but does not pretend blockchain alone solves exam security. The core innovation is cryptographic (time-locked encryption, per-candidate unique papers) and statistical (IRT-calibrated equivalence, likelihood-ratio collusion detection). The blockchain is the audit trail, not the product.

### Lesson 2: ETS and Pearson VUE Evolved Exam Security Incrementally Over 30 Years

Pearson VUE introduced test centers in 2002, biometric verification in 2008, and online proctoring (OnVUE) in 2019. ETS moved the SAT to digital adaptive format only after repeated security failures over decades. The lesson: exam authorities are inherently conservative institutions. ParikshaSuraksha must deploy incrementally: (a) pilot with low-stakes exams (university internal exams via dmj.one) first; (b) demonstrate mathematical equivalence of generated papers with published validation data; (c) earn trust through transparent, independently verifiable results before approaching NTA for high-stakes integration. The technology is ready — but institutional adoption requires patience and proof.

### Lesson 3: The Candidate Must Never Feel the Complexity

Pearson VUE's success comes from making sophisticated security invisible to candidates. A candidate walking into a Pearson VUE center in 180 countries has the same simple experience: show ID, sit down, take test. ParikshaSuraksha follows this principle: the candidate sees a normal CBT interface. They do not know their paper is unique. They do not interact with blockchain. They do not see IRT parameters. The only visible addition is the verification hash on their receipt — and even that is optional to use. All complexity is on the authority side, where it belongs.

## Implementation Roadmap

### Phase 1: IRT Question Bank & Isomorphic Generation MVP (Weeks 1-6)
- [ ] Build parameterized question template authoring system
- [ ] Implement 3PL IRT model fitting from field test data
- [ ] Create initial question bank: 500 Physics questions (5 topics × 20 templates × 5 instantiations)
- [ ] Build combinatorial assignment matrix solver with constraint satisfaction
- [ ] Implement O(1) paper lookup and rendering
- [ ] Deploy MVP: pariksha.dmj.one on GCP VM + Cloudflare
- [ ] Pilot: conduct a mock exam with 1,000 students from dmj.one platform
- [ ] Validate: verify difficulty equivalence across generated papers via post-exam IRT analysis

### Phase 2: Collusion Detection & Crypto Lifecycle (Weeks 7-12)
- [ ] Compute distractor attractiveness profiles from pilot exam data
- [ ] Implement pairwise likelihood ratio collusion detection
- [ ] Calibrate collusion threshold for FPR < 0.0001
- [ ] Implement per-question AES-256-GCM encryption via Cloud KMS
- [ ] Build time-locked key release system (Cloud KMS scheduled release + puzzle fallback)
- [ ] Set up Hyperledger Fabric blockchain for audit trail
- [ ] Implement Merkle proof generation and verification
- [ ] Pilot: conduct a controlled exam with planted colluding pairs to validate detection

### Phase 3: Scale & NTA Partnership (Weeks 13-18)
- [ ] Expand question bank to 5 subjects (Physics, Chemistry, Biology, Math, English) × 1,000 templates each
- [ ] Build admin dashboard for exam authorities
- [ ] Build candidate verification portal (blockchain proof access)
- [ ] Scale infrastructure for 100,000 concurrent candidates
- [ ] Partnership with NTA for pilot integration with a low-stakes exam
- [ ] Legal review of collusion evidence standards with exam tribunal experts
- [ ] Documentation and training materials for exam conducting officials

## References and Resources

### Data Sources

1. National Testing Agency: https://nta.ac.in/
2. Parliamentary Committee Report on Exam Paper Leaks 2024
3. FICCI Survey on Exam Integrity Trust Deficit 2024
4. Supreme Court of India judgments on NEET-UG 2024

### Technical Resources

1. GCP Cloud KMS: https://cloud.google.com/kms
2. GCP Confidential VMs: https://cloud.google.com/confidential-computing
3. Hyperledger Fabric: https://www.hyperledger.org/projects/fabric
4. Gemini API: https://ai.google.dev/

### Academic Sources

1. Rivest, R.L., Shamir, A., & Wagner, D.A. (1996). "Time-lock puzzles and timed-release crypto." *MIT/LCS/TR-684*.
2. Lord, F.M. (1980). *Applications of Item Response Theory to Practical Testing Problems*. Lawrence Erlbaum Associates.
3. van der Linden, W.J. & Hambleton, R.K. (1997). *Handbook of Modern Item Response Theory*. Springer.
4. Sotaridona, L.S. & Meijer, R.R. (2002). "Statistical properties of the K-index for detecting answer copying." *Journal of Educational Measurement*, 39(2).
5. Merkle, R.C. (1987). "A Digital Signature Based on a Conventional Encryption Function." *CRYPTO '87*.

### Standards

1. NTA Examination Conduct Guidelines
2. ISO/IEC 27001 Information Security Management
3. FIPS 140-2 Security Requirements for Cryptographic Modules
4. DPDP Act 2023 for candidate data protection

---

**Related Ideas:**
- [dmj.one Education Platform](https://dmj.one) (education content delivery that ParikshaSuraksha makes tamper-proof)
- [JalDrishti — Water Quality Intelligence](jal-drishti-water-quality-intelligence.md) (shared citizen-facing verification philosophy)

**Keywords:** exam-integrity, paper-leak-prevention, isomorphic-questions, item-response-theory, collusion-detection, blockchain, zero-knowledge, time-locked-cryptography, Merkle-tree, education, NTA, India, GCP, Gemini, patent

**Ecosystem:** Directly extends `llm-evaluator` (AI-powered assessment). Assessment layer for `dmjone` (education platform). Security infrastructure from `enterprise-sso-system`. Blockchain patterns applicable to `haqsetu` (civic tech).

**Deployment:** pariksha.dmj.one | GCP VM + Cloudflare | Tier 0 (10K) → Tier 2 (1M)
