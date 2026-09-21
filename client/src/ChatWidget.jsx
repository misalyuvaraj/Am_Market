import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { api } from "./api";
import { useLang, useT } from "./i18n";

export default function ChatWidget() {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState("live-ml");
  const [engines, setEngines] = useState([]);
  const [disclaimer, setDisclaimer] = useState(t("legal.disclaimer"));
  const [msgs, setMsgs] = useState([{ role: "assistant", content: t("chat.hello") }]);
  const box = useRef(null);

  useEffect(() => {
    api("/api/ai/engines")
      .then((d) => {
        setEngines(d.engines || []);
        if (d.disclaimer) setDisclaimer(d.disclaimer);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function openChat() {
      setOpen(true);
    }
    window.addEventListener("am-open-chat", openChat);
    return () => window.removeEventListener("am-open-chat", openChat);
  }, []);

  useEffect(() => {
    setMsgs([{ role: "assistant", content: t("chat.hello") }]);
  }, [lang, t]);

  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [msgs, open]);

  async function send(text = input) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    const next = [...msgs, { role: "user", content: message }];
    setMsgs(next);
    setBusy(true);
    try {
      const data = await api("/api/chat", {
        method: "POST",
        body: { message, history: next.slice(-8), lang, engine }
      });
      if (data.disclaimer) setDisclaimer(data.disclaimer);
      setMsgs([...next, { role: "assistant", content: data.reply, engine: data.engine }]);
    } catch (err) {
      setMsgs([...next, { role: "assistant", content: `${t("chat.error")}: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn" style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40 }} onClick={() => setOpen(true)}>
        <Bot size={16} style={{ verticalAlign: "middle" }} /> {t("chat.open")}
      </button>
    );
  }

  return (
    <div className="chat-dock card">
      <div className="row">
        <h3 style={{ margin: 0 }}><Bot size={16} /> {t("chat.title")}</h3>
        <button className="btn ghost" onClick={() => setOpen(false)}><X size={14} /></button>
      </div>
      <div className="chips" style={{ margin: "8px 0" }}>
        {(engines.length ? engines : [
          { id: "openai", label: "OpenAI", ready: false },
          { id: "claude", label: "Claude", ready: false },
          { id: "gemini", label: "Gemini", ready: false },
          { id: "live-ml", label: "Desk ML", ready: true }
        ]).map((e) => (
          <button
            key={e.id}
            type="button"
            className={`chip ${engine === e.id ? "on" : ""}`}
            onClick={() => setEngine(e.id)}
            title={e.ready ? e.label : t("chat.engineOff")}
          >
            {e.label}{e.ready ? "" : " · off"}
          </button>
        ))}
      </div>
      <div className="messages" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "user" ? "me" : "bot"}`}>
            {m.content}
            {m.engine ? <div className="muted" style={{ marginTop: 6 }}>engine · {m.engine}</div> : null}
          </div>
        ))}
        {busy ? <div className="muted">{t("chat.reading")}</div> : null}
      </div>
      <div className="chips" style={{ margin: "8px 0" }}>
        {["chat.q1", "chat.q2", "chat.q3", "chat.q4", "chat.q5"].map((q) => (
          <button key={q} className="chip" onClick={() => send(t(q))}>{t(q)}</button>
        ))}
      </div>
      <div className="row">
        <input className="field" value={input} placeholder={t("chat.placeholder")} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn" onClick={() => send()} disabled={busy}><Send size={14} /></button>
      </div>
      <p className="legal-line">{disclaimer}</p>
    </div>
  );
}
