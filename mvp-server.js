const express = require("express");
const crypto = require("crypto");
const app = express();
app.use(express.json());

const db = { exams: {}, candidates: {}, sessions: {}, submissions: {} };

const sampleQuestions = [
  { id:"q1", subject:"Physics", topic:"Mechanics", text:"A ball is thrown upward with velocity {{v}} m/s. Find max height. (g=10 m/s²)", params:{v:[10,15,20,25,30]},
    opts:(v)=>[{l:"A",t:`${v*v/20} m`,c:true},{l:"B",t:`${v*v/20+5} m`,c:false},{l:"C",t:`${v*v/10} m`,c:false},{l:"D",t:`${v*v/40} m`,c:false}]},
  { id:"q2", subject:"Physics", topic:"Optics", text:"Convex lens f={{f}} cm, object at u={{u}} cm. Find image distance.", params:{f:[10,15,20],u:[30,40,60]},
    opts:(f,u)=>{const v=(f*u)/(u-f);return[{l:"A",t:`${v.toFixed(1)} cm`,c:true},{l:"B",t:`${(v+10).toFixed(1)} cm`,c:false},{l:"C",t:`${(v*2).toFixed(1)} cm`,c:false},{l:"D",t:`${(v/2).toFixed(1)} cm`,c:false}]}},
  { id:"q3", subject:"Chemistry", topic:"Moles", text:"Moles in {{mass}} g NaCl (M=58.5 g/mol)?", params:{mass:[58.5,117,175.5,29.25]},
    opts:(m)=>{const c=m/58.5;return[{l:"A",t:`${c.toFixed(2)} mol`,c:true},{l:"B",t:`${(c*2).toFixed(2)} mol`,c:false},{l:"C",t:`${(c+0.5).toFixed(2)} mol`,c:false},{l:"D",t:`${(c/2).toFixed(2)} mol`,c:false}]}},
  { id:"q4", subject:"Math", topic:"Calculus", text:"Derivative of f(x)={{a}}x³+{{b}}x² at x={{c}}", params:{a:[1,2,3],b:[2,3,4],c:[1,2,3]},
    opts:(a,b,c)=>{const r=3*a*c*c+2*b*c;return[{l:"A",t:`${r}`,c:true},{l:"B",t:`${r+a}`,c:false},{l:"C",t:`${r*2}`,c:false},{l:"D",t:`${r-b}`,c:false}]}},
  { id:"q5", subject:"Biology", topic:"Genetics", text:"Aa × Aa cross: fraction of homozygous recessive offspring?", params:{},
    opts:()=>[{l:"A",t:"1/4",c:true},{l:"B",t:"1/2",c:false},{l:"C",t:"3/4",c:false},{l:"D",t:"1/8",c:false}]},
  { id:"q6", subject:"Physics", topic:"Thermo", text:"{{n}} mol ideal gas at {{T}}K. Internal energy? (monoatomic)", params:{n:[1,2,3],T:[300,400,500]},
    opts:(n,T)=>{const r=Math.round(1.5*n*8.314*T);return[{l:"A",t:`${r} J`,c:true},{l:"B",t:`${r*2} J`,c:false},{l:"C",t:`${Math.round(r/1.5)} J`,c:false},{l:"D",t:`${Math.round(r*0.67)} J`,c:false}]}},
  { id:"q7", subject:"Chemistry", topic:"pH", text:"pH of {{c}} M HCl?", params:{c:[0.1,0.01,0.001,0.0001]},
    opts:(c)=>{const p=-Math.log10(c);return[{l:"A",t:`${p}`,c:true},{l:"B",t:`${p+1}`,c:false},{l:"C",t:`${14-p}`,c:false},{l:"D",t:`${p-1}`,c:false}]}},
  { id:"q8", subject:"Math", topic:"Probability", text:"Two dice thrown. P(sum={{s}})?", params:{s:[7,8,6,9]},
    opts:(s)=>{const n={6:5,7:6,8:5,9:4}[s]||3;return[{l:"A",t:`${n}/36`,c:true},{l:"B",t:`${n+1}/36`,c:false},{l:"C",t:`${n-1}/36`,c:false},{l:"D",t:`${n*2}/36`,c:false}]}},
  { id:"q9", subject:"Biology", topic:"Cell", text:"Which organelle produces ATP?", params:{},
    opts:()=>[{l:"A",t:"Mitochondria",c:true},{l:"B",t:"Golgi apparatus",c:false},{l:"C",t:"Endoplasmic reticulum",c:false},{l:"D",t:"Lysosome",c:false}]},
  { id:"q10", subject:"Physics", topic:"Electricity", text:"Wire: ρ={{rho}} Ω·m, L={{l}} m, A={{a}} mm². Resistance?", params:{rho:[1e-7,1.7e-7],l:[1,2,5],a:[1,2]},
    opts:(rho,l,a)=>{const r=(rho*l/(a*1e-6)).toFixed(2);return[{l:"A",t:`${r} Ω`,c:true},{l:"B",t:`${(r*2).toFixed(2)} Ω`,c:false},{l:"C",t:`${(r/2).toFixed(2)} Ω`,c:false},{l:"D",t:`${(parseFloat(r)+0.05).toFixed(2)} Ω`,c:false}]}}
];

function generatePaper(examId, candidateId, count) {
  const seed = crypto.createHash("sha256").update(examId+candidateId).digest();
  return Array.from({length: count}, (_, i) => {
    const q = sampleQuestions[i % sampleQuestions.length];
    const pkeys = Object.keys(q.params);
    const pvals = pkeys.map((k,j) => q.params[k][(seed[i*3+j]||0) % q.params[k].length]);
    let text = q.text;
    pkeys.forEach((k,j) => { text = text.replace(`{{${k}}}`, pvals[j]); });
    const options = q.opts(...pvals);
    return { position:i+1, id:`${q.id}_${i}`, subject:q.subject, topic:q.topic, text, options };
  });
}

app.use((req,res,next)=>{ res.header("Access-Control-Allow-Origin","*"); res.header("Access-Control-Allow-Methods","*"); res.header("Access-Control-Allow-Headers","*"); if(req.method==="OPTIONS")return res.sendStatus(200); next(); });

app.get("/health", (_,res) => res.json({status:"ok"}));
app.get("/api/v1/health", (_,res) => res.json({status:"ok"}));

app.post("/auth/login", (req,res) => {
  const {admitCard,role} = req.body;
  const token = Buffer.from(JSON.stringify({sub:admitCard||"admin",role:role||"CANDIDATE"})).toString("base64");
  res.json({token, role: role||"CANDIDATE", admitCard: admitCard||"admin"});
});

app.post("/api/v1/exams", (req,res) => {
  const id = "EXAM_"+crypto.randomBytes(4).toString("hex").toUpperCase();
  db.exams[id] = { id, ...req.body, status:"CREATED", questionsPerPaper: req.body.questionsPerPaper||10, createdAt:new Date().toISOString() };
  res.json(db.exams[id]);
});

app.get("/api/v1/exams", (_,res) => res.json(Object.values(db.exams)));
app.get("/api/v1/exams/:id", (req,res) => res.json(db.exams[req.params.id]||{error:"not found"}));
app.post("/api/v1/exams/:id/activate", (req,res) => { if(db.exams[req.params.id]){db.exams[req.params.id].status="ACTIVE";} res.json(db.exams[req.params.id]); });

app.post("/api/v1/exams/:id/candidates", (req,res) => {
  const cid = req.body.admitCard || "STUD_"+crypto.randomBytes(3).toString("hex").toUpperCase();
  db.candidates[cid] = { id:cid, ...req.body, examId:req.params.id, registeredAt:new Date().toISOString() };
  res.json(db.candidates[cid]);
});

app.post("/api/v1/exam-session/start", (req,res) => {
  const {candidateId, examId} = req.body;
  const exam = db.exams[examId];
  if(!exam) return res.status(404).json({error:"Exam not found"});
  if(exam.status!=="ACTIVE") return res.status(400).json({error:"Exam not active. POST /api/v1/exams/"+examId+"/activate first"});
  const questions = generatePaper(examId, candidateId, exam.questionsPerPaper||10);
  const sid = "SESS_"+crypto.randomBytes(4).toString("hex").toUpperCase();
  const safe = questions.map(q=>({...q, options:q.options.map(({c,...r})=>r)}));
  db.sessions[sid] = { sessionId:sid, examId, candidateId, questions, startedAt:new Date().toISOString() };
  res.json({ sessionId:sid, examId, candidateId, examName:exam.name, totalQuestions:safe.length, durationMinutes:60, questions:safe });
});

app.post("/api/v1/exam-session/submit", (req,res) => {
  const {sessionId, responses} = req.body;
  const sess = db.sessions[sessionId];
  if(!sess) return res.status(404).json({error:"Session not found"});
  let score = 0;
  sess.questions.forEach(q => { const correct = q.options.find(o=>o.c); if(responses&&responses[q.id]===correct?.l) score++; });
  const hash = crypto.createHash("sha256").update(sessionId+JSON.stringify(responses)+Date.now()).digest("hex");
  const total = sess.questions.length;
  db.submissions[hash] = { sessionId, candidateId:sess.candidateId, examId:sess.examId, score, total, percentage:((score/total)*100).toFixed(1), hash, submittedAt:new Date().toISOString() };
  res.json({ submissionHash:hash, score, total, percentage:((score/total)*100).toFixed(1) });
});

app.get("/api/v1/verify/:hash", (req,res) => {
  const s = db.submissions[req.params.hash];
  if(!s) return res.status(404).json({verified:false});
  res.json({verified:true, ...s});
});

app.get("/api/v1/questions", (_,res) => res.json(sampleQuestions.map(q=>({id:q.id,subject:q.subject,topic:q.topic,text:q.text,status:"CALIBRATED"}))));
app.get("/api/v1/dashboard/stats", (_,res) => res.json({totalExams:Object.keys(db.exams).length,totalQuestions:sampleQuestions.length,totalCandidates:Object.keys(db.candidates).length,totalSubmissions:Object.keys(db.submissions).length}));

app.listen(3000, "0.0.0.0", () => console.log("ParikshaSuraksha MVP API on :3000"));
