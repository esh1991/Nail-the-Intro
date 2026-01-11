// -----------------------------
// Helpers
// -----------------------------
function $(id){ return document.getElementById(id); }

const statusLine = $("statusLine");
function setStatus(text){ statusLine.textContent = text; }

// -----------------------------
// Tabs (Right side)
// -----------------------------
const tabScriptBtn = $("tabScriptBtn");
const tabAnalysisBtn = $("tabAnalysisBtn");
const scriptPanel = $("scriptPanel");
const analysisPanel = $("analysisPanel");
const tabBadge = $("tabBadge");

function showRightTab(which){
  const isScript = which === "script";
  tabScriptBtn.classList.toggle("active", isScript);
  tabAnalysisBtn.classList.toggle("active", !isScript);
  scriptPanel.style.display = isScript ? "block" : "none";
  analysisPanel.style.display = isScript ? "none" : "block";
}
tabScriptBtn.addEventListener("click", () => showRightTab("script"));
tabAnalysisBtn.addEventListener("click", () => showRightTab("analysis"));
showRightTab("script"); // default

// -----------------------------
// Main Video Upload + Start Interview
// -----------------------------
const mainVideo = $("mainVideo");
const videoOverlay = $("videoOverlay");
const fileInput = $("fileInput");
const bigUploadBtn = $("bigUploadBtn");
const startInterviewBtn = $("startInterviewBtn");
const resetBtn = $("resetBtn");
const videoDropZone = $("videoDropZone");

let mainVideoObjectUrl = null;

function setMainVideoFromFile(file){
  if (!file || !file.type?.startsWith("video/")) return;

  if (mainVideoObjectUrl) URL.revokeObjectURL(mainVideoObjectUrl);
  mainVideoObjectUrl = URL.createObjectURL(file);

  mainVideo.src = mainVideoObjectUrl;
  mainVideo.load();
  mainVideo.controls = true;
  mainVideo.muted = false;

  videoOverlay.style.display = "none";
  setStatus("Video loaded. Click Start Interview.");
}

bigUploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  setMainVideoFromFile(file);
});

// Drag & drop support
videoDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  videoDropZone.style.outline = "2px solid rgba(108,99,255,.35)";
});
videoDropZone.addEventListener("dragleave", () => {
  videoDropZone.style.outline = "none";
});
videoDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  videoDropZone.style.outline = "none";
  const file = e.dataTransfer.files?.[0];
  if (file && file.type.startsWith("video/")) setMainVideoFromFile(file);
});

// Start Interview: play the prompt video
startInterviewBtn.addEventListener("click", async () => {
  if (!mainVideo.src) {
    alert("Please upload a prompt video first.");
    return;
  }
  try{
    mainVideo.currentTime = 0;
    await mainVideo.play();
    setStatus("Interview started (video playing).");
  }catch(err){
    console.warn(err);
    alert("Autoplay blocked. Click play on the video once, then try again.");
  }
});

// -----------------------------
// Notes autosave (Script tab)
// -----------------------------
const notes = $("notes");
const LS_KEY = "pitchperfect_notes_split_v4";

function setSavedUI(saved=true){
  tabBadge.textContent = saved ? "SAVED" : "SAVING…";
  tabBadge.style.opacity = saved ? "1" : ".85";
}

const saved = localStorage.getItem(LS_KEY);
if (saved) notes.value = saved;

let saveTimer = null;
notes.addEventListener("input", () => {
  setSavedUI(false);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(LS_KEY, notes.value);
    setSavedUI(true);
  }, 250);
});
setSavedUI(true);

// -----------------------------
// Analysis UI
// -----------------------------
const analysisBadgeEl = $("analysisBadge");
const fillerTotalEl = $("fillerTotal");
const fillerBreakdownEl = $("fillerBreakdown");
const transcriptBox = $("transcriptBox");
const recommendedScriptBox = $("recommendedScriptBox");
const analysisHint = $("analysisHint");
const speechHint = $("speechHint");

function setAnalysisState(state){
  analysisBadgeEl.textContent = state;
}

// -----------------------------
// Transcript -> Recommended Script (rule-based cleanup)
// -----------------------------
function normalizeWhitespace(s){
  return (s || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\s([,.!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function capitalizeSentence(s){
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function splitIntoSentences(text){
  const t = (text || "").trim();
  if (!t) return [];

  let parts = t
    .replace(/([.!?])(\s+)([a-z])/g, (_, p, sp, c) => `${p}${sp}${c.toUpperCase()}`)
    .split(/(?<=[.!?])\s+/);

  if (parts.length === 1) {
    parts = t.split(/\s+(and then|then|so|because|but)\s+/i).map(x => x.trim()).filter(Boolean);
  }
  return parts.map(p => p.trim()).filter(Boolean);
}

function tightenPhrases(text){
  return text
    .replace(/\b(in order to)\b/gi, "to")
    .replace(/\b(at the end of the day)\b/gi, "")
    .replace(/\b(a lot of)\b/gi, "many")
    .replace(/\b(kind of|sort of)\b/gi, "")
    .replace(/\b(you know)\b/gi, "")
    .replace(/\b(i mean)\b/gi, "")
    .replace(/\b(very)\b/gi, "")
    .replace(/\b(really)\b/gi, "")
    .replace(/\b(just)\b/gi, "")
    .replace(/\b(actually)\b/gi, "")
    .replace(/\b(basically)\b/gi, "")
    .replace(/\b(literally)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeDisfluencies(text){
  // Remove um/ummm/uhhh/ermmm/errr variants
  return text
    .replace(/\b(um+|uh+|erm+|er+)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeDuplicateRuns(text){
  let t = text;
  // Remove immediate word repeats: "I I", "the the"
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  // Remove repeated short phrases like "I think I think"
  t = t.replace(/\b(i think)(\s+i think\b)+/gi, "I think");
  return t.trim();
}

function removeStandaloneLike(text){
  // Remove "like" when used as filler, but keep "would like / I'd like / I would like"
  return text.replace(/\blike\b/gi, (match, offset, str) => {
    const before = str.slice(Math.max(0, offset - 12), offset).toLowerCase();
    if (before.includes("would ") || before.includes("i'd ") || before.includes("id ") || before.includes("i would ")) {
      return match; // keep
    }
    return "";
  });
}

function addLightPunctuation(text){
  let s = text.trim();
  if (!s) return s;

  // Ensure a final period if missing
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}

function shortenRunOns(sentence){
  const s = sentence.trim();
  if (s.length <= 140) return [s];

  const chunks = s.split(/\s+(and|but|because|so)\s+/i).map(x => x.trim()).filter(Boolean);
  if (chunks.length <= 1) return [s];

  const rebuilt = [];
  let current = "";

  for (const c of chunks) {
    const tentative = (current ? current + " " : "") + c;
    if (tentative.length > 140 && current) {
      rebuilt.push(current.trim());
      current = c;
    } else {
      current = tentative;
    }
  }
  if (current) rebuilt.push(current.trim());

  return rebuilt;
}

function cleanAndTightenTranscript(rawTranscript){
  let t = (rawTranscript || "").trim();
  if (!t) return "";

  t = normalizeWhitespace(t);
  t = removeDisfluencies(t);
  t = removeDuplicateRuns(t);
  t = removeStandaloneLike(t);
  t = tightenPhrases(t);

  // Remove leftover double spaces from deletions
  t = normalizeWhitespace(t).replace(/\s{2,}/g, " ").trim();

  const sentences = splitIntoSentences(t)
    .flatMap(shortenRunOns)
    .map(s => s.trim())
    .filter(Boolean)
    .map(addLightPunctuation)
    .map(capitalizeSentence);

  // Drop tiny fragments (often junk)
  const filtered = sentences.filter(s => s.replace(/[^\w]/g, "").length >= 3);

  return normalizeWhitespace(filtered.join(" "));
}

function toRecommendedScript(transcript){
  const cleaned = cleanAndTightenTranscript(transcript);
  return cleaned || "—";
}

// -----------------------------
// Analysis setResult
// -----------------------------
function setAnalysisResult({ transcript, total, breakdownText }){
  const t = transcript?.trim() ? transcript.trim() : "—";
  transcriptBox.textContent = t;

  fillerTotalEl.textContent = (typeof total === "number") ? String(total) : "—";
  fillerBreakdownEl.textContent = breakdownText?.trim() ? breakdownText : "—";

  if (recommendedScriptBox) {
    recommendedScriptBox.textContent = (t !== "—") ? toRecommendedScript(t) : "—";
  }
}

// -----------------------------
// Speech Recognition (for transcript)
// -----------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let finalTranscript = "";
let recognitionRunning = false;

function initSpeechRecognition(){
  if (!SpeechRecognition) {
    setAnalysisState("UNSUPPORTED");
    analysisHint.textContent = "Speech recognition not supported in this browser. Use Chrome for filler-word analysis.";
    speechHint.textContent = "Speech recognition unsupported here — open in Chrome for filler analysis.";
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res[0]?.transcript || "";
      if (res.isFinal) finalTranscript += text + " ";
      else interim += text;
    }
    const live = (finalTranscript + interim).trim();
    if (live) transcriptBox.textContent = live;
  };

  recognition.onerror = (e) => {
    console.warn("SpeechRecognition error:", e);
  };

  recognition.onend = () => {
    recognitionRunning = false;
  };

  return true;
}

const speechOk = initSpeechRecognition();
if (speechOk) setAnalysisState("WAITING");

// -----------------------------
// Filler word counting (includes variants)
// -----------------------------
const PHRASE_FILLERS = [
  "you know",
  "i mean",
  "actually",
  "basically",
  "literally",
  "like",
  "so",
  "well",
  "right"
];

const VARIANT_PATTERNS = [
  { label: "um/umm/ummm",      re: /\bum+\b/g },
  { label: "uh/uhh/uhhh",      re: /\buh+\b/g },
  { label: "erm/ermm/ermmm",   re: /\berm+\b/g },
  { label: "er/err/errr",      re: /\ber+\b/g }
];

function escapeRegExp(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countFillers(transcript){
  const t = (transcript || "").toLowerCase();

  const counts = {};
  let total = 0;

  for (const f of PHRASE_FILLERS) {
    const re = new RegExp(`\\b${escapeRegExp(f)}\\b`, "g");
    const matches = t.match(re);
    const c = matches ? matches.length : 0;
    counts[f] = c;
    total += c;
  }

  for (const vp of VARIANT_PATTERNS) {
    const matches = t.match(vp.re);
    const c = matches ? matches.length : 0;
    counts[vp.label] = c;
    total += c;
  }

  const entries = Object.entries(counts)
    .filter(([,c]) => c > 0)
    .sort((a,b) => b[1] - a[1]);

  const breakdownText = entries.length
    ? entries.map(([k,v]) => `${k}: ${v}`).join("\n")
    : "No filler words detected (based on transcript).";

  return { total, breakdownText };
}

// -----------------------------
// Audio Recording
// -----------------------------
const recStartBtn = $("recStartBtn");
const recStopBtn  = $("recStopBtn");
const recDot = $("recDot");
const recLabel = $("recLabel");

const audioPreview = $("audioPreview");
const audioPlayback = $("audioPlayback");
const audioDownload = $("audioDownload");

let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioObjectUrl = null;

function setRecUI(isRecording){
  recDot.classList.toggle("on", isRecording);
  recLabel.textContent = isRecording ? "RECORDING" : "IDLE";
  recStartBtn.disabled = isRecording;
  recStopBtn.disabled = !isRecording;
}

function startRecognition(){
  if (!speechOk || !recognition || recognitionRunning) return;
  finalTranscript = "";
  transcriptBox.textContent = "Listening…";
  setAnalysisState("LISTENING");
  try{
    recognition.start();
    recognitionRunning = true;
  }catch(_e){
    // ignore start errors
  }
}

function stopRecognition(){
  if (!speechOk || !recognition) return;
  try{ recognition.stop(); }catch(_e){}
}

async function startAudioRecording(){
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  const candidates = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/ogg"];
  const mimeType = candidates.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";

  mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });

    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = URL.createObjectURL(blob);

    audioPlayback.src = audioObjectUrl;
    audioPreview.style.display = "block";

    const ext = (mediaRecorder.mimeType || "").includes("ogg") ? "ogg" : "webm";
    audioDownload.href = audioObjectUrl;
    audioDownload.download = `interview-audio.${ext}`;

    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
  };

  mediaRecorder.start();
  setRecUI(true);
  setStatus("Recording audio…");

  startRecognition();
}

function stopAudioRecording(){
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  setRecUI(false);
  setStatus("Audio recorded. Analyzing…");

  stopRecognition();

  setTimeout(() => {
    if (!speechOk) {
      setAnalysisState("UNSUPPORTED");
      setAnalysisResult({ transcript: "—", total: null, breakdownText: "Speech recognition not available." });
      setStatus("Audio recorded (no transcript available).");
      return;
    }

    const transcript = (finalTranscript || transcriptBox.textContent || "").trim();
    const { total, breakdownText } = countFillers(transcript);

    setAnalysisState("READY");
    setAnalysisResult({ transcript, total, breakdownText });
    setStatus("Audio recorded. Analysis ready.");
  }, 350);
}

recStartBtn.addEventListener("click", async () => {
  try{
    await startAudioRecording();
  }catch(err){
    console.warn(err);
    alert("Mic permission denied or unavailable. Please allow microphone access.");
    setRecUI(false);
    setStatus("Mic unavailable.");
  }
});

recStopBtn.addEventListener("click", () => stopAudioRecording());

// -----------------------------
// Webcam preview (optional)
// -----------------------------
const webcamVideo = $("webcam");
(async function startWebcam(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    webcamVideo.srcObject = stream;
  }catch(_err){
    // ignore
  }
})();

// -----------------------------
// Reset
// -----------------------------
resetBtn.addEventListener("click", () => {
  // Main video
  mainVideo.pause();
  mainVideo.removeAttribute("src");
  mainVideo.load();
  mainVideo.controls = false;
  fileInput.value = "";
  if (mainVideoObjectUrl) {
    URL.revokeObjectURL(mainVideoObjectUrl);
    mainVideoObjectUrl = null;
  }
  videoOverlay.style.display = "flex";

  // Audio
  try { if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop(); } catch {}
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  setRecUI(false);

  if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = null; }
  audioPreview.style.display = "none";
  audioPlayback.removeAttribute("src");
  audioPlayback.load();

  // Stop recognition if running
  try { stopRecognition(); } catch {}

  // Notes
  localStorage.removeItem(LS_KEY);
  notes.value = "";
  setSavedUI(true);

  // Analysis reset
  finalTranscript = "";
  setAnalysisState(speechOk ? "WAITING" : "UNSUPPORTED");
  setAnalysisResult({ transcript: "—", total: null, breakdownText: "—" });
  if (recommendedScriptBox) recommendedScriptBox.textContent = "—";

  setStatus("Ready");
  showRightTab("script");
});

// Init
setRecUI(false);
setStatus("Ready");
setAnalysisResult({ transcript: "—", total: null, breakdownText: "—" });
if (recommendedScriptBox) recommendedScriptBox.textContent = "—";
