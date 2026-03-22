<p align="center">
  <h1 align="center">ParikshaSuraksha</h1>
  <p align="center">
    <strong>AI-Powered Exam Integrity Engine &mdash; leak-proof, cheat-proof, audit-proof</strong>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs&logoColor=white" alt="Node.js 20">
    <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12">
    <img src="https://img.shields.io/badge/Terraform-1.x-7B42BC?logo=terraform&logoColor=white" alt="Terraform">
    <img src="https://img.shields.io/badge/License-Proprietary-red" alt="License">
  </p>
  <p align="center">
    <a href="https://pariksha.dmj.one">Live Demo</a> &middot;
    <a href="https://pariksha.dmj.one/about">About</a> &middot;
    <a href="https://pariksha.dmj.one/pitch">Pitch Deck</a> &middot;
    <a href="docs/superpowers/specs/2026-03-21-pariksha-suraksha-design.md">Design Spec</a>
  </p>
</p>

---

## What is ParikshaSuraksha?

India's examination system suffers from systemic paper leaks -- 40+ major leaks in 2023-2024 alone, with the NEET-UG 2024 scandal affecting 24 lakh candidates and requiring Supreme Court intervention. The root cause: a single question paper passes through 5-8 custody handoffs, and one compromised link destroys the entire exam.

ParikshaSuraksha eliminates this by making every candidate's paper unique, detecting collusion with mathematical proof, and ensuring the complete question paper never exists as a single document until exam start. Three interlocking innovations make exams leak-proof, cheat-proof, and audit-proof.

Target: NTA (NEET/JEE), UPSC, SSC, state PSCs, and any high-stakes competitive examination system.

---

## Three Innovations

### 1. O(1) Unique Paper Generation

Every candidate receives a unique question paper -- same difficulty, same topics, different questions. Leaking one paper is useless. Papers are pre-rendered and served via a single table lookup in under 1ms.

### 2. Statistical Collusion Detection

Pairwise log-likelihood ratio analysis detects cheating patterns humans cannot see -- with mathematical proof, not guesswork. False positive rate: < 0.0001. BFS-based cheating ring detection across exam centers generates PDF evidence reports that withstand legal scrutiny.

### 3. Zero-Knowledge Exam Lifecycle

The complete question paper never exists as a single document until exam start. Each question is individually encrypted (AES-256-GCM), with Time-Lock Puzzles as cryptographic fallback and Shamir's Secret Sharing (3-of-5) for emergency key release. A blockchain audit trail provides O(1) Merkle proof verification for every lifecycle event.

---

## Live Demo

One command creates the entire infrastructure. One command deletes it.

```bash
make deploy    # Creates GCP VM, installs everything, starts services (~5 min)
make destroy   # Deletes VM and all resources
```

### Available Pages

| URL Path | Description |
|----------|-------------|
| `/` | Landing page with project overview |
| `/about` | Detailed about page |
| `/pitch` | Investor pitch deck |
| `/exam` | Candidate exam terminal (login, OTP, proctored exam) |
| `/admin/dashboard` | Admin dashboard (exam management, question bank, monitoring) |
| `/api/v1/health` | API health check |

---

## Architecture

```
Candidate Browser                        Admin Browser
       |                                       |
       v                                       v
  +---------+    +-------+    +-----------+    +---------+
  | Next.js |    | nginx |    | Next.js   |    | Gemini  |
  | Portal  |<-->| :80   |<-->| Admin     |    | 2.5 Pro |
  | :3011   |    |       |    | Dashboard |    | (AI)    |
  +---------+    +---+---+    | :3010     |    +----+----+
                     |        +-----------+         |
                     v                              |
              +--------------+                      |
              | Express API  |<---------------------+
              | mvp-server   |
              | :3000        |
              | (57 endpoints)|
              +------+-------+
                     |
          +----------+----------+
          |                     |
    +-----+------+    +--------+--------+
    | In-Memory  |    | Hash-Chain      |
    | Database   |    | Audit Trail     |
    | (Redis-    |    | (Merkle Proofs) |
    | compatible)|    +-----------------+
    +------------+
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, Tailwind CSS, shadcn/ui |
| **API Server** | Express.js (57 endpoints, single-file MVP) |
| **AI** | Google Gemini 2.5 Pro (question generation from templates) |
| **Security** | AES-256-GCM, Shamir's Secret Sharing, Time-Lock Puzzles |
| **Anti-Cheat** | 10-layer client-side proctoring + LAN lockdown system |
| **Blockchain** | Hash-chain audit trail with Merkle proofs |
| **Deploy** | Terraform + GCP Compute Engine (one-click) |
| **Monitoring** | Real-time terminal dashboard for exam centers |

---

## Project Structure

```
pariksha-suraksha/
├── mvp-server.js                    # Express API server (57 endpoints)
├── Makefile                         # One-click deploy / destroy
├── packages/
│   ├── candidate-portal/            # Next.js — candidate exam UI + proctoring
│   │   └── src/lib/proctor.ts       #   10-layer anti-cheat module
│   ├── admin-dashboard/             # Next.js — admin UI (exams, questions, monitoring)
│   ├── shared/                      # Shared types and validation
│   ├── api-gateway/                 # NestJS — auth, RBAC, rate limiting
│   ├── question-service/            # NestJS — template CRUD, Gemini integration
│   ├── paper-generator/             # NestJS — O(1) matrix lookup, rendering
│   ├── crypto-lifecycle/            # NestJS — KMS, TLP, Shamir
│   ├── exam-session-service/        # NestJS — checkpoints, responses
│   ├── collusion-engine/            # NestJS — detection triggers, clusters
│   └── blockchain-service/          # NestJS — Fabric SDK, Merkle proofs
├── workers/                         # Python compute workers
│   ├── irt-calibrator/              #   3PL IRT model fitting
│   ├── matrix-solver/               #   Constraint satisfaction + simulated annealing
│   ├── collusion-detector/          #   Pairwise log-likelihood + clustering
│   ├── tlp-generator/               #   RSA time-lock puzzle generation
│   └── score-equator/               #   IRT-based score equating
├── lockdown/                        # LAN-based exam center lockdown system
│   ├── kiosk-setup.sh               #   Transforms Ubuntu into exam kiosk
│   ├── iptables-lockdown.sh         #   Kernel-level network firewall
│   ├── chromium-policy.json         #   Browser enterprise policies (60+ rules)
│   ├── exam-server-setup.sh         #   Exam center local server setup
│   └── monitor-dashboard.sh         #   Real-time terminal monitoring
├── deploy/                          # Terraform VM deployment
│   ├── main.tf                      #   GCP VM + firewall + Gemini key
│   └── startup.sh                   #   Automated install and service start
├── chaincode/                       # Hyperledger Fabric smart contract
├── proto/                           # gRPC protobuf definitions
├── terraform/                       # Full GKE infrastructure (12 modules)
└── helm/                            # Kubernetes deployment charts
```

---

## API Endpoints (57 total)

### Auth (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Admin login (username/password) |
| POST | `/auth/candidate-login` | Candidate login (admit card + DOB) |
| POST | `/api/v1/auth/candidate-login` | Candidate login (v1 alias) |
| POST | `/auth/candidate-otp` | Request OTP for candidate |
| POST | `/api/v1/auth/candidate-otp` | Request OTP (v1 alias) |
| POST | `/auth/verify-mfa` | Verify MFA code |

### Questions (9 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/questions` | List questions (with filters) |
| GET | `/api/v1/questions/:id` | Get single question |
| POST | `/api/v1/questions` | Create question template |
| PUT | `/api/v1/questions/:id` | Update question |
| DELETE | `/api/v1/questions/:id` | Delete question |
| POST | `/api/v1/questions/generate` | AI-generate questions via Gemini |
| POST | `/api/v1/questions/:id/approve` | Approve question for use |
| POST | `/api/v1/questions/:id/field-test` | Submit field test data |
| GET | `/api/v1/questions/:id/calibration` | Get IRT calibration params |

### Exams (21 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/exams` | Create exam |
| GET | `/api/v1/exams` | List all exams |
| GET | `/api/v1/exams/:id` | Get exam details |
| PUT | `/api/v1/exams/:id` | Update exam |
| POST | `/api/v1/exams/:id/blueprint` | Set exam blueprint |
| POST | `/api/v1/exams/:id/matrix` | Generate assignment matrix |
| GET | `/api/v1/exams/:id/matrix/status` | Check matrix generation status |
| POST | `/api/v1/exams/:id/encrypt` | Encrypt exam papers |
| GET | `/api/v1/exams/:id/keys/status` | Check encryption key status |
| POST | `/api/v1/exams/:id/activate` | Activate exam (release keys) |
| GET | `/api/v1/exams/:id/monitor` | Real-time exam monitoring data |
| POST | `/api/v1/exams/:id/collusion/run` | Run collusion detection |
| GET | `/api/v1/exams/:id/collusion/results` | Get collusion results |
| POST | `/api/v1/exams/:id/equate` | Run score equating |
| GET | `/api/v1/exams/:id/results` | Get exam results |
| POST | `/api/v1/exams/:id/results/publish` | Publish results |
| GET | `/api/v1/exams/:id/results/search` | Search results by candidate |
| GET | `/api/v1/exams/:id/results/me` | Get my result (candidate) |
| GET | `/api/v1/exams/:id/results/me/scorecard` | Get my scorecard (candidate) |
| POST | `/api/v1/exams/:id/candidates` | Register candidates for exam |
| GET | `/api/v1/exams/:id/candidates` | List exam candidates |

### Exam Session (5 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/exam-session/start` | Start exam session |
| POST | `/api/v1/exam-session/verify-seat` | Verify center and seat assignment |
| POST | `/api/v1/exam-session/checkpoint` | Save answer checkpoint |
| POST | `/api/v1/exam-session/submit` | Submit exam |
| GET | `/api/v1/exam-session/status` | Get session status |

### Proctoring (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/proctor/heartbeat` | Client heartbeat (every 5s) |
| POST | `/api/v1/proctor/violation` | Report violation event |
| GET | `/api/v1/proctor/:sessionId/log` | Get proctor violation log |
| POST | `/api/v1/proctor/lockdown-status` | Report lockdown status |

### Verification (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/verify/:hash` | Verify audit event by hash |
| GET | `/health` | Health check |

### Audit (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audit/events` | List audit events (paginated) |
| GET | `/api/v1/audit/events/:examId` | Get audit events for exam |
| GET | `/api/v1/audit/verify/:eventId` | Verify single audit event |
| GET | `/api/v1/audit/proof/:eventId` | Get Merkle proof for event |

### Dashboard (2 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/dashboard/stats` | Dashboard statistics |
| GET | `/api/v1/dashboard/recent-activity` | Recent activity feed |

### Centers (3 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/centers` | List exam centers |
| POST | `/api/v1/centers` | Create exam center |
| GET | `/api/v1/centers/:id` | Get center details |

---

## Anti-Cheat System (10 Detection Layers)

The `ExamProctor` module (`packages/candidate-portal/src/lib/proctor.ts`) runs client-side during exams and detects:

| # | Detection | What It Catches |
|---|-----------|----------------|
| 1 | **Tab/Window Switch** | Candidate leaves exam tab (visibility API + focus/blur) |
| 2 | **Copy/Paste/Cut Prevention** | Clipboard operations blocked and logged |
| 3 | **Screenshot Blocking** | PrintScreen, Cmd+Shift+3/4/5, Snipping Tool shortcuts intercepted |
| 4 | **DevTools Detection** | Window size anomaly detection + execution timing probes |
| 5 | **Keyboard Shortcut Blocking** | F12, Ctrl+Shift+I/J, Ctrl+S/P/L/T/N/W all intercepted |
| 6 | **Multiple Monitor Detection** | Screen Details API, screen.isExtended, resolution anomaly checks |
| 7 | **VM/Remote Desktop Detection** | User agent scanning, WebGL renderer fingerprinting, hardware concurrency checks |
| 8 | **Fullscreen Lockdown** | Exit detected and logged, automatic re-entry attempted |
| 9 | **Heartbeat System** | 5-second heartbeat to server; missed heartbeats flagged |
| 10 | **Forensic Watermark** | Invisible overlay with candidate ID + exam ID + timestamp (updated every 60s) |

All violations are logged with timestamps and reported to the server. The data is evidence for human investigation -- not automatic disqualification. Exceeding the violation threshold triggers auto-submission.

---

## LAN Lockdown (TCS iON-Style Deployment)

The `lockdown/` directory contains everything needed to deploy ParikshaSuraksha in a fully offline exam center, similar to TCS iON's deployment model.

### Architecture

```
Exam Center LAN (No Internet)
         |
   Exam Server (192.168.1.1)
   - nginx + mvp-server.js
   - dnsmasq (DNS + DHCP)
   - chrony (NTP server)
   - Monitor dashboard
         |
   +-----+-----+-----+
   |     |     |     |
  Kiosk Kiosk Kiosk ...  (Chromium kiosk mode, locked down)
```

### What Gets Locked Down

- **Kiosk machines** run Ubuntu with Chromium in fullscreen kiosk mode -- no desktop, no taskbar, no file manager, no terminal
- **iptables rules** restrict all network traffic to the exam server only (kernel-level enforcement)
- **Chromium enterprise policies** (60+ rules) disable DevTools, extensions, downloads, printing, WebRTC, clipboard, and more
- **USB mass storage** blocked at kernel module level; Bluetooth disabled
- **Key combinations** intercepted: Alt+Tab, Alt+F4, Ctrl+Alt+Del, Ctrl+Alt+T, PrintScreen, F12, and 30+ others
- **Virtual console switching** disabled (no Ctrl+Alt+F1-F12)
- **DNS sinkhole** resolves only `pariksha.local`; all other domains resolve to 0.0.0.0
- **Monitor dashboard** shows real-time status of all connected machines with alerts

### 14-Layer Defense-in-Depth

Physical LAN isolation, iptables firewall, Chromium enterprise policy, kiosk mode, key binding interception, no desktop environment, USB storage blocked, Bluetooth disabled, VT switch disabled, read-only home directory, no DevTools/extensions, server-side exam logic, monitoring dashboard, BIOS lock.

---

## One-Click Deploy

```bash
# Deploy everything (creates GCP VM, installs Node.js, starts all services)
make deploy

# Check if site is up
make status

# SSH into the VM
make ssh

# View service logs
make logs

# Destroy everything
make destroy
```

The deploy creates a GCP Compute Engine VM (Debian 12), installs Node.js 20, nginx, clones the repo, starts the Express API server, both Next.js frontends, and configures nginx to route traffic. Gemini API key is auto-created for AI question generation.

---

## Roles

| Role | Access |
|------|--------|
| **SUPER_ADMIN** | Full system access, user management, all exams |
| **EXAM_CONTROLLER** | Manage exams, activate, monitor, publish results |
| **QUESTION_SETTER** | Create and manage question templates, AI generation |
| **CANDIDATE** | Take exams, view results, download scorecards |

---

## Exam Lifecycle (12 Stages)

```
CREATED → BLUEPRINT_SET → MATRIX_GENERATING → MATRIX_READY →
ENCRYPTING → ENCRYPTED → SCHEDULED → ACTIVE →
COMPLETED → COLLUSION_CHECK → EQUATING → RESULTS_PUBLISHED
```

Each stage transition is recorded in the hash-chain audit trail with Merkle proof verification.

---

## Security (Defense in Depth)

| Layer | Protection |
|-------|-----------|
| **Network** | LAN isolation (no internet during exam), iptables firewall per kiosk |
| **Browser** | Chromium enterprise policies (60+ rules), kiosk mode, no extensions |
| **Client** | 10-layer proctoring (tab switch, copy/paste, screenshot, DevTools, VM detection) |
| **OS** | USB storage blocked, Bluetooth disabled, VT switch disabled, read-only home |
| **API** | JWT auth, role-based access control, rate limiting, input validation |
| **Crypto** | AES-256-GCM encryption, Shamir's Secret Sharing, Time-Lock Puzzles |
| **Audit** | Hash-chain audit trail, Merkle proof verification, immutable event log |
| **Physical** | BIOS password, boot order locked, WiFi adapter removed, UPS mandatory |

---

## Patent / IP

Full design specification and patent documentation:

- `docs/superpowers/specs/2026-03-21-pariksha-suraksha-design.md` -- Complete design spec
- `docs/superpowers/specs/2026-03-21-pariksha-suraksha-design-addendum.md` -- Review fixes (19 issues)
- `pariksha-suraksha-exam-integrity-engine.md` -- Patent specification

---

## Key Metrics

| Metric | Target | How |
|--------|--------|-----|
| Paper generation | < 1ms per candidate | Single table lookup (pre-rendered) |
| Collusion detection | < 15min per 500 candidates | O(1) per pair, parallelized |
| Key release precision | +/- 5 seconds | Scheduled release + TLP fallback |
| Audit verification | < 5ms per event | O(log n) Merkle proof |
| False positive rate | < 0.0001 | Calibrated log-likelihood threshold |

---

## Author

**[Divya Mohan](https://dmj.one)** | [GitHub](https://github.com/divyamohan1993) | [dmj.one](https://dmj.one)

Proprietary. Patent pending. All rights reserved.

---

<p align="center">
  <strong>Aatmnirbhar Viksit Bharat 2047</strong>
  <br>
  Built in India. For India. And beyond.
  <br><br>
  300 million aspirants deserve an exam system where merit, not manipulation, determines outcomes.
  <br>
  ParikshaSuraksha provides mathematical proof of exam fairness.
  <br><br>
  <em>Dream. Manifest. Journey. Together as one.</em>
</p>
