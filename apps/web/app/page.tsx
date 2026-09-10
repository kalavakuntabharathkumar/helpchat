"use client";
import { useState } from "react";

export default function Chat() {
  const [messages,setMessages] = useState<{role:string,content:string}[]>([]);
  const [input,setInput] = useState("");
  const [busy,setBusy] = useState(false);

  async function send() {
    if (!input.trim() || busy) return;
    const question = input.trim();
    setInput("");
    setMessages(m => [...m,{role:"user",content:question},{role:"assistant",content:""}]);
    setBusy(true);
    const r = await fetch("http://localhost:4100/api/chat", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:question,history:messages})
    });
    const reader = r.body?.getReader();
    if (!reader) { setBusy(false); return; }
    const decoder = new TextDecoder();
    let buffer = "";
    while(true) {
      const {value,done} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value,{stream:true});
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for(const event of events) {
        if(!event.startsWith("data: ")) continue;
        const data = JSON.parse(event.slice(6));
        if(data.token) setMessages(m => {
          const copy=[...m]; copy[copy.length-1]={...copy[copy.length-1],content:copy[copy.length-1].content+data.token}; return copy;
        });
      }
    }
    setBusy(false);
  }

  return <main>
    <h1>AI Support Assistant</h1>
    <p className="sub">Context retrieval · streaming · trace-ready</p>
    <section className="chat">{messages.map((m,i)=><div key={i} className={m.role}>{m.content}</div>)}</section>
    <div className="composer"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about refunds, orders, payments..." /><button onClick={send}>{busy?"...":"Send"}</button></div>
  </main>;
}
