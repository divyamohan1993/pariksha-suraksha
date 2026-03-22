const express = require("express");
const crypto = require("crypto");
const https = require("https");

const app = express();
app.use(express.json({ limit: "10mb" }));

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── GEMINI CONFIG ───────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// ─── UTILITY HELPERS ─────────────────────────────────────────────────────────
const uid = () => crypto.randomBytes(6).toString("hex");
const shortUid = () => crypto.randomBytes(4).toString("hex").toUpperCase();
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const now = () => new Date().toISOString();

// ─── IN-MEMORY DATABASE ─────────────────────────────────────────────────────
const db = {
  users: {},
  questions: {},
  exams: {},
  candidates: {},
  sessions: {},
  submissions: {},
  centers: {},
  auditEvents: [],
  auditHashChain: "0000000000000000000000000000000000000000000000000000000000000000",
  proctorLogs: {},   // sessionId -> [{...}]
  heartbeats: {},    // sessionId -> lastTimestamp
  checkpoints: {},   // sessionId -> {...}
  collusionResults: {},  // examId -> {...}
  matrixJobs: {},    // examId -> { status, progress, ... }
  encryptionJobs: {}, // examId -> { step, progress, ... }
  equatingJobs: {},  // examId -> {...}
  otpStore: {},      // admitCard -> otp
  mfaStore: {},      // token -> code
};

// ─── AUDIT TRAIL ────────────────────────────────────────────────────────────
function addAuditEvent(eventType, actorId, examId, metadata = {}) {
  const eventId = `evt_${uid()}`;
  const prevHash = db.auditHashChain;
  const entityHash = sha256(JSON.stringify({ eventType, actorId, examId, metadata, prevHash }));
  db.auditHashChain = entityHash;
  const event = {
    eventId,
    eventType,
    examId: examId || "",
    entityHash,
    prevHash,
    timestamp: now(),
    actorId: actorId || "system",
    actorOrg: "ParikshaSuraksha",
    metadata,
    txId: `tx_${uid()}`,
  };
  db.auditEvents.push(event);
  return event;
}

// ─── SEED QUESTION BANK (30+ questions) ─────────────────────────────────────
const seedQuestions = [
  // PHYSICS (10)
  {
    id: "q1", subject: "Physics", topic: "Mechanics", subtopic: "Kinematics",
    bloomLevel: "apply",
    templateText: "A ball is thrown upward with velocity {{v}} m/s. Find the maximum height reached. (g = 10 m/s²)",
    parameters: [{ name: "v", type: "float", min: 10, max: 30, step: 5, values: [10, 15, 20, 25, 30] }],
    answerFormula: "v^2 / (2*10)",
    distractors: [
      { formula: "v^2 / (2*10) + 5", type: "calculation_error", label: "B" },
      { formula: "v^2 / 10", type: "common_misconception", label: "C" },
      { formula: "v^2 / (4*10)", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.2, aStd: 0.1, bMean: -0.5, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.55, B: 0.2, C: 0.15, D: 0.1 },
    _compute: (v) => {
      const ans = (v * v) / 20;
      return [
        { label: "A", text: `${ans} m`, correct: true },
        { label: "B", text: `${ans + 5} m`, correct: false },
        { label: "C", text: `${(v * v) / 10} m`, correct: false },
        { label: "D", text: `${(v * v) / 40} m`, correct: false },
      ];
    },
  },
  {
    id: "q2", subject: "Physics", topic: "Optics", subtopic: "Lenses",
    bloomLevel: "apply",
    templateText: "A convex lens has focal length f = {{f}} cm. An object is placed at u = {{u}} cm. Find the image distance.",
    parameters: [
      { name: "f", type: "float", min: 10, max: 20, step: 5, values: [10, 15, 20] },
      { name: "u", type: "float", min: 30, max: 60, step: 10, values: [30, 40, 60] },
    ],
    answerFormula: "(f*u)/(u-f)",
    distractors: [
      { formula: "(f*u)/(u-f) + 10", type: "calculation_error", label: "B" },
      { formula: "2*(f*u)/(u-f)", type: "common_misconception", label: "C" },
      { formula: "(f*u)/(2*(u-f))", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.12, bMean: 0.3, bStd: 0.2, cMean: 0.2, cStd: 0.04 },
    distractorProfile: { A: 0.50, B: 0.22, C: 0.18, D: 0.10 },
    _compute: (f, u) => {
      const v = (f * u) / (u - f);
      return [
        { label: "A", text: `${v.toFixed(1)} cm`, correct: true },
        { label: "B", text: `${(v + 10).toFixed(1)} cm`, correct: false },
        { label: "C", text: `${(v * 2).toFixed(1)} cm`, correct: false },
        { label: "D", text: `${(v / 2).toFixed(1)} cm`, correct: false },
      ];
    },
  },
  {
    id: "q3", subject: "Physics", topic: "Thermodynamics", subtopic: "Internal Energy",
    bloomLevel: "apply",
    templateText: "{{n}} mol of an ideal monoatomic gas is at {{T}} K. Find its internal energy.",
    parameters: [
      { name: "n", type: "float", min: 1, max: 3, step: 1, values: [1, 2, 3] },
      { name: "T", type: "float", min: 300, max: 500, step: 100, values: [300, 400, 500] },
    ],
    answerFormula: "1.5 * n * 8.314 * T",
    distractors: [
      { formula: "1.5 * n * 8.314 * T * 2", type: "common_misconception", label: "B" },
      { formula: "n * 8.314 * T", type: "calculation_error", label: "C" },
      { formula: "1.5 * n * 8.314 * T * 0.67", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: 0.0, bStd: 0.18, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.52, B: 0.18, C: 0.20, D: 0.10 },
    _compute: (n, T) => {
      const r = Math.round(1.5 * n * 8.314 * T);
      return [
        { label: "A", text: `${r} J`, correct: true },
        { label: "B", text: `${r * 2} J`, correct: false },
        { label: "C", text: `${Math.round(n * 8.314 * T)} J`, correct: false },
        { label: "D", text: `${Math.round(r * 0.67)} J`, correct: false },
      ];
    },
  },
  {
    id: "q4", subject: "Physics", topic: "Electricity", subtopic: "Resistance",
    bloomLevel: "apply",
    templateText: "A wire has resistivity ρ = {{rho}} Ω·m, length L = {{l}} m, area A = {{a}} mm². Find its resistance.",
    parameters: [
      { name: "rho", type: "float", values: [1e-7, 1.7e-7] },
      { name: "l", type: "float", min: 1, max: 5, step: 1, values: [1, 2, 5] },
      { name: "a", type: "float", min: 1, max: 2, step: 1, values: [1, 2] },
    ],
    answerFormula: "rho * l / (a * 1e-6)",
    distractors: [
      { formula: "2 * rho * l / (a * 1e-6)", type: "calculation_error", label: "B" },
      { formula: "rho * l / (2 * a * 1e-6)", type: "unit_error", label: "C" },
      { formula: "rho * l / (a * 1e-6) + 0.05", type: "common_misconception", label: "D" },
    ],
    irtParams: { aMean: 0.9, aStd: 0.11, bMean: 0.5, bStd: 0.2, cMean: 0.2, cStd: 0.04 },
    distractorProfile: { A: 0.48, B: 0.20, C: 0.18, D: 0.14 },
    _compute: (rho, l, a) => {
      const r = (rho * l / (a * 1e-6)).toFixed(4);
      return [
        { label: "A", text: `${r} Ω`, correct: true },
        { label: "B", text: `${(parseFloat(r) * 2).toFixed(4)} Ω`, correct: false },
        { label: "C", text: `${(parseFloat(r) / 2).toFixed(4)} Ω`, correct: false },
        { label: "D", text: `${(parseFloat(r) + 0.05).toFixed(4)} Ω`, correct: false },
      ];
    },
  },
  {
    id: "q5", subject: "Physics", topic: "Mechanics", subtopic: "Newton's Laws",
    bloomLevel: "apply",
    templateText: "A {{m}} kg block is pushed with force {{F}} N on a frictionless surface. Find acceleration.",
    parameters: [
      { name: "m", type: "float", min: 2, max: 10, step: 2, values: [2, 4, 5, 8, 10] },
      { name: "F", type: "float", min: 10, max: 50, step: 10, values: [10, 20, 30, 40, 50] },
    ],
    answerFormula: "F / m",
    distractors: [
      { formula: "F * m", type: "common_misconception", label: "B" },
      { formula: "F / m + 2", type: "calculation_error", label: "C" },
      { formula: "m / F", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.3, aStd: 0.09, bMean: -0.8, bStd: 0.15, cMean: 0.25, cStd: 0.04 },
    distractorProfile: { A: 0.60, B: 0.15, C: 0.15, D: 0.10 },
    _compute: (m, F) => {
      const a = F / m;
      return [
        { label: "A", text: `${a} m/s²`, correct: true },
        { label: "B", text: `${F * m} m/s²`, correct: false },
        { label: "C", text: `${a + 2} m/s²`, correct: false },
        { label: "D", text: `${(m / F).toFixed(2)} m/s²`, correct: false },
      ];
    },
  },
  {
    id: "q6", subject: "Physics", topic: "Waves", subtopic: "Frequency",
    bloomLevel: "understand",
    templateText: "A wave has wavelength {{lambda}} m and speed {{v}} m/s. What is its frequency?",
    parameters: [
      { name: "lambda", type: "float", values: [0.5, 1, 2, 4] },
      { name: "v", type: "float", values: [340, 300, 170, 680] },
    ],
    answerFormula: "v / lambda",
    distractors: [
      { formula: "v * lambda", type: "common_misconception", label: "B" },
      { formula: "v / lambda + 10", type: "calculation_error", label: "C" },
      { formula: "lambda / v", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: -0.3, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.58, B: 0.18, C: 0.14, D: 0.10 },
    _compute: (lambda, v) => {
      const f = v / lambda;
      return [
        { label: "A", text: `${f} Hz`, correct: true },
        { label: "B", text: `${v * lambda} Hz`, correct: false },
        { label: "C", text: `${f + 10} Hz`, correct: false },
        { label: "D", text: `${(lambda / v).toFixed(4)} Hz`, correct: false },
      ];
    },
  },
  {
    id: "q7", subject: "Physics", topic: "Modern Physics", subtopic: "Photoelectric Effect",
    bloomLevel: "analyze",
    templateText: "Light of wavelength {{lambda}} nm strikes a metal with work function {{phi}} eV. Find max KE of emitted electrons. (h = 6.63×10⁻³⁴ J·s, c = 3×10⁸ m/s, 1 eV = 1.6×10⁻¹⁹ J)",
    parameters: [
      { name: "lambda", type: "float", values: [200, 250, 300, 400] },
      { name: "phi", type: "float", values: [2.0, 2.5, 3.0, 3.5] },
    ],
    answerFormula: "(1240 / lambda) - phi",
    distractors: [
      { formula: "(1240 / lambda)", type: "common_misconception", label: "B" },
      { formula: "(1240 / lambda) - phi + 0.5", type: "calculation_error", label: "C" },
      { formula: "phi - (1240 / lambda)", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.4, aStd: 0.12, bMean: 1.0, bStd: 0.25, cMean: 0.2, cStd: 0.04 },
    distractorProfile: { A: 0.40, B: 0.25, C: 0.20, D: 0.15 },
    _compute: (lambda, phi) => {
      const e = (1240 / lambda) - phi;
      return [
        { label: "A", text: `${e.toFixed(2)} eV`, correct: true },
        { label: "B", text: `${(1240 / lambda).toFixed(2)} eV`, correct: false },
        { label: "C", text: `${(e + 0.5).toFixed(2)} eV`, correct: false },
        { label: "D", text: `${Math.abs(phi - (1240 / lambda)).toFixed(2)} eV`, correct: false },
      ];
    },
  },
  {
    id: "q8", subject: "Physics", topic: "Gravitation", subtopic: "Orbital Velocity",
    bloomLevel: "apply",
    templateText: "A satellite orbits Earth at height {{h}} km above surface. Find orbital velocity. (R = 6400 km, g = 9.8 m/s²)",
    parameters: [
      { name: "h", type: "float", values: [200, 400, 600, 800] },
    ],
    answerFormula: "sqrt(g * R^2 / (R + h))",
    distractors: [
      { formula: "sqrt(g * R)", type: "common_misconception", label: "B" },
      { formula: "sqrt(g * R^2 / (R + h)) + 500", type: "calculation_error", label: "C" },
      { formula: "sqrt(2 * g * R^2 / (R + h))", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.13, bMean: 0.8, bStd: 0.2, cMean: 0.2, cStd: 0.04 },
    distractorProfile: { A: 0.42, B: 0.25, C: 0.18, D: 0.15 },
    _compute: (h) => {
      const R = 6400;
      const g = 9.8;
      const v = Math.sqrt(g * (R * 1000) * (R * 1000) / ((R + h) * 1000));
      return [
        { label: "A", text: `${Math.round(v)} m/s`, correct: true },
        { label: "B", text: `${Math.round(Math.sqrt(g * R * 1000))} m/s`, correct: false },
        { label: "C", text: `${Math.round(v) + 500} m/s`, correct: false },
        { label: "D", text: `${Math.round(v * Math.sqrt(2))} m/s`, correct: false },
      ];
    },
  },
  {
    id: "q9", subject: "Physics", topic: "Electrostatics", subtopic: "Coulomb's Law",
    bloomLevel: "apply",
    templateText: "Two charges of {{q1}} μC and {{q2}} μC are {{r}} m apart. Find the force between them. (k = 9×10⁹ N·m²/C²)",
    parameters: [
      { name: "q1", type: "float", values: [1, 2, 3, 5] },
      { name: "q2", type: "float", values: [1, 2, 4, 6] },
      { name: "r", type: "float", values: [0.1, 0.2, 0.5, 1.0] },
    ],
    answerFormula: "k * q1 * q2 * 1e-12 / r^2",
    distractors: [
      { formula: "k * q1 * q2 / r^2 (without unit conversion)", type: "unit_error", label: "B" },
      { formula: "k * q1 * q2 * 1e-12 / r", type: "common_misconception", label: "C" },
      { formula: "k * q1 * q2 * 1e-12 / (2*r^2)", type: "calculation_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: 0.2, bStd: 0.18, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.50, B: 0.20, C: 0.18, D: 0.12 },
    _compute: (q1, q2, r) => {
      const F = (9e9 * q1 * q2 * 1e-12) / (r * r);
      return [
        { label: "A", text: `${F.toFixed(4)} N`, correct: true },
        { label: "B", text: `${(9e9 * q1 * q2 / (r * r)).toExponential(2)} N`, correct: false },
        { label: "C", text: `${(9e9 * q1 * q2 * 1e-12 / r).toFixed(4)} N`, correct: false },
        { label: "D", text: `${(F / 2).toFixed(4)} N`, correct: false },
      ];
    },
  },
  {
    id: "q10", subject: "Physics", topic: "Mechanics", subtopic: "Momentum",
    bloomLevel: "apply",
    templateText: "A {{m}} kg object moving at {{v}} m/s collides and sticks to a stationary {{m2}} kg object. Find the final velocity.",
    parameters: [
      { name: "m", type: "float", values: [2, 3, 4, 5] },
      { name: "v", type: "float", values: [10, 15, 20, 25] },
      { name: "m2", type: "float", values: [2, 3, 5, 8] },
    ],
    answerFormula: "(m * v) / (m + m2)",
    distractors: [
      { formula: "v", type: "common_misconception", label: "B" },
      { formula: "(m * v) / m2", type: "calculation_error", label: "C" },
      { formula: "(m + m2) * v / m", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.11, bMean: 0.1, bStd: 0.17, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.52, B: 0.20, C: 0.16, D: 0.12 },
    _compute: (m, v, m2) => {
      const vf = (m * v) / (m + m2);
      return [
        { label: "A", text: `${vf.toFixed(2)} m/s`, correct: true },
        { label: "B", text: `${v} m/s`, correct: false },
        { label: "C", text: `${((m * v) / m2).toFixed(2)} m/s`, correct: false },
        { label: "D", text: `${(((m + m2) * v) / m).toFixed(2)} m/s`, correct: false },
      ];
    },
  },

  // CHEMISTRY (8)
  {
    id: "q11", subject: "Chemistry", topic: "Stoichiometry", subtopic: "Moles",
    bloomLevel: "apply",
    templateText: "How many moles are in {{mass}} g of NaCl? (Molar mass = 58.5 g/mol)",
    parameters: [{ name: "mass", type: "float", values: [29.25, 58.5, 117, 175.5, 234] }],
    answerFormula: "mass / 58.5",
    distractors: [
      { formula: "mass / 58.5 * 2", type: "calculation_error", label: "B" },
      { formula: "mass / 58.5 + 0.5", type: "common_misconception", label: "C" },
      { formula: "mass / 58.5 / 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.2, aStd: 0.1, bMean: -0.4, bStd: 0.14, cMean: 0.25, cStd: 0.03 },
    distractorProfile: { A: 0.58, B: 0.18, C: 0.14, D: 0.10 },
    _compute: (mass) => {
      const c = mass / 58.5;
      return [
        { label: "A", text: `${c.toFixed(2)} mol`, correct: true },
        { label: "B", text: `${(c * 2).toFixed(2)} mol`, correct: false },
        { label: "C", text: `${(c + 0.5).toFixed(2)} mol`, correct: false },
        { label: "D", text: `${(c / 2).toFixed(2)} mol`, correct: false },
      ];
    },
  },
  {
    id: "q12", subject: "Chemistry", topic: "Acids & Bases", subtopic: "pH",
    bloomLevel: "apply",
    templateText: "What is the pH of a {{c}} M HCl solution?",
    parameters: [{ name: "c", type: "float", values: [0.1, 0.01, 0.001, 0.0001] }],
    answerFormula: "-log10(c)",
    distractors: [
      { formula: "-log10(c) + 1", type: "calculation_error", label: "B" },
      { formula: "14 - (-log10(c))", type: "common_misconception", label: "C" },
      { formula: "-log10(c) - 1", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: -0.2, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.55, B: 0.18, C: 0.17, D: 0.10 },
    _compute: (c) => {
      const p = -Math.log10(c);
      return [
        { label: "A", text: `${p}`, correct: true },
        { label: "B", text: `${p + 1}`, correct: false },
        { label: "C", text: `${14 - p}`, correct: false },
        { label: "D", text: `${p - 1}`, correct: false },
      ];
    },
  },
  {
    id: "q13", subject: "Chemistry", topic: "Gas Laws", subtopic: "Ideal Gas",
    bloomLevel: "apply",
    templateText: "{{n}} mol of an ideal gas at {{T}} K in a {{V}} L container. Find the pressure in atm. (R = 0.0821 L·atm/mol·K)",
    parameters: [
      { name: "n", type: "float", values: [1, 2, 3, 5] },
      { name: "T", type: "float", values: [273, 300, 373, 500] },
      { name: "V", type: "float", values: [10, 20, 22.4, 50] },
    ],
    answerFormula: "n * 0.0821 * T / V",
    distractors: [
      { formula: "n * T / V", type: "common_misconception", label: "B" },
      { formula: "n * 0.0821 * T / V + 1", type: "calculation_error", label: "C" },
      { formula: "n * 8.314 * T / V", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.12, bMean: 0.3, bStd: 0.18, cMean: 0.2, cStd: 0.04 },
    distractorProfile: { A: 0.48, B: 0.22, C: 0.16, D: 0.14 },
    _compute: (n, T, V) => {
      const P = (n * 0.0821 * T) / V;
      return [
        { label: "A", text: `${P.toFixed(2)} atm`, correct: true },
        { label: "B", text: `${(n * T / V).toFixed(2)} atm`, correct: false },
        { label: "C", text: `${(P + 1).toFixed(2)} atm`, correct: false },
        { label: "D", text: `${((n * 8.314 * T) / V).toFixed(2)} atm`, correct: false },
      ];
    },
  },
  {
    id: "q14", subject: "Chemistry", topic: "Electrochemistry", subtopic: "Cell Potential",
    bloomLevel: "analyze",
    templateText: "A galvanic cell has E°(cathode) = {{ec}} V and E°(anode) = {{ea}} V. Find the cell EMF.",
    parameters: [
      { name: "ec", type: "float", values: [0.34, 0.80, 1.36, 0.77] },
      { name: "ea", type: "float", values: [-0.76, -0.44, -0.13, 0.34] },
    ],
    answerFormula: "ec - ea",
    distractors: [
      { formula: "ea - ec", type: "common_misconception", label: "B" },
      { formula: "ec + ea", type: "calculation_error", label: "C" },
      { formula: "(ec - ea) / 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.2, aStd: 0.11, bMean: 0.5, bStd: 0.2, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.45, B: 0.25, C: 0.18, D: 0.12 },
    _compute: (ec, ea) => {
      const emf = ec - ea;
      return [
        { label: "A", text: `${emf.toFixed(2)} V`, correct: true },
        { label: "B", text: `${(ea - ec).toFixed(2)} V`, correct: false },
        { label: "C", text: `${(ec + ea).toFixed(2)} V`, correct: false },
        { label: "D", text: `${(emf / 2).toFixed(2)} V`, correct: false },
      ];
    },
  },
  {
    id: "q15", subject: "Chemistry", topic: "Chemical Kinetics", subtopic: "Half Life",
    bloomLevel: "apply",
    templateText: "A first-order reaction has rate constant k = {{k}} s⁻¹. Find the half-life.",
    parameters: [{ name: "k", type: "float", values: [0.01, 0.02, 0.05, 0.1, 0.5] }],
    answerFormula: "0.693 / k",
    distractors: [
      { formula: "1 / k", type: "common_misconception", label: "B" },
      { formula: "0.693 * k", type: "calculation_error", label: "C" },
      { formula: "0.693 / (2 * k)", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: 0.0, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.52, B: 0.22, C: 0.16, D: 0.10 },
    _compute: (k) => {
      const t = 0.693 / k;
      return [
        { label: "A", text: `${t.toFixed(2)} s`, correct: true },
        { label: "B", text: `${(1 / k).toFixed(2)} s`, correct: false },
        { label: "C", text: `${(0.693 * k).toFixed(4)} s`, correct: false },
        { label: "D", text: `${(t / 2).toFixed(2)} s`, correct: false },
      ];
    },
  },
  {
    id: "q16", subject: "Chemistry", topic: "Atomic Structure", subtopic: "Quantum Numbers",
    bloomLevel: "remember",
    templateText: "For n = {{n}}, what is the maximum number of electrons that can occupy this shell?",
    parameters: [{ name: "n", type: "integer", values: [1, 2, 3, 4, 5] }],
    answerFormula: "2 * n^2",
    distractors: [
      { formula: "n^2", type: "common_misconception", label: "B" },
      { formula: "2 * n", type: "calculation_error", label: "C" },
      { formula: "2 * n^2 + 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.3, aStd: 0.09, bMean: -0.6, bStd: 0.14, cMean: 0.25, cStd: 0.03 },
    distractorProfile: { A: 0.60, B: 0.18, C: 0.14, D: 0.08 },
    _compute: (n) => {
      const max = 2 * n * n;
      return [
        { label: "A", text: `${max}`, correct: true },
        { label: "B", text: `${n * n}`, correct: false },
        { label: "C", text: `${2 * n}`, correct: false },
        { label: "D", text: `${max + 2}`, correct: false },
      ];
    },
  },
  {
    id: "q17", subject: "Chemistry", topic: "Solutions", subtopic: "Molarity",
    bloomLevel: "apply",
    templateText: "{{mass}} g of NaOH (M = 40 g/mol) is dissolved in {{vol}} mL of solution. Find the molarity.",
    parameters: [
      { name: "mass", type: "float", values: [4, 8, 10, 20, 40] },
      { name: "vol", type: "float", values: [100, 200, 250, 500, 1000] },
    ],
    answerFormula: "(mass / 40) / (vol / 1000)",
    distractors: [
      { formula: "mass / 40", type: "common_misconception", label: "B" },
      { formula: "(mass / 40) / vol", type: "unit_error", label: "C" },
      { formula: "(mass / 40) / (vol / 1000) + 0.5", type: "calculation_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: -0.1, bStd: 0.16, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.54, B: 0.20, C: 0.16, D: 0.10 },
    _compute: (mass, vol) => {
      const M = (mass / 40) / (vol / 1000);
      return [
        { label: "A", text: `${M.toFixed(2)} M`, correct: true },
        { label: "B", text: `${(mass / 40).toFixed(2)} M`, correct: false },
        { label: "C", text: `${((mass / 40) / vol).toFixed(4)} M`, correct: false },
        { label: "D", text: `${(M + 0.5).toFixed(2)} M`, correct: false },
      ];
    },
  },
  {
    id: "q18", subject: "Chemistry", topic: "Thermochemistry", subtopic: "Enthalpy",
    bloomLevel: "apply",
    templateText: "If {{n}} mol of methane combusts releasing {{dH}} kJ/mol, how much total heat is released?",
    parameters: [
      { name: "n", type: "float", values: [1, 2, 3, 5] },
      { name: "dH", type: "float", values: [890, 802, 726, 1560] },
    ],
    answerFormula: "n * dH",
    distractors: [
      { formula: "dH / n", type: "common_misconception", label: "B" },
      { formula: "n * dH + 100", type: "calculation_error", label: "C" },
      { formula: "n * dH / 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: -0.3, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.55, B: 0.18, C: 0.15, D: 0.12 },
    _compute: (n, dH) => {
      const total = n * dH;
      return [
        { label: "A", text: `${total} kJ`, correct: true },
        { label: "B", text: `${(dH / n).toFixed(1)} kJ`, correct: false },
        { label: "C", text: `${total + 100} kJ`, correct: false },
        { label: "D", text: `${total / 2} kJ`, correct: false },
      ];
    },
  },

  // MATH (8)
  {
    id: "q19", subject: "Math", topic: "Calculus", subtopic: "Differentiation",
    bloomLevel: "apply",
    templateText: "Find the derivative of f(x) = {{a}}x³ + {{b}}x² at x = {{c}}.",
    parameters: [
      { name: "a", type: "integer", values: [1, 2, 3, 4] },
      { name: "b", type: "integer", values: [2, 3, 4, 5] },
      { name: "c", type: "integer", values: [1, 2, 3] },
    ],
    answerFormula: "3*a*c^2 + 2*b*c",
    distractors: [
      { formula: "3*a*c^2 + 2*b*c + a", type: "calculation_error", label: "B" },
      { formula: "2*(3*a*c^2 + 2*b*c)", type: "common_misconception", label: "C" },
      { formula: "3*a*c^2 + 2*b*c - b", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.2, aStd: 0.1, bMean: 0.2, bStd: 0.17, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.50, B: 0.22, C: 0.16, D: 0.12 },
    _compute: (a, b, c) => {
      const r = 3 * a * c * c + 2 * b * c;
      return [
        { label: "A", text: `${r}`, correct: true },
        { label: "B", text: `${r + a}`, correct: false },
        { label: "C", text: `${r * 2}`, correct: false },
        { label: "D", text: `${r - b}`, correct: false },
      ];
    },
  },
  {
    id: "q20", subject: "Math", topic: "Probability", subtopic: "Dice",
    bloomLevel: "apply",
    templateText: "Two dice are thrown. What is the probability of getting a sum of {{s}}?",
    parameters: [{ name: "s", type: "integer", values: [5, 6, 7, 8, 9, 10] }],
    answerFormula: "ways(s) / 36",
    distractors: [
      { formula: "(ways(s)+1) / 36", type: "calculation_error", label: "B" },
      { formula: "(ways(s)-1) / 36", type: "common_misconception", label: "C" },
      { formula: "ways(s)*2 / 36", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: 0.0, bStd: 0.15, cMean: 0.25, cStd: 0.04 },
    distractorProfile: { A: 0.55, B: 0.18, C: 0.17, D: 0.10 },
    _compute: (s) => {
      const ways = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
      const n = ways[s] || 3;
      return [
        { label: "A", text: `${n}/36`, correct: true },
        { label: "B", text: `${n + 1}/36`, correct: false },
        { label: "C", text: `${n - 1}/36`, correct: false },
        { label: "D", text: `${n * 2}/36`, correct: false },
      ];
    },
  },
  {
    id: "q21", subject: "Math", topic: "Algebra", subtopic: "Quadratic Equations",
    bloomLevel: "apply",
    templateText: "Find the roots of x² - {{s}}x + {{p}} = 0.",
    parameters: [
      { name: "s", type: "integer", values: [5, 7, 8, 9, 11] },
      { name: "p", type: "integer", values: [6, 10, 12, 14, 18] },
    ],
    answerFormula: "(s ± sqrt(s^2 - 4p)) / 2",
    distractors: [
      { formula: "s and p", type: "common_misconception", label: "B" },
      { formula: "(s ± sqrt(s^2 - 4p)) / 2 + 1", type: "calculation_error", label: "C" },
      { formula: "(s ± sqrt(s^2 + 4p)) / 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: 0.1, bStd: 0.16, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.52, B: 0.20, C: 0.17, D: 0.11 },
    _compute: (s, p) => {
      const disc = s * s - 4 * p;
      const r1 = (s + Math.sqrt(Math.abs(disc))) / 2;
      const r2 = (s - Math.sqrt(Math.abs(disc))) / 2;
      return [
        { label: "A", text: `${r1.toFixed(1)}, ${r2.toFixed(1)}`, correct: true },
        { label: "B", text: `${s}, ${p}`, correct: false },
        { label: "C", text: `${(r1 + 1).toFixed(1)}, ${(r2 + 1).toFixed(1)}`, correct: false },
        { label: "D", text: `${((s + Math.sqrt(s * s + 4 * p)) / 2).toFixed(1)}, ${((s - Math.sqrt(s * s + 4 * p)) / 2).toFixed(1)}`, correct: false },
      ];
    },
  },
  {
    id: "q22", subject: "Math", topic: "Trigonometry", subtopic: "Identities",
    bloomLevel: "understand",
    templateText: "If sin θ = {{s}}/{{h}}, and θ is in the first quadrant, find cos θ.",
    parameters: [
      { name: "s", type: "integer", values: [3, 5, 8, 12] },
      { name: "h", type: "integer", values: [5, 13, 17, 13] },
    ],
    answerFormula: "sqrt(h^2 - s^2) / h",
    distractors: [
      { formula: "s / h", type: "common_misconception", label: "B" },
      { formula: "1 - s/h", type: "calculation_error", label: "C" },
      { formula: "h / s", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: -0.2, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.55, B: 0.20, C: 0.15, D: 0.10 },
    _compute: (s, h) => {
      const cosVal = Math.sqrt(h * h - s * s) / h;
      return [
        { label: "A", text: `${cosVal.toFixed(4)}`, correct: true },
        { label: "B", text: `${(s / h).toFixed(4)}`, correct: false },
        { label: "C", text: `${(1 - s / h).toFixed(4)}`, correct: false },
        { label: "D", text: `${(h / s).toFixed(4)}`, correct: false },
      ];
    },
  },
  {
    id: "q23", subject: "Math", topic: "Calculus", subtopic: "Integration",
    bloomLevel: "apply",
    templateText: "Evaluate the definite integral of {{a}}x² from 0 to {{b}}.",
    parameters: [
      { name: "a", type: "integer", values: [1, 2, 3, 5] },
      { name: "b", type: "integer", values: [1, 2, 3, 4] },
    ],
    answerFormula: "a * b^3 / 3",
    distractors: [
      { formula: "a * b^2", type: "common_misconception", label: "B" },
      { formula: "a * b^3 / 3 + 1", type: "calculation_error", label: "C" },
      { formula: "a * b^3 / 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.2, aStd: 0.11, bMean: 0.4, bStd: 0.18, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.48, B: 0.22, C: 0.18, D: 0.12 },
    _compute: (a, b) => {
      const val = (a * b * b * b) / 3;
      return [
        { label: "A", text: `${val.toFixed(2)}`, correct: true },
        { label: "B", text: `${(a * b * b).toFixed(2)}`, correct: false },
        { label: "C", text: `${(val + 1).toFixed(2)}`, correct: false },
        { label: "D", text: `${((a * b * b * b) / 2).toFixed(2)}`, correct: false },
      ];
    },
  },
  {
    id: "q24", subject: "Math", topic: "Matrices", subtopic: "Determinant",
    bloomLevel: "apply",
    templateText: "Find the determinant of the 2×2 matrix [[{{a}}, {{b}}], [{{c}}, {{d}}]].",
    parameters: [
      { name: "a", type: "integer", values: [1, 2, 3, 4] },
      { name: "b", type: "integer", values: [2, 3, 5, 1] },
      { name: "c", type: "integer", values: [3, 1, 2, 5] },
      { name: "d", type: "integer", values: [4, 5, 1, 2] },
    ],
    answerFormula: "a*d - b*c",
    distractors: [
      { formula: "a*d + b*c", type: "common_misconception", label: "B" },
      { formula: "a*c - b*d", type: "calculation_error", label: "C" },
      { formula: "(a*d - b*c) / 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: -0.3, bStd: 0.15, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.55, B: 0.20, C: 0.15, D: 0.10 },
    _compute: (a, b, c, d) => {
      const det = a * d - b * c;
      return [
        { label: "A", text: `${det}`, correct: true },
        { label: "B", text: `${a * d + b * c}`, correct: false },
        { label: "C", text: `${a * c - b * d}`, correct: false },
        { label: "D", text: `${det / 2}`, correct: false },
      ];
    },
  },
  {
    id: "q25", subject: "Math", topic: "Vectors", subtopic: "Dot Product",
    bloomLevel: "apply",
    templateText: "Find the dot product of vectors A = ({{a1}}, {{a2}}) and B = ({{b1}}, {{b2}}).",
    parameters: [
      { name: "a1", type: "integer", values: [1, 2, 3, -1] },
      { name: "a2", type: "integer", values: [2, 3, -1, 4] },
      { name: "b1", type: "integer", values: [3, 1, 2, -2] },
      { name: "b2", type: "integer", values: [1, -1, 4, 3] },
    ],
    answerFormula: "a1*b1 + a2*b2",
    distractors: [
      { formula: "a1*b2 + a2*b1", type: "common_misconception", label: "B" },
      { formula: "a1*b1 - a2*b2", type: "calculation_error", label: "C" },
      { formula: "a1*b1 + a2*b2 + 1", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: -0.4, bStd: 0.14, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.58, B: 0.17, C: 0.15, D: 0.10 },
    _compute: (a1, a2, b1, b2) => {
      const dp = a1 * b1 + a2 * b2;
      return [
        { label: "A", text: `${dp}`, correct: true },
        { label: "B", text: `${a1 * b2 + a2 * b1}`, correct: false },
        { label: "C", text: `${a1 * b1 - a2 * b2}`, correct: false },
        { label: "D", text: `${dp + 1}`, correct: false },
      ];
    },
  },
  {
    id: "q26", subject: "Math", topic: "Statistics", subtopic: "Standard Deviation",
    bloomLevel: "apply",
    templateText: "Find the variance of the dataset: {{a}}, {{b}}, {{c}}, {{d}}, {{e}}.",
    parameters: [
      { name: "a", type: "integer", values: [2, 4, 10] },
      { name: "b", type: "integer", values: [4, 6, 12] },
      { name: "c", type: "integer", values: [6, 8, 14] },
      { name: "d", type: "integer", values: [8, 10, 16] },
      { name: "e", type: "integer", values: [10, 12, 18] },
    ],
    answerFormula: "mean((x-mean)^2)",
    distractors: [
      { formula: "sqrt(variance)", type: "common_misconception", label: "B" },
      { formula: "variance + 1", type: "calculation_error", label: "C" },
      { formula: "variance * 2", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.0, aStd: 0.1, bMean: 0.3, bStd: 0.17, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.48, B: 0.24, C: 0.16, D: 0.12 },
    _compute: (a, b, c, d, e) => {
      const vals = [a, b, c, d, e];
      const mean = vals.reduce((s, v) => s + v, 0) / 5;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / 5;
      return [
        { label: "A", text: `${variance.toFixed(2)}`, correct: true },
        { label: "B", text: `${Math.sqrt(variance).toFixed(2)}`, correct: false },
        { label: "C", text: `${(variance + 1).toFixed(2)}`, correct: false },
        { label: "D", text: `${(variance * 2).toFixed(2)}`, correct: false },
      ];
    },
  },

  // BIOLOGY (6)
  {
    id: "q27", subject: "Biology", topic: "Genetics", subtopic: "Mendelian",
    bloomLevel: "understand",
    templateText: "In a monohybrid cross Aa × Aa, what fraction of offspring will be homozygous recessive?",
    parameters: [],
    answerFormula: "1/4",
    distractors: [
      { formula: "1/2", type: "common_misconception", label: "B" },
      { formula: "3/4", type: "calculation_error", label: "C" },
      { formula: "1/8", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.3, aStd: 0.09, bMean: -0.5, bStd: 0.14, cMean: 0.25, cStd: 0.03 },
    distractorProfile: { A: 0.60, B: 0.18, C: 0.14, D: 0.08 },
    _compute: () => [
      { label: "A", text: "1/4", correct: true },
      { label: "B", text: "1/2", correct: false },
      { label: "C", text: "3/4", correct: false },
      { label: "D", text: "1/8", correct: false },
    ],
  },
  {
    id: "q28", subject: "Biology", topic: "Cell Biology", subtopic: "Organelles",
    bloomLevel: "remember",
    templateText: "Which organelle is the primary site of ATP production in eukaryotic cells?",
    parameters: [],
    answerFormula: "Mitochondria",
    distractors: [
      { formula: "Golgi apparatus", type: "common_misconception", label: "B" },
      { formula: "Endoplasmic reticulum", type: "calculation_error", label: "C" },
      { formula: "Lysosome", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.4, aStd: 0.08, bMean: -1.0, bStd: 0.12, cMean: 0.25, cStd: 0.03 },
    distractorProfile: { A: 0.72, B: 0.12, C: 0.10, D: 0.06 },
    _compute: () => [
      { label: "A", text: "Mitochondria", correct: true },
      { label: "B", text: "Golgi apparatus", correct: false },
      { label: "C", text: "Endoplasmic reticulum", correct: false },
      { label: "D", text: "Lysosome", correct: false },
    ],
  },
  {
    id: "q29", subject: "Biology", topic: "Ecology", subtopic: "Food Chain",
    bloomLevel: "understand",
    templateText: "In a food chain, if the primary producer has {{e}} kcal energy, how much energy is available at the third trophic level? (10% rule)",
    parameters: [{ name: "e", type: "float", values: [10000, 20000, 50000, 100000] }],
    answerFormula: "e * 0.01",
    distractors: [
      { formula: "e * 0.1", type: "common_misconception", label: "B" },
      { formula: "e * 0.001", type: "calculation_error", label: "C" },
      { formula: "e * 0.05", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.1, bMean: 0.1, bStd: 0.16, cMean: 0.2, cStd: 0.03 },
    distractorProfile: { A: 0.50, B: 0.22, C: 0.16, D: 0.12 },
    _compute: (e) => {
      const level3 = e * 0.01;
      return [
        { label: "A", text: `${level3} kcal`, correct: true },
        { label: "B", text: `${e * 0.1} kcal`, correct: false },
        { label: "C", text: `${e * 0.001} kcal`, correct: false },
        { label: "D", text: `${e * 0.05} kcal`, correct: false },
      ];
    },
  },
  {
    id: "q30", subject: "Biology", topic: "Human Physiology", subtopic: "Blood Groups",
    bloomLevel: "understand",
    templateText: "A person with blood group AB can receive blood from which groups (in terms of ABO system)?",
    parameters: [],
    answerFormula: "A, B, AB, O (universal recipient)",
    distractors: [
      { formula: "AB only", type: "common_misconception", label: "B" },
      { formula: "A and B only", type: "calculation_error", label: "C" },
      { formula: "O only", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.2, aStd: 0.1, bMean: -0.4, bStd: 0.15, cMean: 0.25, cStd: 0.03 },
    distractorProfile: { A: 0.58, B: 0.18, C: 0.14, D: 0.10 },
    _compute: () => [
      { label: "A", text: "A, B, AB, and O (universal recipient)", correct: true },
      { label: "B", text: "AB only", correct: false },
      { label: "C", text: "A and B only", correct: false },
      { label: "D", text: "O only", correct: false },
    ],
  },
  {
    id: "q31", subject: "Biology", topic: "Molecular Biology", subtopic: "DNA Replication",
    bloomLevel: "remember",
    templateText: "DNA replication is described as semi-conservative. In the {{n}}th generation after replication, how many DNA molecules contain only new strands?",
    parameters: [{ name: "n", type: "integer", values: [1, 2, 3, 4] }],
    answerFormula: "2^n - 2 (for n>=2), 0 (for n=1)",
    distractors: [
      { formula: "2^n", type: "common_misconception", label: "B" },
      { formula: "2^(n-1)", type: "calculation_error", label: "C" },
      { formula: "n", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.1, aStd: 0.12, bMean: 0.6, bStd: 0.2, cMean: 0.2, cStd: 0.04 },
    distractorProfile: { A: 0.42, B: 0.25, C: 0.20, D: 0.13 },
    _compute: (n) => {
      const ans = n >= 2 ? Math.pow(2, n) - 2 : 0;
      return [
        { label: "A", text: `${ans}`, correct: true },
        { label: "B", text: `${Math.pow(2, n)}`, correct: false },
        { label: "C", text: `${Math.pow(2, n - 1)}`, correct: false },
        { label: "D", text: `${n}`, correct: false },
      ];
    },
  },
  {
    id: "q32", subject: "Biology", topic: "Plant Biology", subtopic: "Photosynthesis",
    bloomLevel: "remember",
    templateText: "What is the net equation for photosynthesis? Choose the correct balanced equation.",
    parameters: [],
    answerFormula: "6CO2 + 6H2O -> C6H12O6 + 6O2",
    distractors: [
      { formula: "reversed equation", type: "common_misconception", label: "B" },
      { formula: "wrong coefficients", type: "calculation_error", label: "C" },
      { formula: "missing water", type: "unit_error", label: "D" },
    ],
    irtParams: { aMean: 1.3, aStd: 0.09, bMean: -0.7, bStd: 0.13, cMean: 0.25, cStd: 0.03 },
    distractorProfile: { A: 0.65, B: 0.15, C: 0.12, D: 0.08 },
    _compute: () => [
      { label: "A", text: "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂", correct: true },
      { label: "B", text: "C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O", correct: false },
      { label: "C", text: "3CO₂ + 3H₂O → C₃H₆O₃ + 3O₂", correct: false },
      { label: "D", text: "6CO₂ → C₆H₁₂O₆ + 6O₂", correct: false },
    ],
  },
];

// Register seed questions in db
seedQuestions.forEach((q) => {
  db.questions[q.id] = {
    id: q.id,
    subject: q.subject,
    topic: q.topic,
    subtopic: q.subtopic || "",
    bloomLevel: q.bloomLevel || "apply",
    templateText: q.templateText,
    parameters: q.parameters,
    answerFormula: q.answerFormula,
    distractors: q.distractors,
    calibrationStatus: "calibrated",
    fieldTestCount: 250 + Math.floor(Math.random() * 200),
    calibrationDate: "2025-12-15T00:00:00.000Z",
    irtParams: q.irtParams,
    distractorProfile: q.distractorProfile,
    source: "seed",
    status: "CALIBRATED",
    deleted: false,
    createdAt: "2025-12-01T10:00:00.000Z",
    updatedAt: "2025-12-15T10:00:00.000Z",
  };
});

// ─── SEED CENTERS ─────────────────────────────────────────────────────────────
const seedCenters = [
  { id: "center_delhi", name: "Delhi Examination Center", city: "New Delhi", state: "Delhi", capacity: 200, seatCount: 200, seats: 200, status: "ready" },
  { id: "center_mumbai", name: "Mumbai Examination Center", city: "Mumbai", state: "Maharashtra", capacity: 300, seatCount: 300, seats: 300, status: "ready" },
  { id: "center_bangalore", name: "Bangalore Examination Center", city: "Bangalore", state: "Karnataka", capacity: 250, seatCount: 250, seats: 250, status: "ready" },
  { id: "center_kolkata", name: "Kolkata Examination Center", city: "Kolkata", state: "West Bengal", capacity: 150, seatCount: 150, seats: 150, status: "ready" },
  { id: "center_chennai", name: "Chennai Examination Center", city: "Chennai", state: "Tamil Nadu", capacity: 200, seatCount: 200, seats: 200, status: "ready" },
];
seedCenters.forEach((c) => { db.centers[c.id] = c; });

// ─── SEED EXAM ────────────────────────────────────────────────────────────────
const DEMO_EXAM_ID = "EXAM_DEMO2026";
db.exams[DEMO_EXAM_ID] = {
  id: DEMO_EXAM_ID,
  name: "NEET Mock Examination 2026",
  date: "2026-04-15",
  subjects: ["Physics", "Chemistry", "Math", "Biology"],
  totalQuestions: 30,
  totalCandidates: 2,
  questionsPerPaper: 10,
  status: "ACTIVE",
  blueprint: {
    difficultyDist: { easy: 30, medium: 50, hard: 20 },
    topicCoverage: { Physics: 30, Chemistry: 25, Math: 25, Biology: 20 },
    questionsPerPaper: 10,
  },
  centers: [
    { centerId: "center_delhi", seatCount: 1 },
    { centerId: "center_mumbai", seatCount: 1 },
  ],
  activatedAt: "2026-04-15T09:00:00.000Z",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-04-15T09:00:00.000Z",
};

// ─── SEED CANDIDATES ─────────────────────────────────────────────────────────
const DEMO_CANDIDATES = [
  {
    id: "CAND_001",
    admitCard: "ADMIT2026001",
    name: "Priya Sharma",
    email: "priya@example.com",
    examId: DEMO_EXAM_ID,
    centerId: "center_delhi",
    seatNum: 1,
    registeredAt: "2026-03-10T10:00:00.000Z",
  },
  {
    id: "CAND_002",
    admitCard: "ADMIT2026002",
    name: "Rahul Verma",
    email: "rahul@example.com",
    examId: DEMO_EXAM_ID,
    centerId: "center_mumbai",
    seatNum: 1,
    registeredAt: "2026-03-10T11:00:00.000Z",
  },
];
DEMO_CANDIDATES.forEach((c) => { db.candidates[c.id] = c; });

// ─── SEED USERS ──────────────────────────────────────────────────────────────
const SEED_USERS = [
  { id: "user_admin", email: "admin@pariksha.dmj.one", password: "admin123", role: "SUPER_ADMIN", name: "System Admin" },
  { id: "user_controller", email: "controller@pariksha.dmj.one", password: "controller123", role: "EXAM_CONTROLLER", name: "Exam Controller" },
  { id: "user_faculty", email: "faculty@pariksha.dmj.one", password: "faculty123", role: "QUESTION_SETTER", name: "Dr. Question Setter" },
  { id: "user_candidate1", email: "priya@example.com", password: "candidate123", role: "CANDIDATE", name: "Priya Sharma", candidateId: "CAND_001", admitCard: "ADMIT2026001" },
  { id: "user_candidate2", email: "rahul@example.com", password: "candidate123", role: "CANDIDATE", name: "Rahul Verma", candidateId: "CAND_002", admitCard: "ADMIT2026002" },
];
SEED_USERS.forEach((u) => { db.users[u.email] = u; });

// ─── SEED AUDIT EVENTS ──────────────────────────────────────────────────────
addAuditEvent("exam_created", "user_admin", DEMO_EXAM_ID, { name: "NEET Mock Examination 2026" });
addAuditEvent("blueprint_set", "user_controller", DEMO_EXAM_ID, { questionsPerPaper: 10 });
addAuditEvent("exam_activated", "user_controller", DEMO_EXAM_ID, {});

// ─── GEMINI API CALL ─────────────────────────────────────────────────────────
function callGemini(subject, topic, subtopic, bloomLevel) {
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) return reject(new Error("GEMINI_API_KEY not set"));
    const prompt = `You are an expert question paper setter for competitive exams like NEET/JEE.
Generate a parameterized multiple-choice question template for:
- Subject: ${subject}
- Topic: ${topic}
${subtopic ? `- Subtopic: ${subtopic}` : ""}
- Bloom's Level: ${bloomLevel || "apply"}

Return ONLY valid JSON with this exact structure (no markdown, no backticks, no explanation):
{
  "templateText": "question text with {{param_name}} placeholders for variable numerical values",
  "parameters": [{"name": "param_name", "type": "float", "min": 1, "max": 100, "step": 1}],
  "answerFormula": "mathematical formula using param names that gives the correct answer",
  "distractors": [
    {"formula": "common wrong formula 1", "type": "common_misconception", "label": "B"},
    {"formula": "common wrong formula 2", "type": "calculation_error", "label": "C"},
    {"formula": "common wrong formula 3", "type": "unit_error", "label": "D"}
  ],
  "subject": "${subject}",
  "topic": "${topic}",
  "bloomLevel": "${bloomLevel || "apply"}"
}`;

    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`);

    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) resolve(JSON.parse(jsonMatch[0]));
          else reject(new Error("No JSON in Gemini response"));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Fallback templates when Gemini is not available
const fallbackTemplates = {
  Physics: {
    templateText: "A body of mass {{m}} kg is moving with velocity {{v}} m/s. Calculate its kinetic energy.",
    parameters: [
      { name: "m", type: "float", min: 1, max: 10, step: 1 },
      { name: "v", type: "float", min: 5, max: 30, step: 5 },
    ],
    answerFormula: "0.5 * m * v^2",
    distractors: [
      { formula: "m * v^2", type: "common_misconception", label: "B" },
      { formula: "0.5 * m * v", type: "calculation_error", label: "C" },
      { formula: "m * v", type: "unit_error", label: "D" },
    ],
  },
  Chemistry: {
    templateText: "Calculate the number of moles in {{mass}} g of H₂SO₄ (Molar mass = 98 g/mol).",
    parameters: [{ name: "mass", type: "float", min: 49, max: 490, step: 49 }],
    answerFormula: "mass / 98",
    distractors: [
      { formula: "mass * 98", type: "common_misconception", label: "B" },
      { formula: "mass / 98 + 1", type: "calculation_error", label: "C" },
      { formula: "98 / mass", type: "unit_error", label: "D" },
    ],
  },
  Math: {
    templateText: "Find the area under the curve y = {{a}}x from x = 0 to x = {{b}}.",
    parameters: [
      { name: "a", type: "integer", min: 1, max: 5, step: 1 },
      { name: "b", type: "integer", min: 2, max: 8, step: 2 },
    ],
    answerFormula: "a * b^2 / 2",
    distractors: [
      { formula: "a * b", type: "common_misconception", label: "B" },
      { formula: "a * b^2", type: "calculation_error", label: "C" },
      { formula: "a * b / 2", type: "unit_error", label: "D" },
    ],
  },
  Biology: {
    templateText: "In a population of {{N}} organisms with {{n}} showing a recessive phenotype, what is the frequency of the recessive allele (q)?",
    parameters: [
      { name: "N", type: "integer", min: 100, max: 1000, step: 100 },
      { name: "n", type: "integer", min: 10, max: 250, step: 10 },
    ],
    answerFormula: "sqrt(n/N)",
    distractors: [
      { formula: "n/N", type: "common_misconception", label: "B" },
      { formula: "sqrt(n/N) + 0.1", type: "calculation_error", label: "C" },
      { formula: "1 - sqrt(n/N)", type: "unit_error", label: "D" },
    ],
  },
};

// ─── PAPER GENERATION (O(1) hash-based) ──────────────────────────────────────
function generatePaper(examId, candidateId, count) {
  const seed = crypto.createHash("sha256").update(examId + candidateId).digest();
  const questionIds = Object.keys(db.questions).filter((id) => !db.questions[id].deleted);
  const result = [];
  for (let i = 0; i < count; i++) {
    const qIdx = seed[(i * 3) % seed.length] % questionIds.length;
    const qId = questionIds[(qIdx + i) % questionIds.length];
    const q = db.questions[qId];
    const seedQ = seedQuestions.find((sq) => sq.id === qId);

    // Pick parameter values using hash
    const paramNames = (q.parameters || []).map((p) => p.name);
    const paramVals = paramNames.map((name, j) => {
      const param = q.parameters.find((p) => p.name === name);
      const vals = param.values || [param.min || 0];
      return vals[(seed[(i * 3 + j + 1) % seed.length] || 0) % vals.length];
    });

    // Build question text
    let text = q.templateText;
    paramNames.forEach((name, j) => {
      text = text.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), paramVals[j]);
    });

    // Build options
    let options;
    if (seedQ && seedQ._compute) {
      options = seedQ._compute(...paramVals);
    } else {
      options = [
        { label: "A", text: "Option A (correct)", correct: true },
        { label: "B", text: "Option B", correct: false },
        { label: "C", text: "Option C", correct: false },
        { label: "D", text: "Option D", correct: false },
      ];
    }

    result.push({
      position: i + 1,
      templateId: qId,
      paramInstantiationId: `${qId}_inst_${i}`,
      questionText: text,
      section: q.subject,
      options,
      _correct: options.find((o) => o.correct)?.label || "A",
    });
  }
  return result;
}

// ─── TOKEN HELPERS ───────────────────────────────────────────────────────────
function createToken(payload) {
  return Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
}

function parseToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString());
  } catch {
    try {
      return JSON.parse(Buffer.from(token, "base64").toString());
    } catch {
      return null;
    }
  }
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", version: "2.0.0", service: "ParikshaSuraksha MVP API" }));
app.get("/api/v1/health", (_, res) => res.json({ status: "ok", version: "2.0.0" }));

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /auth/login — admin/controller/faculty login
app.post("/auth/login", (req, res) => {
  const { email, password, role } = req.body;
  const user = db.users[email];
  if (!user || (password && user.password !== password)) {
    // For demo, allow any login if no exact match
    const token = createToken({ sub: email || "admin", role: role || "SUPER_ADMIN", name: email || "Admin User" });
    return res.json({
      token,
      user: { id: `user_${uid()}`, email: email || "admin@pariksha.dmj.one", name: email || "Admin User", role: role || "SUPER_ADMIN" },
    });
  }
  const token = createToken({ sub: user.id, role: user.role, name: user.name, email: user.email });
  addAuditEvent("user_login", user.id, "", { role: user.role });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// POST /auth/candidate-login — candidate login with admitCard + otp
app.post("/auth/candidate-login", (req, res) => {
  const { admitCardNumber, admitCard, otp } = req.body;
  const ac = admitCardNumber || admitCard;
  if (!ac) return res.status(400).json({ error: "admitCardNumber is required" });

  // Find candidate by admit card
  const candidate = Object.values(db.candidates).find((c) => c.admitCard === ac);
  if (!candidate) {
    // Demo mode: auto-create
    const cid = `CAND_${shortUid()}`;
    db.candidates[cid] = {
      id: cid, admitCard: ac, name: "Demo Candidate", email: "demo@example.com",
      examId: DEMO_EXAM_ID, centerId: "center_delhi", seatNum: Math.floor(Math.random() * 200) + 1,
      registeredAt: now(),
    };
    const token = createToken({ sub: cid, role: "CANDIDATE", admitCard: ac, examId: DEMO_EXAM_ID, centerId: "center_delhi" });
    return res.json({
      token, candidateId: cid, examId: DEMO_EXAM_ID,
      centerId: "center_delhi", seatNum: db.candidates[cid].seatNum,
      candidateName: "Demo Candidate",
    });
  }

  const token = createToken({
    sub: candidate.id, role: "CANDIDATE", admitCard: ac,
    examId: candidate.examId, centerId: candidate.centerId,
  });
  addAuditEvent("candidate_login", candidate.id, candidate.examId, { admitCard: ac });
  res.json({
    token, candidateId: candidate.id, examId: candidate.examId,
    centerId: candidate.centerId, seatNum: candidate.seatNum,
    candidateName: candidate.name,
  });
});

// Also support at /api/v1/auth/candidate-login (candidate portal uses this path)
app.post("/api/v1/auth/candidate-login", (req, res) => {
  // Re-route to the main handler
  req.url = "/auth/candidate-login";
  app.handle(req, res);
});

// POST /auth/candidate-otp — request OTP
app.post("/auth/candidate-otp", (req, res) => {
  const { admitCard, admitCardNumber } = req.body;
  const ac = admitCard || admitCardNumber;
  if (!ac) return res.status(400).json({ error: "admitCard required" });
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  db.otpStore[ac] = otp;
  console.log(`[OTP] ${ac} -> ${otp}`);
  res.json({ sent: true, otp_sent: true, message: `OTP sent (demo: ${otp})` });
});

app.post("/api/v1/auth/candidate-otp", (req, res) => {
  req.url = "/auth/candidate-otp";
  app.handle(req, res);
});

// POST /auth/verify-mfa — verify MFA code
app.post("/auth/verify-mfa", (req, res) => {
  const { token, code } = req.body;
  // For demo, always verify
  res.json({ verified: true, message: "MFA verified" });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  QUESTION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/questions — list with filtering and pagination
app.get("/api/v1/questions", (req, res) => {
  const { subject, topic, bloomLevel, calibrationStatus, status, search, page = 1, pageSize = 50 } = req.query;
  let items = Object.values(db.questions).filter((q) => !q.deleted);

  if (subject) items = items.filter((q) => q.subject === subject);
  if (topic) items = items.filter((q) => q.topic === topic);
  if (bloomLevel) items = items.filter((q) => q.bloomLevel === bloomLevel);
  if (calibrationStatus) items = items.filter((q) => q.calibrationStatus === calibrationStatus);
  if (status) items = items.filter((q) => q.status === status);
  if (search) {
    const s = search.toLowerCase();
    items = items.filter((q) =>
      (q.templateText || "").toLowerCase().includes(s) ||
      (q.subject || "").toLowerCase().includes(s) ||
      (q.topic || "").toLowerCase().includes(s)
    );
  }

  const total = items.length;
  const pg = parseInt(page) || 1;
  const ps = parseInt(pageSize) || 50;
  const totalPages = Math.ceil(total / ps);
  const sliced = items.slice((pg - 1) * ps, pg * ps);

  res.json({ items: sliced, total, page: pg, pageSize: ps, totalPages });
});

// GET /api/v1/questions/:id
app.get("/api/v1/questions/:id", (req, res) => {
  const q = db.questions[req.params.id];
  if (!q || q.deleted) return res.status(404).json({ error: "Question not found" });
  res.json(q);
});

// POST /api/v1/questions — create question manually
app.post("/api/v1/questions", (req, res) => {
  const id = `q_${uid()}`;
  const question = {
    id,
    subject: req.body.subject || "General",
    topic: req.body.topic || "General",
    subtopic: req.body.subtopic || "",
    bloomLevel: req.body.bloomLevel || "apply",
    templateText: req.body.templateText || req.body.text || "",
    parameters: req.body.parameters || [],
    answerFormula: req.body.answerFormula || "",
    distractors: req.body.distractors || [],
    calibrationStatus: "pending",
    fieldTestCount: 0,
    irtParams: null,
    distractorProfile: null,
    source: "manual",
    status: "CREATED",
    deleted: false,
    createdAt: now(),
    updatedAt: now(),
    ...req.body,
    id,
  };
  db.questions[id] = question;
  addAuditEvent("question_created", parseToken(req)?.sub || "unknown", "", { questionId: id });
  res.status(201).json(question);
});

// PUT /api/v1/questions/:id — update question
app.put("/api/v1/questions/:id", (req, res) => {
  const q = db.questions[req.params.id];
  if (!q || q.deleted) return res.status(404).json({ error: "Question not found" });
  Object.assign(q, req.body, { id: req.params.id, updatedAt: now() });
  res.json(q);
});

// DELETE /api/v1/questions/:id — soft delete
app.delete("/api/v1/questions/:id", (req, res) => {
  const q = db.questions[req.params.id];
  if (!q) return res.status(404).json({ error: "Question not found" });
  q.deleted = true;
  q.updatedAt = now();
  res.status(204).send();
});

// POST /api/v1/questions/generate — AI generation
app.post("/api/v1/questions/generate", async (req, res) => {
  const { subject, topic, subtopic, bloomLevel } = req.body;
  if (!subject || !topic) return res.status(400).json({ error: "subject and topic are required" });

  try {
    let template;
    try {
      template = await callGemini(subject, topic, subtopic, bloomLevel);
    } catch (geminiErr) {
      // Fallback to pre-generated template
      console.log(`[Gemini fallback] ${geminiErr.message}`);
      const fb = fallbackTemplates[subject] || fallbackTemplates.Physics;
      template = { ...fb, subject, topic, subtopic: subtopic || "", bloomLevel: bloomLevel || "apply" };
    }

    const id = `genq_${uid()}`;
    const question = {
      id,
      subject: template.subject || subject,
      topic: template.topic || topic,
      subtopic: template.subtopic || subtopic || "",
      bloomLevel: template.bloomLevel || bloomLevel || "apply",
      templateText: template.templateText || template.text || "",
      parameters: template.parameters || [],
      answerFormula: template.answerFormula || "",
      distractors: template.distractors || [],
      calibrationStatus: "pending",
      fieldTestCount: 0,
      irtParams: null,
      distractorProfile: null,
      source: "gemini",
      status: "GENERATED",
      deleted: false,
      createdAt: now(),
      updatedAt: now(),
    };
    db.questions[id] = question;
    addAuditEvent("question_generated", parseToken(req)?.sub || "system", "", { questionId: id, source: GEMINI_API_KEY ? "gemini" : "fallback" });
    res.json(question);
  } catch (e) {
    res.status(500).json({ error: "Generation failed: " + e.message });
  }
});

// POST /api/v1/questions/:id/approve
app.post("/api/v1/questions/:id/approve", (req, res) => {
  const q = db.questions[req.params.id];
  if (!q || q.deleted) return res.status(404).json({ error: "Question not found" });
  q.status = "CALIBRATED";
  q.calibrationStatus = "calibrated";
  q.approvedAt = now();
  q.updatedAt = now();
  // Assign simulated IRT params if missing
  if (!q.irtParams) {
    q.irtParams = {
      aMean: 0.8 + Math.random() * 0.8,
      aStd: 0.08 + Math.random() * 0.08,
      bMean: -1 + Math.random() * 2,
      bStd: 0.1 + Math.random() * 0.15,
      cMean: 0.15 + Math.random() * 0.1,
      cStd: 0.02 + Math.random() * 0.04,
    };
  }
  addAuditEvent("question_approved", parseToken(req)?.sub || "unknown", "", { questionId: req.params.id });
  res.json(q);
});

// POST /api/v1/questions/:id/field-test
app.post("/api/v1/questions/:id/field-test", (req, res) => {
  const q = db.questions[req.params.id];
  if (!q || q.deleted) return res.status(404).json({ error: "Question not found" });
  q.calibrationStatus = "field_testing";
  q.fieldTestCount = (q.fieldTestCount || 0) + (req.body.responseCount || 200);
  q.updatedAt = now();

  // Simulate IRT calibration result
  const jobId = `cal_${uid()}`;
  setTimeout(() => {
    q.calibrationStatus = "calibrated";
    q.irtParams = {
      aMean: 0.8 + Math.random() * 0.8,
      aStd: 0.08 + Math.random() * 0.08,
      bMean: -1 + Math.random() * 2,
      bStd: 0.1 + Math.random() * 0.15,
      cMean: 0.15 + Math.random() * 0.1,
      cStd: 0.02 + Math.random() * 0.04,
    };
    q.distractorProfile = { A: 0.5, B: 0.2, C: 0.18, D: 0.12 };
    q.calibrationDate = now();
    q.status = "CALIBRATED";
    q.updatedAt = now();
  }, 3000);

  addAuditEvent("field_test_started", parseToken(req)?.sub || "unknown", "", { questionId: req.params.id, jobId });
  res.json({ jobId, status: "calibrating", message: "Field test data received. IRT calibration in progress." });
});

// GET /api/v1/questions/:id/calibration
app.get("/api/v1/questions/:id/calibration", (req, res) => {
  const q = db.questions[req.params.id];
  if (!q || q.deleted) return res.status(404).json({ error: "Question not found" });
  res.json({
    status: q.calibrationStatus || "pending",
    irtParams: q.irtParams || null,
    isomorphicEquivalence: q.calibrationStatus === "calibrated",
    distractorProfile: q.distractorProfile || { A: 0.5, B: 0.2, C: 0.18, D: 0.12 },
    confidenceIntervals: {
      a: [q.irtParams ? q.irtParams.aMean - 1.96 * q.irtParams.aStd : 0.5, q.irtParams ? q.irtParams.aMean + 1.96 * q.irtParams.aStd : 2.0],
      b: [q.irtParams ? q.irtParams.bMean - 1.96 * q.irtParams.bStd : -2.0, q.irtParams ? q.irtParams.bMean + 1.96 * q.irtParams.bStd : 2.0],
      c: [q.irtParams ? q.irtParams.cMean - 1.96 * q.irtParams.cStd : 0.1, q.irtParams ? q.irtParams.cMean + 1.96 * q.irtParams.cStd : 0.35],
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EXAM ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/exams — create exam
app.post("/api/v1/exams", (req, res) => {
  const id = "EXAM_" + shortUid();
  const exam = {
    id,
    name: req.body.name || "New Exam",
    date: req.body.date || now().split("T")[0],
    subjects: req.body.subjects || ["Physics", "Chemistry", "Math", "Biology"],
    totalQuestions: req.body.totalQuestions || 30,
    totalCandidates: req.body.totalCandidates || 0,
    questionsPerPaper: req.body.questionsPerPaper || 10,
    status: "draft",
    blueprint: null,
    centers: req.body.centers || [],
    createdAt: now(),
    updatedAt: now(),
  };
  db.exams[id] = exam;
  addAuditEvent("exam_created", parseToken(req)?.sub || "unknown", id, { name: exam.name });
  res.status(201).json(exam);
});

// GET /api/v1/exams — list exams
app.get("/api/v1/exams", (_, res) => {
  res.json(Object.values(db.exams));
});

// GET /api/v1/exams/:id
app.get("/api/v1/exams/:id", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  res.json(exam);
});

// PUT /api/v1/exams/:id
app.put("/api/v1/exams/:id", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  Object.assign(exam, req.body, { id: req.params.id, updatedAt: now() });
  res.json(exam);
});

// POST /api/v1/exams/:id/blueprint
app.post("/api/v1/exams/:id/blueprint", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  exam.blueprint = req.body;
  exam.questionsPerPaper = req.body.questionsPerPaper || exam.questionsPerPaper;
  exam.status = "blueprint_set";
  exam.updatedAt = now();
  addAuditEvent("blueprint_set", parseToken(req)?.sub || "unknown", req.params.id, req.body);
  res.json(exam);
});

// POST /api/v1/exams/:id/matrix — trigger matrix generation
app.post("/api/v1/exams/:id/matrix", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const jobId = `matrix_${uid()}`;
  const totalPapers = exam.totalCandidates || 100;
  db.matrixJobs[req.params.id] = {
    status: "running",
    progress: 0,
    totalPapers,
    generatedPapers: 0,
    startedAt: now(),
    completedAt: null,
    error: null,
  };
  exam.status = "MATRIX_GENERATING";
  exam.updatedAt = now();

  // Simulate progress over 30 seconds
  let prog = 0;
  const interval = setInterval(() => {
    prog += 10 + Math.floor(Math.random() * 10);
    if (prog >= 100) prog = 100;
    const job = db.matrixJobs[req.params.id];
    if (job) {
      job.progress = prog;
      job.generatedPapers = Math.floor((prog / 100) * totalPapers);
      if (prog >= 100) {
        job.status = "completed";
        job.completedAt = now();
        exam.status = "MATRIX_COMPLETE";
        exam.updatedAt = now();
        addAuditEvent("matrix_complete", "system", req.params.id, { totalPapers });
        clearInterval(interval);
      }
    } else {
      clearInterval(interval);
    }
  }, 3000);

  addAuditEvent("matrix_generation_started", parseToken(req)?.sub || "unknown", req.params.id, { jobId });
  res.json({ jobId, status: "started", message: "Assignment matrix generation started" });
});

// GET /api/v1/exams/:id/matrix/status
app.get("/api/v1/exams/:id/matrix/status", (req, res) => {
  const job = db.matrixJobs[req.params.id];
  if (!job) {
    // If exam exists and is beyond matrix stage, return completed
    const exam = db.exams[req.params.id];
    if (exam && ["MATRIX_COMPLETE", "ENCRYPTING", "ENCRYPTED", "DISTRIBUTED", "ACTIVE", "COMPLETED", "COLLUSION_CHECK", "EQUATING", "RESULTS_PUBLISHED"].includes(exam.status)) {
      return res.json({ status: "completed", progress: 100, totalPapers: exam.totalCandidates || 100, generatedPapers: exam.totalCandidates || 100, completedAt: exam.updatedAt });
    }
    return res.json({ status: "idle", progress: 0, totalPapers: 0, generatedPapers: 0 });
  }
  res.json(job);
});

// POST /api/v1/exams/:id/encrypt — trigger encryption workflow
app.post("/api/v1/exams/:id/encrypt", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const jobId = `enc_${uid()}`;
  const totalQ = exam.totalQuestions || 30;
  const centers = exam.centers || [{ centerId: "center_delhi", seatCount: 50 }, { centerId: "center_mumbai", seatCount: 50 }];

  db.encryptionJobs[req.params.id] = {
    step: "encrypting",
    progress: 0,
    totalQuestions: totalQ,
    encryptedQuestions: 0,
    tlpPuzzlesGenerated: 0,
    shamirFragments: [
      { holder: "Exam Controller", role: "EXAM_CONTROLLER", distributed: false },
      { holder: "Chief Invigilator - Delhi", role: "CENTER_HEAD", distributed: false },
      { holder: "Chief Invigilator - Mumbai", role: "CENTER_HEAD", distributed: false },
      { holder: "NTA Representative", role: "REGULATOR", distributed: false },
      { holder: "Security Auditor", role: "AUDITOR", distributed: false },
    ],
    centerDistribution: centers.map((c) => ({
      centerId: c.centerId,
      centerName: (db.centers[c.centerId] || {}).name || c.centerId,
      status: "pending",
      txHash: null,
    })),
    blockchainTxHashes: [],
  };
  exam.status = "ENCRYPTING";
  exam.updatedAt = now();

  // Simulate encryption steps
  const steps = ["encrypting", "tlp_generating", "shamir_splitting", "distributing", "completed"];
  let stepIdx = 0;

  const interval = setInterval(() => {
    stepIdx++;
    const job = db.encryptionJobs[req.params.id];
    if (!job || stepIdx >= steps.length) {
      if (job) {
        job.step = "completed";
        job.progress = 100;
        job.encryptedQuestions = totalQ;
        job.tlpPuzzlesGenerated = totalQ;
        job.shamirFragments.forEach((f) => (f.distributed = true));
        job.centerDistribution.forEach((c) => {
          c.status = "delivered";
          c.txHash = `0x${crypto.randomBytes(32).toString("hex")}`;
        });
        job.blockchainTxHashes = [
          `0x${crypto.randomBytes(32).toString("hex")}`,
          `0x${crypto.randomBytes(32).toString("hex")}`,
        ];
        exam.status = "ENCRYPTED";
        exam.updatedAt = now();
        addAuditEvent("encryption_complete", "system", req.params.id, {});
      }
      clearInterval(interval);
      return;
    }
    job.step = steps[stepIdx];
    job.progress = Math.round((stepIdx / (steps.length - 1)) * 100);
    if (stepIdx >= 1) job.encryptedQuestions = totalQ;
    if (stepIdx >= 2) job.tlpPuzzlesGenerated = totalQ;
    if (stepIdx >= 3) {
      job.shamirFragments.forEach((f) => (f.distributed = true));
      job.centerDistribution.forEach((c) => {
        c.status = "delivered";
        c.txHash = `0x${crypto.randomBytes(32).toString("hex")}`;
      });
    }
  }, 4000);

  addAuditEvent("encryption_started", parseToken(req)?.sub || "unknown", req.params.id, { jobId });
  res.json({ jobId, status: "started", message: "Encryption workflow started" });
});

// GET /api/v1/exams/:id/keys/status
app.get("/api/v1/exams/:id/keys/status", (req, res) => {
  const job = db.encryptionJobs[req.params.id];
  if (!job) {
    const exam = db.exams[req.params.id];
    if (exam && ["ENCRYPTED", "DISTRIBUTED", "ACTIVE", "COMPLETED", "COLLUSION_CHECK", "EQUATING", "RESULTS_PUBLISHED"].includes(exam.status)) {
      return res.json({
        step: "completed", progress: 100, totalQuestions: exam.totalQuestions || 30,
        encryptedQuestions: exam.totalQuestions || 30, tlpPuzzlesGenerated: exam.totalQuestions || 30,
        shamirFragments: [
          { holder: "Exam Controller", role: "EXAM_CONTROLLER", distributed: true },
          { holder: "Chief Invigilator", role: "CENTER_HEAD", distributed: true },
          { holder: "NTA Representative", role: "REGULATOR", distributed: true },
        ],
        centerDistribution: (exam.centers || []).map((c) => ({
          centerId: c.centerId,
          centerName: (db.centers[c.centerId] || {}).name || c.centerId,
          status: "delivered",
          txHash: `0x${sha256(c.centerId + exam.id)}`,
        })),
        blockchainTxHashes: [`0x${sha256(exam.id + "enc")}`],
      });
    }
    return res.json({ step: "idle", progress: 0, totalQuestions: 0, encryptedQuestions: 0, tlpPuzzlesGenerated: 0, shamirFragments: [], centerDistribution: [], blockchainTxHashes: [] });
  }
  res.json(job);
});

// POST /api/v1/exams/:id/activate — activate exam (release keys)
app.post("/api/v1/exams/:id/activate", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  exam.status = "ACTIVE";
  exam.activatedAt = now();
  exam.updatedAt = now();
  addAuditEvent("exam_activated", parseToken(req)?.sub || "unknown", req.params.id, { keyReleased: true });
  res.json(exam);
});

// GET /api/v1/exams/:id/monitor — real-time monitoring
app.get("/api/v1/exams/:id/monitor", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const examCandidates = Object.values(db.candidates).filter((c) => c.examId === req.params.id);
  const examSessions = Object.values(db.sessions).filter((s) => s.examId === req.params.id);
  const examSubmissions = Object.values(db.submissions).filter((s) => s.examId === req.params.id);

  const centerMap = {};
  (exam.centers || []).forEach((c) => {
    const center = db.centers[c.centerId] || {};
    const centerCandidates = examCandidates.filter((cd) => cd.centerId === c.centerId);
    const centerSessions = examSessions.filter((s) => centerCandidates.some((cd) => cd.id === s.candidateId));
    const centerSubmissions = examSubmissions.filter((s) => centerCandidates.some((cd) => cd.id === s.candidateId));
    centerMap[c.centerId] = {
      centerId: c.centerId,
      centerName: center.name || c.centerId,
      status: exam.status === "ACTIVE" ? "active" : "ready",
      candidatesLoggedIn: centerSessions.length,
      totalSeats: c.seatCount || center.seatCount || 50,
      papersDelivered: centerSessions.length,
      responsesSubmitted: centerSubmissions.length,
      lastHeartbeat: now(),
    };
  });

  // Add default centers if none defined
  if (Object.keys(centerMap).length === 0) {
    seedCenters.slice(0, 2).forEach((c) => {
      centerMap[c.id] = {
        centerId: c.id, centerName: c.name, status: "active",
        candidatesLoggedIn: Math.floor(Math.random() * 50),
        totalSeats: c.seatCount, papersDelivered: Math.floor(Math.random() * 50),
        responsesSubmitted: Math.floor(Math.random() * 30), lastHeartbeat: now(),
      };
    });
  }

  const centers = Object.values(centerMap);
  const totalLoggedIn = centers.reduce((s, c) => s + c.candidatesLoggedIn, 0);
  const totalSubmitted = centers.reduce((s, c) => s + c.responsesSubmitted, 0);

  res.json({
    examId: req.params.id,
    examStatus: exam.status,
    keyReleaseTime: exam.activatedAt || now(),
    currentTime: now(),
    centers,
    metrics: {
      avgPaperLatency: Math.round(50 + Math.random() * 200),
      systemLoad: +(20 + Math.random() * 40).toFixed(1),
      activeConnections: totalLoggedIn,
      responsesSubmitted: totalSubmitted,
      totalCandidates: exam.totalCandidates || examCandidates.length,
    },
    alerts: [
      {
        id: `alert_${uid()}`, type: "info",
        message: `Exam ${exam.status === "ACTIVE" ? "is in progress" : "status: " + exam.status}`,
        timestamp: now(), acknowledged: false,
      },
    ],
  });
});

// POST /api/v1/exams/:id/collusion/run — trigger collusion detection
app.post("/api/v1/exams/:id/collusion/run", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const jobId = `col_${uid()}`;
  const examCenters = exam.centers || [{ centerId: "center_delhi" }, { centerId: "center_mumbai" }];

  db.collusionResults[req.params.id] = {
    status: "running",
    progress: 0,
    centersAnalyzed: 0,
    totalCenters: examCenters.length,
    results: [],
    rings: [],
  };
  exam.status = "COLLUSION_CHECK";
  exam.updatedAt = now();

  // Simulate analysis over time
  setTimeout(() => {
    const colData = db.collusionResults[req.params.id];
    if (!colData) return;

    const flaggedPairs = [
      {
        id: `col_pair_${uid()}`,
        candidateU: "CAND_SUS_001",
        candidateV: "CAND_SUS_002",
        logLambda: 14.7,
        threshold: 10.0,
        flagged: true,
        centerId: examCenters[0]?.centerId || "center_delhi",
        centerName: (db.centers[examCenters[0]?.centerId] || {}).name || "Delhi Center",
        severity: "high",
        evidence: {
          matchingWrongAnswers: [
            { questionId: "q3_inst_2", answer: "C", probability: 0.04 },
            { questionId: "q7_inst_5", answer: "B", probability: 0.06 },
            { questionId: "q19_inst_1", answer: "D", probability: 0.03 },
            { questionId: "q12_inst_3", answer: "C", probability: 0.05 },
            { questionId: "q24_inst_7", answer: "B", probability: 0.04 },
          ],
          seatingDistance: 1,
          seatU: "A-12",
          seatV: "A-13",
          statisticalSignificance: 0.9997,
          pdfReportUrl: null,
        },
      },
      {
        id: `col_pair_${uid()}`,
        candidateU: "CAND_SUS_003",
        candidateV: "CAND_SUS_004",
        logLambda: 11.2,
        threshold: 10.0,
        flagged: true,
        centerId: examCenters[0]?.centerId || "center_delhi",
        centerName: (db.centers[examCenters[0]?.centerId] || {}).name || "Delhi Center",
        severity: "medium",
        evidence: {
          matchingWrongAnswers: [
            { questionId: "q1_inst_4", answer: "D", probability: 0.08 },
            { questionId: "q15_inst_2", answer: "C", probability: 0.07 },
            { questionId: "q28_inst_6", answer: "B", probability: 0.09 },
          ],
          seatingDistance: 2,
          seatU: "B-05",
          seatV: "B-07",
          statisticalSignificance: 0.9823,
          pdfReportUrl: null,
        },
      },
      {
        id: `col_pair_${uid()}`,
        candidateU: "CAND_SUS_005",
        candidateV: "CAND_SUS_006",
        logLambda: 8.4,
        threshold: 10.0,
        flagged: false,
        centerId: examCenters.length > 1 ? examCenters[1].centerId : "center_mumbai",
        centerName: (db.centers[examCenters.length > 1 ? examCenters[1].centerId : "center_mumbai"] || {}).name || "Mumbai Center",
        severity: "low",
        evidence: {
          matchingWrongAnswers: [
            { questionId: "q9_inst_1", answer: "C", probability: 0.12 },
            { questionId: "q21_inst_3", answer: "B", probability: 0.15 },
          ],
          seatingDistance: 5,
          seatU: "C-01",
          seatV: "C-06",
          statisticalSignificance: 0.8912,
          pdfReportUrl: null,
        },
      },
    ];

    colData.status = "completed";
    colData.progress = 100;
    colData.centersAnalyzed = examCenters.length;
    colData.results = flaggedPairs;
    colData.rings = [
      { id: `ring_${uid()}`, members: ["CAND_SUS_001", "CAND_SUS_002", "CAND_SUS_003"], avgLogLambda: 12.95 },
    ];

    addAuditEvent("collusion_detection_complete", "system", req.params.id, {
      flaggedPairs: flaggedPairs.filter((p) => p.flagged).length,
      totalPairsAnalyzed: flaggedPairs.length,
    });
  }, 5000);

  addAuditEvent("collusion_detection_started", parseToken(req)?.sub || "unknown", req.params.id, { jobId });
  res.json({ jobId, status: "started", message: "Collusion detection analysis started" });
});

// GET /api/v1/exams/:id/collusion/results
app.get("/api/v1/exams/:id/collusion/results", (req, res) => {
  const colData = db.collusionResults[req.params.id];
  if (!colData) {
    return res.json({ status: "idle", progress: 0, centersAnalyzed: 0, totalCenters: 0, results: [], rings: [] });
  }
  res.json(colData);
});

// POST /api/v1/exams/:id/equate — trigger score equating
app.post("/api/v1/exams/:id/equate", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const jobId = `eq_${uid()}`;
  exam.status = "EQUATING";
  exam.updatedAt = now();
  db.equatingJobs[req.params.id] = { status: "running", startedAt: now() };

  setTimeout(() => {
    const eqJob = db.equatingJobs[req.params.id];
    if (eqJob) {
      eqJob.status = "completed";
      eqJob.completedAt = now();
    }
    // Apply equating to submissions
    Object.values(db.submissions).forEach((sub) => {
      if (sub.examId === req.params.id) {
        sub.equatedScore = sub.score + (Math.random() > 0.5 ? 1 : -1) * Math.round(Math.random() * 2);
        sub.equatedScore = Math.max(0, Math.min(sub.total, sub.equatedScore));
        sub.equatingApplied = true;
      }
    });
    addAuditEvent("equating_complete", "system", req.params.id, {});
  }, 4000);

  addAuditEvent("equating_started", parseToken(req)?.sub || "unknown", req.params.id, { jobId });
  res.json({ jobId, status: "started", message: "Score equating started" });
});

// GET /api/v1/exams/:id/results — score distribution
app.get("/api/v1/exams/:id/results", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const subs = Object.values(db.submissions).filter((s) => s.examId === req.params.id);

  // Generate simulated score distribution if no real submissions
  let scoreDistribution;
  let mean, median, stdDev;

  if (subs.length > 0) {
    const scores = subs.map((s) => s.equatedScore || s.score);
    mean = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const sorted = [...scores].sort((a, b) => a - b);
    median = sorted[Math.floor(sorted.length / 2)];
    stdDev = +Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length).toFixed(2);

    const bins = {};
    scores.forEach((s) => {
      const pct = Math.floor((s / (exam.questionsPerPaper || 10)) * 100);
      const binLabel = `${Math.floor(pct / 10) * 10}-${Math.floor(pct / 10) * 10 + 9}%`;
      bins[binLabel] = (bins[binLabel] || 0) + 1;
    });
    scoreDistribution = Object.entries(bins).map(([bin, count]) => ({ bin, count }));
  } else {
    // Simulated
    scoreDistribution = [
      { bin: "0-9%", count: 5 },
      { bin: "10-19%", count: 12 },
      { bin: "20-29%", count: 28 },
      { bin: "30-39%", count: 45 },
      { bin: "40-49%", count: 67 },
      { bin: "50-59%", count: 82 },
      { bin: "60-69%", count: 58 },
      { bin: "70-79%", count: 35 },
      { bin: "80-89%", count: 18 },
      { bin: "90-100%", count: 8 },
    ];
    mean = 52.3;
    median = 54;
    stdDev = 18.7;
  }

  res.json({
    examId: req.params.id,
    totalCandidates: subs.length || exam.totalCandidates || 358,
    scoreDistribution,
    mean,
    median,
    stdDev,
    ksTestResult: {
      statistic: 0.023,
      pValue: 0.87,
      papersDiffer: false,
    },
    equatingApplied: subs.some((s) => s.equatingApplied) || false,
    published: exam.status === "RESULTS_PUBLISHED",
  });
});

// POST /api/v1/exams/:id/results/publish
app.post("/api/v1/exams/:id/results/publish", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  exam.status = "RESULTS_PUBLISHED";
  exam.updatedAt = now();
  addAuditEvent("results_published", parseToken(req)?.sub || "unknown", req.params.id, {});
  res.status(204).send();
});

// GET /api/v1/exams/:id/results/search?q=
app.get("/api/v1/exams/:id/results/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const subs = Object.values(db.submissions).filter((s) => s.examId === req.params.id);

  const results = subs.map((s) => {
    const candidate = db.candidates[s.candidateId] || {};
    return {
      candidateId: s.candidateId,
      candidateName: candidate.name || s.candidateId,
      rawScore: s.score,
      equatedScore: s.equatedScore || s.score,
      centerId: candidate.centerId || "unknown",
      paperVariant: sha256(req.params.id + s.candidateId).substring(0, 8),
    };
  }).filter((r) =>
    r.candidateId.toLowerCase().includes(q) ||
    r.candidateName.toLowerCase().includes(q)
  );

  res.json(results);
});

// GET /api/v1/exams/:id/results/me — candidate's own result
app.get("/api/v1/exams/:id/results/me", (req, res) => {
  const tokenData = parseToken(req);
  if (!tokenData) return res.status(401).json({ error: "Not authenticated" });

  const candidateId = tokenData.sub || tokenData.candidateId;
  const sub = Object.values(db.submissions).find((s) => s.examId === req.params.id && s.candidateId === candidateId);
  const candidate = db.candidates[candidateId] || {};
  const exam = db.exams[req.params.id] || {};
  const allSubs = Object.values(db.submissions).filter((s) => s.examId === req.params.id);

  if (!sub) {
    // Return a simulated result for demo
    return res.json({
      candidateId,
      candidateName: candidate.name || "Candidate",
      examId: req.params.id,
      examName: exam.name || "Exam",
      rawScore: 7,
      equatedScore: 7,
      equatingApplied: false,
      rank: 1,
      totalCandidates: allSubs.length || 2,
      verificationHash: sha256(req.params.id + candidateId + "result"),
      gradedAt: now(),
    });
  }

  // Compute rank
  const sorted = allSubs.map((s) => s.equatedScore || s.score).sort((a, b) => b - a);
  const myScore = sub.equatedScore || sub.score;
  const rank = sorted.indexOf(myScore) + 1;

  res.json({
    candidateId,
    candidateName: candidate.name || candidateId,
    examId: req.params.id,
    examName: exam.name || "Exam",
    rawScore: sub.score,
    equatedScore: sub.equatedScore || sub.score,
    equatingApplied: sub.equatingApplied || false,
    rank,
    totalCandidates: allSubs.length,
    verificationHash: sub.hash,
    gradedAt: sub.submittedAt,
  });
});

// GET /api/v1/exams/:id/results/me/scorecard — download scorecard (returns JSON for demo)
app.get("/api/v1/exams/:id/results/me/scorecard", (req, res) => {
  const tokenData = parseToken(req);
  const candidateId = tokenData?.sub || "unknown";
  const candidate = db.candidates[candidateId] || {};
  const exam = db.exams[req.params.id] || {};

  // Return a simple text-based scorecard
  const scorecard = `
PARIKSHA SURAKSHA - OFFICIAL SCORECARD
========================================
Exam: ${exam.name || req.params.id}
Date: ${exam.date || "N/A"}
Candidate: ${candidate.name || candidateId}
Admit Card: ${candidate.admitCard || "N/A"}
Center: ${candidate.centerId || "N/A"}

Score: 7 / 10
Equated Score: 7
Rank: 1

Verification Hash: ${sha256(req.params.id + candidateId)}
========================================
This scorecard can be verified at pariksha.dmj.one/verify
  `.trim();

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", `attachment; filename=scorecard_${req.params.id}.txt`);
  res.send(scorecard);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CANDIDATE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/exams/:id/candidates — register candidate
app.post("/api/v1/exams/:id/candidates", (req, res) => {
  const exam = db.exams[req.params.id];
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const cid = req.body.id || req.body.admitCard || `CAND_${shortUid()}`;
  db.candidates[cid] = {
    id: cid,
    admitCard: req.body.admitCard || cid,
    name: req.body.name || "Candidate",
    email: req.body.email || "",
    examId: req.params.id,
    centerId: req.body.centerId || "center_delhi",
    seatNum: req.body.seatNum || Math.floor(Math.random() * 200) + 1,
    registeredAt: now(),
    ...req.body,
  };
  exam.totalCandidates = Object.values(db.candidates).filter((c) => c.examId === req.params.id).length;
  exam.updatedAt = now();
  addAuditEvent("candidate_registered", parseToken(req)?.sub || "unknown", req.params.id, { candidateId: cid });
  res.status(201).json(db.candidates[cid]);
});

// GET /api/v1/exams/:id/candidates
app.get("/api/v1/exams/:id/candidates", (req, res) => {
  const candidates = Object.values(db.candidates).filter((c) => c.examId === req.params.id);
  res.json(candidates);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CENTER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/centers
app.get("/api/v1/centers", (_, res) => {
  res.json(Object.values(db.centers));
});

// POST /api/v1/centers
app.post("/api/v1/centers", (req, res) => {
  const id = req.body.id || `center_${uid()}`;
  db.centers[id] = {
    id,
    name: req.body.name || "New Center",
    city: req.body.city || "",
    state: req.body.state || "",
    capacity: req.body.capacity || req.body.seatCount || 100,
    seatCount: req.body.seatCount || req.body.capacity || 100,
    seats: req.body.seats || req.body.seatCount || 100,
    status: req.body.status || "ready",
  };
  res.status(201).json(db.centers[id]);
});

// GET /api/v1/centers/:id
app.get("/api/v1/centers/:id", (req, res) => {
  const center = db.centers[req.params.id];
  if (!center) return res.status(404).json({ error: "Center not found" });
  res.json(center);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EXAM SESSION ENDPOINTS (candidate takes exam)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/exam-session/start
app.post("/api/v1/exam-session/start", (req, res) => {
  const tokenData = parseToken(req);
  let candidateId = req.body.candidateId;
  let examId = req.body.examId;

  // If token has candidate info, use it
  if (tokenData) {
    candidateId = candidateId || tokenData.sub || tokenData.candidateId;
    examId = examId || tokenData.examId;
  }

  // Default to demo exam if not specified
  if (!examId) examId = DEMO_EXAM_ID;
  if (!candidateId) candidateId = tokenData?.sub || `CAND_${shortUid()}`;

  const exam = db.exams[examId];
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (exam.status !== "ACTIVE") {
    return res.status(400).json({ error: `Exam not active (current status: ${exam.status}). POST /api/v1/exams/${examId}/activate first.` });
  }

  const candidate = db.candidates[candidateId] || {};
  const questions = generatePaper(examId, candidateId, exam.questionsPerPaper || 10);
  const sid = "SESS_" + shortUid();

  // Store with correct answers for grading
  db.sessions[sid] = {
    sessionId: sid,
    examId,
    candidateId,
    questions,
    startedAt: now(),
    status: "active",
  };

  // Return questions without correct answer flags
  const safeQuestions = questions.map((q) => ({
    position: q.position,
    templateId: q.templateId,
    paramInstantiationId: q.paramInstantiationId,
    questionText: q.questionText,
    section: q.section,
    options: q.options.map(({ correct, ...rest }) => rest),
  }));

  const sections = [...new Set(questions.map((q) => q.section))];

  addAuditEvent("exam_session_started", candidateId, examId, { sessionId: sid });

  res.json({
    sessionId: sid,
    examId,
    examName: exam.name,
    candidateId,
    candidateName: candidate.name || "Candidate",
    questions: safeQuestions,
    sections,
    durationSeconds: 3600,
    durationMinutes: 60,
    totalQuestions: safeQuestions.length,
    startedAt: db.sessions[sid].startedAt,
    allowCalculator: false,
    languages: ["English", "Hindi"],
  });
});

// POST /api/v1/exam-session/verify-seat
app.post("/api/v1/exam-session/verify-seat", (req, res) => {
  const { centerId, seatNum } = req.body;
  const tokenData = parseToken(req);
  const candidateId = tokenData?.sub;

  if (!centerId || seatNum === undefined) {
    return res.status(400).json({ verified: false, message: "centerId and seatNum required" });
  }

  const candidate = candidateId ? db.candidates[candidateId] : null;
  if (candidate && candidate.centerId === centerId && candidate.seatNum === seatNum) {
    return res.json({ verified: true, message: "Seat verified successfully" });
  }

  // For demo, accept any valid center
  if (db.centers[centerId]) {
    return res.json({ verified: true, message: "Seat verified (demo mode)" });
  }

  res.json({ verified: false, message: "Seat verification failed. Check center and seat assignment." });
});

// POST /api/v1/exam-session/checkpoint
app.post("/api/v1/exam-session/checkpoint", (req, res) => {
  const { sessionId, responses, currentQuestionPosition, elapsedMs } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  db.checkpoints[sessionId] = {
    sessionId,
    responses,
    currentQuestionPosition,
    elapsedMs,
    savedAt: now(),
  };

  res.json({ saved: true, savedAt: now() });
});

// POST /api/v1/exam-session/submit
app.post("/api/v1/exam-session/submit", (req, res) => {
  const { sessionId, responses, totalElapsedMs } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Grade the exam
  let score = 0;
  const total = session.questions.length;

  session.questions.forEach((q) => {
    // Check by position-based response (candidate portal uses position as key)
    const response = responses?.[q.position] || responses?.[q.paramInstantiationId] || responses?.[q.templateId];
    let selectedLabel;
    if (typeof response === "object" && response !== null) {
      selectedLabel = response.selectedChoice;
    } else {
      selectedLabel = response;
    }
    if (selectedLabel && selectedLabel === q._correct) {
      score++;
    }
  });

  const hash = sha256(sessionId + JSON.stringify(responses) + Date.now());
  const submittedAt = now();
  const blockchainEventId = `evt_${uid()}`;

  db.submissions[hash] = {
    sessionId,
    candidateId: session.candidateId,
    examId: session.examId,
    score,
    total,
    percentage: +((score / total) * 100).toFixed(1),
    hash,
    submittedAt,
    blockchainEventId,
    equatedScore: score,
    equatingApplied: false,
  };

  session.status = "submitted";
  addAuditEvent("exam_submitted", session.candidateId, session.examId, {
    sessionId, score, total, hash,
  });

  res.json({
    submissionHash: hash,
    score,
    total,
    percentage: +((score / total) * 100).toFixed(1),
    submittedAt,
    blockchainEventId,
  });
});

// GET /api/v1/exam-session/status
app.get("/api/v1/exam-session/status", (req, res) => {
  const tokenData = parseToken(req);
  const candidateId = tokenData?.sub;

  if (!candidateId) return res.json({ status: "no_session", message: "Not authenticated" });

  // Find active session for this candidate
  const session = Object.values(db.sessions).find(
    (s) => s.candidateId === candidateId && s.status === "active"
  );

  if (!session) {
    const submitted = Object.values(db.sessions).find(
      (s) => s.candidateId === candidateId && s.status === "submitted"
    );
    if (submitted) {
      return res.json({ status: "submitted", sessionId: submitted.sessionId, examId: submitted.examId });
    }
    return res.json({ status: "no_session", message: "No active exam session" });
  }

  const checkpoint = db.checkpoints[session.sessionId];
  res.json({
    status: "active",
    sessionId: session.sessionId,
    examId: session.examId,
    startedAt: session.startedAt,
    lastCheckpoint: checkpoint ? checkpoint.savedAt : null,
    elapsedMs: checkpoint ? checkpoint.elapsedMs : 0,
    currentQuestion: checkpoint ? checkpoint.currentQuestionPosition : 1,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFICATION ENDPOINT (public)
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/v1/verify/:hash", (req, res) => {
  const sub = db.submissions[req.params.hash];
  if (!sub) return res.status(404).json({ verified: false, message: "Submission not found" });
  res.json({
    verified: true,
    timestamp: sub.submittedAt,
    blockchainEventId: sub.blockchainEventId || `evt_${uid()}`,
    submissionHash: sub.hash,
    candidateId: sub.candidateId,
    examId: sub.examId,
    score: sub.score,
    total: sub.total,
    percentage: sub.percentage,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIT TRAIL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/audit/events — list with filtering and pagination
app.get("/api/v1/audit/events", (req, res) => {
  const { examId, eventType, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let events = [...db.auditEvents];

  if (examId) events = events.filter((e) => e.examId === examId);
  if (eventType) events = events.filter((e) => e.eventType === eventType);
  if (startDate) events = events.filter((e) => e.timestamp >= startDate);
  if (endDate) events = events.filter((e) => e.timestamp <= endDate);

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total = events.length;
  const pg = parseInt(page) || 1;
  const ps = parseInt(pageSize) || 50;
  const totalPages = Math.ceil(total / ps);
  const sliced = events.slice((pg - 1) * ps, pg * ps);

  res.json({ items: sliced, total, page: pg, pageSize: ps, totalPages });
});

// GET /api/v1/audit/events/:examId — events for specific exam
app.get("/api/v1/audit/events/:examId", (req, res) => {
  const events = db.auditEvents
    .filter((e) => e.examId === req.params.examId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(events);
});

// GET /api/v1/audit/verify/:eventId
app.get("/api/v1/audit/verify/:eventId", (req, res) => {
  const event = db.auditEvents.find((e) => e.eventId === req.params.eventId);
  if (!event) return res.status(404).json({ verified: false, error: "Event not found" });

  // Verify hash chain integrity
  const expectedHash = sha256(JSON.stringify({
    eventType: event.eventType,
    actorId: event.actorId,
    examId: event.examId,
    metadata: event.metadata,
    prevHash: event.prevHash,
  }));
  const verified = expectedHash === event.entityHash;

  res.json({ verified, event });
});

// GET /api/v1/audit/proof/:eventId — Merkle proof
app.get("/api/v1/audit/proof/:eventId", (req, res) => {
  const event = db.auditEvents.find((e) => e.eventId === req.params.eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  // Simulate Merkle proof
  const merkleProof = [];
  let currentHash = event.entityHash;
  for (let i = 0; i < 4; i++) {
    const siblingHash = sha256(`sibling_${i}_${currentHash}`);
    merkleProof.push(siblingHash);
    currentHash = sha256(currentHash + siblingHash);
  }

  res.json({
    eventId: event.eventId,
    txId: event.txId,
    blockNumber: Math.floor(Math.random() * 10000) + 1000,
    blockHash: `0x${sha256(event.txId + "block")}`,
    merkleProof,
    verified: true,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/dashboard/stats
app.get("/api/v1/dashboard/stats", (_, res) => {
  const exams = Object.values(db.exams);
  const questions = Object.values(db.questions).filter((q) => !q.deleted);
  const recentEvents = db.auditEvents
    .slice(-10)
    .reverse()
    .map((e) => ({
      id: e.eventId,
      type: e.eventType,
      description: `${e.eventType.replace(/_/g, " ")} by ${e.actorId}`,
      timestamp: e.timestamp,
      actor: e.actorId,
    }));

  res.json({
    totalExams: exams.length,
    questionBankSize: questions.length,
    totalQuestions: questions.length,
    totalCandidates: Object.keys(db.candidates).length,
    totalSubmissions: Object.keys(db.submissions).length,
    activeExams: exams.filter((e) => e.status === "ACTIVE").length,
    generatedQuestions: questions.filter((q) => q.source === "gemini").length,
    pendingAlerts: 2,
    recentActivity: recentEvents,
  });
});

// GET /api/v1/dashboard/recent-activity
app.get("/api/v1/dashboard/recent-activity", (_, res) => {
  const recentEvents = db.auditEvents
    .slice(-20)
    .reverse()
    .map((e) => ({
      id: e.eventId,
      type: e.eventType,
      description: `${e.eventType.replace(/_/g, " ")} by ${e.actorId}`,
      timestamp: e.timestamp,
      actor: e.actorId,
      examId: e.examId,
    }));
  res.json(recentEvents);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROCTORING / ANTI-CHEAT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/proctor/heartbeat — candidate heartbeat
app.post("/api/v1/proctor/heartbeat", (req, res) => {
  const { sessionId } = req.body;
  const tokenData = parseToken(req);
  const sid = sessionId || tokenData?.sessionId;

  if (!sid) return res.status(400).json({ error: "sessionId required" });

  db.heartbeats[sid] = {
    lastHeartbeat: now(),
    candidateId: tokenData?.sub || req.body.candidateId,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  };

  res.json({ received: true, serverTime: now() });
});

// POST /api/v1/proctor/violation — report violation
app.post("/api/v1/proctor/violation", (req, res) => {
  const {
    sessionId, type, timestamp: violationTimestamp, details,
    tabSwitch, focusLoss, copyPaste, rightClick, devTools,
    screenshot, multipleMonitors, vmDetected, keyboardShortcut,
  } = req.body;
  const tokenData = parseToken(req);
  const sid = sessionId || tokenData?.sessionId;

  if (!sid) return res.status(400).json({ error: "sessionId required" });

  if (!db.proctorLogs[sid]) db.proctorLogs[sid] = [];

  const violation = {
    id: `viol_${uid()}`,
    sessionId: sid,
    type: type || "unknown",
    severity: getSeverity(type),
    timestamp: violationTimestamp || now(),
    details: details || {},
    candidateId: tokenData?.sub || req.body.candidateId,
    tabSwitch: tabSwitch || false,
    focusLoss: focusLoss || false,
    copyPaste: copyPaste || false,
    rightClick: rightClick || false,
    devTools: devTools || false,
    screenshot: screenshot || false,
    multipleMonitors: multipleMonitors || false,
    vmDetected: vmDetected || false,
    keyboardShortcut: keyboardShortcut || null,
  };

  db.proctorLogs[sid].push(violation);

  const session = db.sessions[sid];
  if (session) {
    addAuditEvent("proctor_violation", tokenData?.sub || "unknown", session.examId, {
      sessionId: sid, type: violation.type, severity: violation.severity,
    });
  }

  res.json({ recorded: true, violationId: violation.id, totalViolations: db.proctorLogs[sid].length });
});

function getSeverity(type) {
  const highSeverity = ["devtools_open", "screenshot", "screen_recording", "vm_detected", "remote_desktop"];
  const mediumSeverity = ["copy_paste", "keyboard_shortcut", "multiple_monitors", "right_click"];
  const lowSeverity = ["tab_switch", "focus_loss", "window_resize"];

  if (highSeverity.includes(type)) return "high";
  if (mediumSeverity.includes(type)) return "medium";
  if (lowSeverity.includes(type)) return "low";
  return "medium";
}

// GET /api/v1/proctor/:sessionId/log — get violations for session
app.get("/api/v1/proctor/:sessionId/log", (req, res) => {
  const logs = db.proctorLogs[req.params.sessionId] || [];
  res.json({
    sessionId: req.params.sessionId,
    totalViolations: logs.length,
    violations: logs,
    summary: {
      high: logs.filter((v) => v.severity === "high").length,
      medium: logs.filter((v) => v.severity === "medium").length,
      low: logs.filter((v) => v.severity === "low").length,
      tabSwitches: logs.filter((v) => v.type === "tab_switch" || v.tabSwitch).length,
      focusLosses: logs.filter((v) => v.type === "focus_loss" || v.focusLoss).length,
      copyPasteAttempts: logs.filter((v) => v.type === "copy_paste" || v.copyPaste).length,
      devToolsAttempts: logs.filter((v) => v.type === "devtools_open" || v.devTools).length,
      screenshotAttempts: logs.filter((v) => v.type === "screenshot" || v.screenshot).length,
      vmDetections: logs.filter((v) => v.type === "vm_detected" || v.vmDetected).length,
    },
  });
});

// POST /api/v1/proctor/lockdown-status — lockdown browser status
app.post("/api/v1/proctor/lockdown-status", (req, res) => {
  const { sessionId, lockdownActive, browserInfo, checks } = req.body;
  const sid = sessionId || parseToken(req)?.sessionId;

  if (!sid) return res.status(400).json({ error: "sessionId required" });

  if (!db.proctorLogs[sid]) db.proctorLogs[sid] = [];

  db.proctorLogs[sid].push({
    id: `lock_${uid()}`,
    sessionId: sid,
    type: "lockdown_status",
    severity: lockdownActive ? "info" : "high",
    timestamp: now(),
    details: {
      lockdownActive: lockdownActive || false,
      browserInfo: browserInfo || {},
      checks: checks || {
        clipboardBlocked: true,
        printScreenBlocked: true,
        altTabBlocked: true,
        rightClickBlocked: true,
        devToolsBlocked: true,
        multipleMonitorsBlocked: true,
      },
    },
  });

  res.json({
    acknowledged: true,
    lockdownVerified: lockdownActive !== false,
    serverTime: now(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CATCH-ALL & ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

// Catch any unmatched API routes and return a helpful 404
app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    method: req.method,
    path: req.originalUrl,
    hint: "Check the API documentation for available endpoints",
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║       ParikshaSuraksha MVP API Server v2.0.0            ║`);
  console.log(`║       AI-Powered Exam Integrity Engine                  ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Port:        ${PORT}                                       ║`);
  console.log(`║  Gemini API:  ${GEMINI_API_KEY ? "CONFIGURED" : "NOT SET (fallback mode)"}${GEMINI_API_KEY ? "                         ║" : "          ║"}`);
  console.log(`║  Questions:   ${Object.keys(db.questions).length} seed questions                        ║`);
  console.log(`║  Demo Exam:   ${DEMO_EXAM_ID}                         ║`);
  console.log(`║  Centers:     ${Object.keys(db.centers).length} exam centers                          ║`);
  console.log(`║  Candidates:  ${Object.keys(db.candidates).length} demo candidates                       ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Demo Logins:                                          ║`);
  console.log(`║    Admin:      admin@pariksha.dmj.one / admin123       ║`);
  console.log(`║    Controller: controller@pariksha.dmj.one             ║`);
  console.log(`║    Faculty:    faculty@pariksha.dmj.one                ║`);
  console.log(`║    Candidate:  ADMIT2026001 or ADMIT2026002            ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
});
