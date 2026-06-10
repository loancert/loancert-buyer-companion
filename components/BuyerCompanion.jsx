import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND HOOKS — replace stubs with real API calls when backend is ready
// ─────────────────────────────────────────────────────────────────────────────

async function loadUserSession(userId) {
  if (userId === "demo-returning") {
    return {
      priorIntake: {
        timeline: "3–6 months",
        priceRange: "$450,000–$520,000 in Sacramento area",
        firstTimeBuyer: true,
        incomeType: "W-2 employee",
        creditRange: "Good 680–739",
        downPayment: "~$25,000 saved, exploring DPA options",
        summary: "You're a first-time buyer with stable W-2 income targeting the Sacramento market in a 3–6 month window. Your down payment is a work in progress but you're aware of assistance programs.",
      },
      messageHistory: [],
      sessionCount: 1,
      lastSeen: "2025-12-10T14:32:00Z",
    };
  }
  return null;
}

async function saveMessage(userId, sessionId, role, content) {
  console.log("[LoanCert DB] SAVE MESSAGE →", { userId, sessionId, role, content: content.slice(0, 80) + "..." });
  // await fetch(`/api/users/${userId}/messages`, { method: "POST", ... });
}

async function saveIntakeRecord(userId, sessionId, intakeJson) {
  console.log("[LoanCert DB] SAVE INTAKE RECORD →", { userId, sessionId, intakeJson });
  // await fetch(`/api/users/${userId}/intake`, { method: "POST", ... });
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTION PARSING — extracts numbered choices from bot messages
// Matches lines like: "1. Something" or "1) Something"
// Returns { text: string (message without options), options: string[] }
// ─────────────────────────────────────────────────────────────────────────────

function parseOptions(content) {
  const lines = content.split("\n");
  const optionLines = [];
  const textLines = [];
  const optionPattern = /^\s*(\d+)[.)]\s+(.+)$/;

  // Collect a contiguous trailing block of numbered lines
  let inOptions = false;
  for (const line of lines) {
    if (optionPattern.test(line)) {
      inOptions = true;
      optionLines.push(line.match(optionPattern)[2].trim());
    } else {
      if (inOptions && line.trim() === "") continue; // skip blank lines inside option block
      if (inOptions) {
        // Non-option line after options started — push remaining to text
        textLines.push(...optionLines.map((_, i) => lines.find((l) => l.includes(optionLines[i]))).filter(Boolean));
        optionLines.length = 0;
        inOptions = false;
      }
      textLines.push(line);
    }
  }

  return {
    text: textLines.join("\n").trim(),
    options: optionLines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — always emit numbered options for choice questions
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(priorIntake) {
  const base = `You are the Buyer Companion™, the AI-powered readiness guide from LoanCert™ — an independent buyer certification platform. Your job is to walk a homebuyer through a warm, professional intake conversation that helps assess their readiness to purchase a home.

You are NOT a lender. You make no credit decisions, no loan approvals, and no rate quotes. You are neutral and independent. Your tone is warm, confident, and encouraging.

FORMATTING RULES — critical:
- When a question has discrete choices, always list them as a numbered list on separate lines, like:
  1. Option one
  2. Option two
  3. Option three
- Never use bullet points (•, -, *) for choices — only numbered lists.
- After the numbered options, do NOT add any trailing text.
- Free-form questions (price range, down payment amount) do NOT need numbered options — just ask naturally.
- One question at a time. Always.
- Acknowledge their answer before asking the next question. Be specific, not generic.
- Never use filler phrases like "Great!", "Awesome!", "Absolutely!"
- Never ask for SSN, full name, address, or date of birth.
- If someone seems anxious, reassure them: LoanCert is independent — no lender agenda, no spam, no hard pull.
- Keep each message under 120 words.
- When the buyer confirms they're ready to start verification, respond: "CONVERSATION_COMPLETE" followed immediately by a JSON block:
{"timeline":"...","priceRange":"...","firstTimeBuyer":true/false,"incomeType":"...","creditRange":"...","downPayment":"...","summary":"..."}`;

  if (priorIntake) {
    return `${base}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETURNING USER — PRIOR SESSION DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This buyer has spoken with you before:
${JSON.stringify(priorIntake, null, 2)}

RETURNING USER FLOW:
1. Warm welcome back. Reference 1–2 specifics from their prior intake. Ask if anything has changed.
2. If nothing changed: confirm each data point, let them update any that shifted.
3. If things changed: treat as fresh intake but skip confirmed fields.
4. Summary & CTA: synthesize current situation. End with the verification prompt.
Do NOT re-ask questions they've already answered unless they signal a change.`;
  }

  return `${base}

NEW USER CONVERSATION FLOW:
Step 1 — Welcome already shown in UI. Skip it.
Step 2 — Purchase Timeline. Ask when they're hoping to buy. Offer these choices:
1. Right away / ASAP
2. 1–3 months
3. 3–6 months
4. 6–12 months
5. Just exploring

Step 3 — Price Range. Ask what price range or area they're targeting. Free-form — no numbered list needed.

Step 4 — First-Time Buyer. Ask if this is their first purchase or if they've bought before:
1. First-time buyer
2. I've purchased before

Step 5 — Income Type. Ask how they earn their income:
1. W-2 employee
2. Self-employed / 1099
3. Retired / fixed income
4. Combination
5. Other

Step 6 — Credit Awareness. Ask for their general credit score range (no pull here):
1. Excellent — 740 or above
2. Good — 680 to 739
3. Fair — 620 to 679
4. Not sure

Step 7 — Down Payment. Ask what they're thinking for a down payment. Free-form — no numbered list needed.

Step 8 — Summary & CTA. Synthesize a warm 3–4 sentence summary of their situation. Highlight strengths. Note what verification will clarify. End with: "Based on what you've shared, you're ready to start your LoanCert™ verification — it takes about 10–15 minutes and there's no hard credit pull." Then ask if they're ready:
1. Yes, let's do it
2. I have a question first`;
}

function buildWelcomeMessage(priorIntake, lastSeen) {
  if (priorIntake) {
    const date = lastSeen
      ? new Date(lastSeen).toLocaleDateString("en-US", { month: "long", day: "numeric" })
      : "recently";
    return {
      role: "assistant",
      content: `Welcome back — good to see you again.\n\nWhen we last spoke on ${date}, you were targeting **${priorIntake.priceRange}** with a **${priorIntake.timeline}** timeline. Has anything changed since then?\n\n1. Nothing's changed — let's pick up where we left off\n2. A few things have changed`,
    };
  }
  return {
    role: "assistant",
    content: `Hi there — welcome to Buyer Companion™ by LoanCert™.\n\nI'm here to help you understand where you stand as a buyer before you ever talk to a lender. No sales pitch, no credit pull, no pressure.\n\nLet's start simple. When are you hoping to buy a home?\n\n1. Right away / ASAP\n2. 1–3 months\n3. 3–6 months\n4. 6–12 months\n5. Just exploring for now`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "14px 18px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%", background: "#4EB3E8",
          animation: "bounce 1.2s ease-in-out infinite",
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
    </div>
  );
}

function QuickReplies({ options, onSelect, disabled }) {
  if (!options || options.length === 0) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 8,
      marginLeft: 44, marginBottom: 16, marginTop: -6,
      animation: "fadeUp 0.35s ease",
    }}>
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => !disabled && onSelect(`${i + 1}. ${opt}`)}
          disabled={disabled}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 20, padding: "7px 14px",
            cursor: disabled ? "not-allowed" : "pointer",
            color: "#fff", fontFamily: "'Barlow', sans-serif", fontSize: 13,
            transition: "all 0.15s ease",
            opacity: disabled ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.background = "rgba(0,148,68,0.15)";
              e.currentTarget.style.borderColor = "rgba(0,148,68,0.5)";
              e.currentTarget.style.color = "#fff";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            e.currentTarget.style.color = "#fff";
          }}
        >
          <span style={{
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
            background: "rgba(0,148,68,0.2)", border: "1px solid rgba(0,148,68,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#009444", fontWeight: 700,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>{i + 1}</span>
          {opt}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ msg, isLatest, onOptionSelect, optionsDisabled }) {
  const isBot = msg.role === "assistant";
  const { text, options } = isBot ? parseOptions(msg.content) : { text: msg.content, options: [] };
  const [displayed, setDisplayed] = useState(isLatest && isBot ? "" : text);
  const [showOptions, setShowOptions] = useState(!isLatest && isBot && options.length > 0);

  useEffect(() => {
    if (!isLatest || !isBot) return;
    setDisplayed("");
    setShowOptions(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        if (options.length > 0) setShowOptions(true);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [msg.content, isLatest, isBot]);

  const formatText = (t) => t.split("\n").map((line, i) => {
    const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    return <p key={i} style={{ margin: "2px 0" }} dangerouslySetInnerHTML={{ __html: bold }} />;
  });

  return (
    <>
      <div style={{
        display: "flex", justifyContent: isBot ? "flex-start" : "flex-end",
        marginBottom: (isBot && showOptions && options.length > 0) ? 8 : 16,
        animation: isLatest ? "fadeUp 0.3s ease" : "none",
      }}>
        {isBot && (
          <div style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #009444, #007a38)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginRight: 10, marginTop: 2, fontSize: 14, color: "#fff", fontWeight: 700,
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
          }}>BC</div>
        )}
        <div style={{
          maxWidth: "75%",
          background: isBot ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, #009444, #007a38)",
          border: isBot ? "1px solid rgba(255,255,255,0.08)" : "none",
          borderRadius: isBot ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
          padding: "12px 16px", color: "#fff", fontSize: 14,
          lineHeight: 1.65, fontFamily: "'Barlow', sans-serif",
        }}>
          {formatText(displayed)}
        </div>
      </div>

      {isBot && showOptions && (
        <QuickReplies
          options={options}
          onSelect={onOptionSelect}
          disabled={optionsDisabled}
        />
      )}
    </>
  );
}

function ReturningUserBadge({ priorIntake, sessionCount }) {
  if (!priorIntake) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
      background: "rgba(78,179,232,0.08)", border: "1px solid rgba(78,179,232,0.2)",
      borderRadius: 8, marginBottom: 16, animation: "fadeUp 0.4s ease",
    }}>
      <span style={{ color: "#4EB3E8", fontSize: 12 }}>↩</span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'Barlow', sans-serif" }}>
        Returning buyer · Session {(sessionCount || 1) + 1} · Prior intake on file
      </span>
      <div style={{ marginLeft: "auto", fontSize: 10, color: "#4EB3E8", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>Record loaded</div>
    </div>
  );
}

function PriorIntakePanel({ priorIntake, onClose }) {
  const fields = [
    { label: "Timeline", value: priorIntake.timeline },
    { label: "Price Range", value: priorIntake.priceRange },
    { label: "First-Time Buyer", value: priorIntake.firstTimeBuyer ? "Yes" : "No" },
    { label: "Income Type", value: priorIntake.incomeType },
    { label: "Credit Range", value: priorIntake.creditRange },
    { label: "Down Payment", value: priorIntake.downPayment },
  ];
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(13,27,46,0.97)", borderRadius: 20, zIndex: 10,
      padding: 24, overflowY: "auto", animation: "fadeUp 0.3s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: "#4EB3E8", letterSpacing: 1 }}>PRIOR INTAKE ON FILE</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'Barlow', sans-serif" }}>From your last session</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20 }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", marginBottom: 20 }}>
        {fields.map((f) => (
          <div key={f.label}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: "#fff", fontFamily: "'Barlow', sans-serif" }}>{f.value || "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "'Barlow', sans-serif", lineHeight: 1.6, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10 }}>
        {priorIntake.summary}
      </div>
    </div>
  );
}

function CompletionCard({ data, onStartVerification }) {
  const fields = [
    { label: "Timeline", value: data.timeline },
    { label: "Price Range", value: data.priceRange },
    { label: "First-Time Buyer", value: data.firstTimeBuyer ? "Yes" : "No" },
    { label: "Income Type", value: data.incomeType },
    { label: "Credit Range", value: data.creditRange },
    { label: "Down Payment", value: data.downPayment },
  ];
  return (
    <div style={{ margin: "24px 0", background: "rgba(0,148,68,0.08)", border: "1px solid rgba(0,148,68,0.3)", borderRadius: 16, padding: 24, animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#009444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✓</div>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: "#009444", letterSpacing: 1 }}>INTAKE COMPLETE</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'Barlow', sans-serif" }}>Buyer Companion™ Step 1 · Saved to your record</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16 }}>
        {fields.map((f) => (
          <div key={f.label}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: "#fff", fontFamily: "'Barlow', sans-serif" }}>{f.value || "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "'Barlow', sans-serif", marginBottom: 16, lineHeight: 1.6 }}>{data.summary}</div>
      <button onClick={onStartVerification} style={{
        width: "100%", padding: "14px 0",
        background: "linear-gradient(135deg, #009444, #007a38)",
        border: "none", borderRadius: 10, color: "#fff",
        fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700,
        letterSpacing: 1.5, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,148,68,0.4)",
      }}>START MY LOANCERT™ VERIFICATION →</button>
    </div>
  );
}

function DemoSwitcher({ userId, onSwitch }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", marginRight: 4, alignSelf: "center" }}>Demo:</span>
      {["demo-new", "demo-returning"].map((id) => (
        <button key={id} onClick={() => onSwitch(id)} style={{
          padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11,
          fontFamily: "'Barlow', sans-serif", letterSpacing: 0.5,
          background: userId === id ? "#009444" : "rgba(255,255,255,0.07)",
          color: userId === id ? "#fff" : "rgba(255,255,255,0.4)",
          transition: "all 0.2s",
        }}>
          {id === "demo-new" ? "New Buyer" : "Returning Buyer"}
        </button>
      ))}
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Barlow', sans-serif", alignSelf: "center", marginLeft: "auto" }}>userId → from auth when live</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// Props: userId, onComplete(userId, sessionId, intakeJson), onStartVerify(...)
// ─────────────────────────────────────────────────────────────────────────────

export default function BuyerCompanion({ userId: propUserId, onComplete, onStartVerify }) {
  const [userId, setUserId] = useState(propUserId || "demo-new");
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [sessionData, setSessionData] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [completed, setCompleted] = useState(null);
  const [showPriorIntake, setShowPriorIntake] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setPageLoading(true);
      setCompleted(null);
      setShowPriorIntake(false);
      const data = await loadUserSession(userId);
      if (cancelled) return;
      setSessionData(data);
      setMessages([buildWelcomeMessage(data?.priorIntake, data?.lastSeen)]);
      setPageLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, completed]);

  const submitMessage = async (text) => {
    if (!text.trim() || thinking || completed) return;
    setInput("");

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setThinking(true);
    saveMessage(userId, sessionId, "user", text);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(sessionData?.priorIntake),
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      const replyText = data.content?.find((b) => b.type === "text")?.text || "";

      if (replyText.includes("CONVERSATION_COMPLETE")) {
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            await saveIntakeRecord(userId, sessionId, parsed);
            onComplete?.(userId, sessionId, parsed);
            setCompleted(parsed);
            const cleanReply = replyText.replace("CONVERSATION_COMPLETE", "").replace(jsonMatch[0], "").trim();
            if (cleanReply) {
              setMessages((prev) => [...prev, { role: "assistant", content: cleanReply }]);
              saveMessage(userId, sessionId, "assistant", cleanReply);
            }
          } catch {}
        }
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
        saveMessage(userId, sessionId, "assistant", replyText);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong — please try again in a moment." }]);
    }

    setThinking(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitMessage(input); }
  };

  const handleStartVerify = () => {
    onStartVerify?.(userId, sessionId, completed);
    const params = new URLSearchParams({ ref: sessionId, ...(userId && !userId.startsWith("demo") && { uid: userId }) });
    window.open(`https://loancert.floify.com?${params.toString()}`, "_blank");
  };

  const isReturning = !!sessionData?.priorIntake;
  // Only the last bot message shows active quick replies
  const lastBotIndex = [...messages].map((m, i) => m.role === "assistant" ? i : -1).filter(i => i >= 0).pop();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600&family=Barlow+Condensed:wght@500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D1B2E; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        textarea:focus { outline: none; }
        textarea { resize: none; }
      `}</style>

      <div style={{
        minHeight: "100vh", background: "#0D1B2E",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "'Barlow', sans-serif",
        backgroundImage: "radial-gradient(ellipse at 20% 20%, rgba(0,148,68,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(78,179,232,0.05) 0%, transparent 60%)",
      }}>
        <div style={{ width: "100%", maxWidth: 680 }}>

          <DemoSwitcher userId={userId} onSwitch={(id) => setUserId(id)} />

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, letterSpacing: 1 }}>
              <span style={{ color: "#fff" }}>LOAN</span>
              <span style={{ background: "#009444", color: "#fff", borderRadius: 8, padding: "2px 10px", marginLeft: 3, display: "flex", alignItems: "center", gap: 5 }}>
                CERT <span style={{ fontSize: 14 }}>✓</span>
              </span>
            </div>
            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)" }} />
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: "#4EB3E8", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>Buyer Companion™</div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              {isReturning && (
                <button onClick={() => setShowPriorIntake(true)} style={{
                  background: "rgba(78,179,232,0.1)", border: "1px solid rgba(78,179,232,0.25)",
                  borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#4EB3E8",
                  fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase",
                }}>View Prior Record</button>
              )}
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>Step 1 of 3</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {[1, 2, 3].map((s) => (
                    <div key={s} style={{ width: s === 1 ? 24 : 8, height: 4, borderRadius: 4, background: s === 1 ? "#009444" : "rgba(255,255,255,0.1)", transition: "all 0.3s ease" }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <ReturningUserBadge priorIntake={sessionData?.priorIntake} sessionCount={sessionData?.sessionCount} />

          {/* Chat Window */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.4)", position: "relative" }}>

            {showPriorIntake && sessionData?.priorIntake && (
              <PriorIntakePanel priorIntake={sessionData.priorIntake} onClose={() => setShowPriorIntake(false)} />
            )}

            {/* Trust bar */}
            <div style={{ display: "flex", gap: 20, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}>
              {["No hard credit pull", "No lender affiliation", "Bank-grade encryption"].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#009444", fontSize: 10 }}>✓</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "'Barlow', sans-serif" }}>{t}</span>
                </div>
              ))}
              <div style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.15)", fontFamily: "monospace" }}>sid: {sessionId.slice(-8)}</div>
            </div>

            {/* Messages */}
            <div style={{ height: 460, overflowY: "auto", padding: "24px 20px 8px" }}>
              {pageLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
                  <div style={{ width: 20, height: 20, border: "2px solid rgba(0,148,68,0.3)", borderTop: "2px solid #009444", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>Loading your record…</span>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <MessageBubble
                      key={`${userId}-${i}`}
                      msg={msg}
                      isLatest={i === messages.length - 1}
                      onOptionSelect={(val) => submitMessage(val)}
                      optionsDisabled={thinking || !!completed || i !== lastBotIndex}
                    />
                  ))}
                  {thinking && (
                    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 16 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #009444, #007a38)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, fontSize: 14, color: "#fff", fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>BC</div>
                      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px 18px 18px 18px" }}>
                        <TypingIndicator />
                      </div>
                    </div>
                  )}
                  {completed && <CompletionCard data={completed} onStartVerification={handleStartVerify} />}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)", display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={thinking || !!completed || pageLoading}
                placeholder={completed ? "Intake complete — click above to continue" : "Tap a choice above or type your answer…"}
                rows={1}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
                  padding: "12px 16px", color: "#fff", fontSize: 14,
                  fontFamily: "'Barlow', sans-serif", lineHeight: 1.5,
                  opacity: (completed || pageLoading) ? 0.4 : 1, transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "rgba(0,148,68,0.5)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
              <button
                onClick={() => submitMessage(input)}
                disabled={thinking || !input.trim() || !!completed || pageLoading}
                style={{
                  width: 44, height: 44, borderRadius: 12, border: "none",
                  background: input.trim() && !thinking && !completed ? "linear-gradient(135deg, #009444, #007a38)" : "rgba(255,255,255,0.08)",
                  color: "#fff", cursor: input.trim() && !thinking && !completed ? "pointer" : "not-allowed",
                  fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease", flexShrink: 0,
                  boxShadow: input.trim() && !thinking ? "0 4px 12px rgba(0,148,68,0.35)" : "none",
                }}>↑</button>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Barlow', sans-serif", letterSpacing: 0.5 }}>
            LoanCert Inc. © 2025 · Independent Buyer Verification™ · Not a lender · No credit decisions made here
          </div>
        </div>
      </div>
    </>
  );
}
