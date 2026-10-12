import { useState } from "react";
import { createRoot } from "react-dom/client";

type Msg = { role: "user" | "assistant"; content: string };
const API = "http://localhost:3001";
const sessionId = crypto.randomUUID();

const css = `
html{background:linear-gradient(#1e1b4b,#5b21b6 55%,#fb923c) fixed!important}body,#root{background:none!important}
body{margin:0;min-height:100vh;color:#fff;font:15px Inter,system-ui,sans-serif;overflow-x:hidden}
body::before,body::after{content:"ACME CLOUD   ACME CLOUD   ACME CLOUD   ACME CLOUD";position:fixed;left:0;z-index:0;pointer-events:none;white-space:pre;font:800 120px Inter,system-ui,sans-serif;color:#ffffff26;animation:mv 45s linear infinite}
body::before{top:6vh}body::after{top:48vh;font-size:84px;color:#ffffff45;animation:mr 20s linear infinite}
@keyframes mv{to{transform:translateX(-50%)}}@keyframes mr{from{transform:translateX(-50%)}}@keyframes in{from{opacity:0;transform:translateY(10px)}}@keyframes p{50%{opacity:.4}}
.app{position:relative;z-index:1;max-width:680px;margin:0 auto;padding:20px}
h2{margin:0 0 14px;font-size:20px;font-weight:600;letter-spacing:.5px}
h2::before{content:"";display:inline-block;width:9px;height:9px;margin-right:10px;border-radius:50%;background:#4ade80;box-shadow:0 0 10px #4ade80;animation:p 2s infinite}
.row{display:flex;margin:10px 0;animation:in .3s ease}.row.u{justify-content:flex-end}
.b{white-space:pre-wrap;max-width:85%;padding:10px 14px;line-height:1.55;border-radius:16px 16px 16px 4px;background:#ffffff1f;border:1px solid #ffffff33;backdrop-filter:blur(12px)}
.u .b{background:#fff;color:#2e1065;border:0;border-radius:16px 16px 4px 16px;font-weight:500}
.dots{letter-spacing:3px;animation:p 1s infinite}
.bar{position:sticky;bottom:16px;display:flex;gap:8px;margin-top:20px;padding:6px 6px 6px 16px;border-radius:14px;background:#ffffff26;border:1px solid #ffffff40;backdrop-filter:blur(14px)}
.bar:focus-within{box-shadow:0 0 0 2px #ffffff66}
.bar input{flex:1;background:none;border:0;outline:0;color:#fff;font:inherit}.bar input::placeholder{color:#e9d5ff}
.bar button{border:0;border-radius:10px;padding:10px 20px;font-weight:600;background:#fff;color:#2e1065;cursor:pointer}.bar button:disabled{opacity:.5}
`;

function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    let acc = "";
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, promptVersion: "v2" }),
      });
      if (!res.body) throw new Error("empty response");
      // read the streamed response chunk by chunk and grow the last bubble
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
      }
    } catch {
      // server down / network error: show a message instead of a stuck "..."
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: acc || "Sorry, I could not reach the server. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <style>{css}</style>
      <h2>Acme Support</h2>
      {msgs.map((m, i) => (
        <div key={i} className={`row ${m.role === "user" ? "u" : ""}`}>
          <span className="b">{m.content || <span className="dots">●●●</span>}</span>
        </div>
      ))}
      <div className="bar">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask Acme Cloud anything..." />
        <button onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);