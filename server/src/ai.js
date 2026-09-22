import { getFastQuotes, getNewsBundle, getTechnicals, liveNews } from "./market.js";
import { getOptionChain, getOiAnalysis } from "./options.js";
import { analyzeSymbol, mlSnapshot } from "./ml.js";
import { detectSymbol, NIFTY50 } from "./universe.js";
import { freshTickers, liveAgeMs, liveQuote } from "./snapshot.js";

async function liveOrTickers() {
  const live = freshTickers(8000);
  if (live) return live;
  try {
    return await getFastQuotes();
  } catch {
    return freshTickers(60000) || { session: {}, nifty: null };
  }
}

function snapshotText(t, oc, tech) {
  const n = t.nifty || {};
  const s = t.sensex || {};
  const b = t.banknifty || {};
  const btc = t.btc || {};
  const vix = t.vix || {};
  const age = liveAgeMs();
  const named = tech?.symbol && tech.price != null ? `${tech.symbol} LIVE ${tech.price} (${tech.changePct}%)` : "";
  return [
    `LIVE tape age ${age != null ? Math.round(age / 1000) + "s" : "boot"} | IST ${t.session?.ist} | NSE session: ${t.session?.state}`,
    `NIFTY ${n.price} (${n.changePct}%) high ${n.high} low ${n.low}`,
    `SENSEX ${s.price} (${s.changePct}%)`,
    `BANKNIFTY ${b.price} (${b.changePct}%)`,
    `India VIX ${vix.price} (${vix.changePct}%)`,
    `BTC ${btc.price} USD (${btc.changePct}%)`,
    named,
    oc
      ? `Option chain ${oc.symbol} spot ${oc.spot} PCR ${oc.pcr} MaxPain ${oc.maxPain} ATM IV ${oc.atmIv} support ${oc.support} resistance ${oc.resistance} expiry ${oc.expiry}`
      : "",
    tech ? `Technicals ${tech.symbol} bias ${tech.bias} RSI ${tech.rsi} SMA20 ${tech.sma20} SMA50 ${tech.sma50} SMA200 ${tech.sma200}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export async function marketPulse() {
  try {
  const [tickers, oi, tech, news, ml] = await Promise.allSettled([
    liveOrTickers(),
    getOiAnalysis("NIFTY"),
    getTechnicals("NIFTY"),
    liveNews("nse"),
    analyzeSymbol("NIFTY")
  ]);
  const t = tickers.status === "fulfilled" ? tickers.value : {};
  const chain = oi.status === "fulfilled" ? oi.value : null;
  const technicals = tech.status === "fulfilled" ? tech.value : null;
  const headlines =
    news.status === "fulfilled" && Array.isArray(news.value) && news.value.length
      ? news.value.slice(0, 12)
      : (t.news || []).slice(0, 12);
  const mlPack = ml.status === "fulfilled" ? ml.value : null;

  let score = 50;
  const reasons = [];
  if ((t.nifty?.changePct || 0) > 0.3) {
    score += 8;
    reasons.push("Nifty is printing a positive session.");
  } else if ((t.nifty?.changePct || 0) < -0.3) {
    score -= 8;
    reasons.push("Nifty is under pressure in the live tape.");
  }
  if (chain) {
    if (chain.pcr > 1.1) {
      score += 7;
      reasons.push(`PCR ${chain.pcr} shows put writing / bullish positioning.`);
    } else if (chain.pcr < 0.8) {
      score -= 7;
      reasons.push(`PCR ${chain.pcr} shows call writing / cautious bias.`);
    }
    if (chain.spot > chain.maxPain) {
      score += 4;
      reasons.push(`Spot is above max pain ${chain.maxPain}.`);
    } else {
      score -= 3;
      reasons.push(`Spot is below max pain ${chain.maxPain}.`);
    }
    reasons.push(`OI support ${chain.support}, OI resistance ${chain.resistance}.`);
  }
  if (technicals) {
    score += technicals.score * 3;
    reasons.push(`Daily technical bias is ${technicals.bias} (RSI ${technicals.rsi}).`);
  }
  if ((t.vix?.changePct || 0) > 3) {
    score -= 6;
    reasons.push("India VIX is spiking — expect wider ranges.");
  } else if ((t.vix?.price || 16) < 13) {
    score += 2;
    reasons.push("VIX is subdued — premium selling setups are more common.");
  }
  if ((t.btc?.changePct || 0) > 2) reasons.push("Bitcoin risk-on tape can spill into global risk assets.");
  if ((t.btc?.changePct || 0) < -2) reasons.push("Bitcoin is risk-off; watch financials and high-beta names.");
  if (mlPack) {
    score = Math.round(score * 0.55 + mlPack.score * 0.45);
    reasons.push(`ML pattern lean ${mlPack.lean} (${mlPack.confidence}% confidence, ${mlPack.horizon}).`);
    (mlPack.alerts || []).slice(0, 2).forEach((a) => reasons.push(a.text));
  }

  score = Math.max(8, Math.min(92, score));
  const bias = score >= 58 ? "Bullish" : score <= 42 ? "Bearish" : "Range / Mixed";
  return {
    bias,
    score: Math.round(score),
    summary:
      bias === "Bullish"
        ? "Live data leans constructive. Prefer defined-risk bullish spreads unless VIX explodes."
        : bias === "Bearish"
          ? "Live data leans defensive. Hedges and put spreads have better odds than naked longs."
          : "Tape is two-sided. Iron condors / spreads around max pain are cleaner than directional hero trades.",
    reasons,
    chain: chain
      ? {
          symbol: chain.symbol,
          spot: chain.spot,
          pcr: chain.pcr,
          maxPain: chain.maxPain,
          support: chain.support,
          resistance: chain.resistance,
          atmIv: chain.atmIv,
          expiry: chain.expiry
        }
      : null,
    technicals: technicals
      ? {
          symbol: technicals.symbol,
          bias: technicals.bias,
          score: technicals.score,
          rsi: technicals.rsi,
          sma20: technicals.sma20,
          sma50: technicals.sma50,
          sma200: technicals.sma200
        }
      : null,
    headlines,
    ml: mlPack
      ? {
          symbol: mlPack.symbol,
          lean: mlPack.lean,
          score: mlPack.score,
          confidence: mlPack.confidence,
          rsi: mlPack.technicals?.rsi,
          macd: mlPack.technicals?.macd,
          sentiment: mlPack.sentiment?.bias,
          vol20: mlPack.risk?.realizedVol20,
          volumeRatio: mlPack.history?.volumeRatio,
          lastVolume: mlPack.history?.lastVolume,
          trend: mlPack.trend?.bias,
          risk: mlPack.risk?.volRegime,
          alerts: (mlPack.alerts || []).slice(0, 4)
        }
      : null,
    vix: t.vix ? { price: t.vix.price, changePct: t.vix.changePct } : null,
    quotes: {
      nifty: t.nifty ? { price: t.nifty.price, changePct: t.nifty.changePct } : null,
      sensex: t.sensex ? { price: t.sensex.price, changePct: t.sensex.changePct } : null,
      banknifty: t.banknifty ? { price: t.banknifty.price, changePct: t.banknifty.changePct } : null,
      btc: t.btc ? { price: t.btc.price, changePct: t.btc.changePct } : null
    },
    live: true,
    tapeAgeMs: liveAgeMs(),
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString()
  };
  } catch (err) {
    return {
      bias: "Range / Mixed",
      score: 50,
      summary: "Pulse is rebuilding from the live tape. Quotes are still streaming in the header.",
      reasons: [err.message || "Temporary pulse feed error"],
      chain: null,
      technicals: null,
      headlines: [],
      ml: null,
      vix: null,
      disclaimer: DISCLAIMER,
      generatedAt: new Date().toISOString()
    };
  }
}

function wantsStockRead(q) {
  return /\b(bias|lean|trend|rsi|macd|ml|analy[sz]e|outlook|view|sentiment|predict|target|buy|sell|बायस|ट्रेंड)\b/i.test(q);
}

function stockReply(ml, lang = "en") {
  if (!ml) return "";
  const name = ml.name || ml.symbol;
  const px = ml.price;
  const chg = ml.changePct;
  const chgTxt = `${chg >= 0 ? "+" : ""}${chg}%`;
  const alert = (ml.alerts || [])[0]?.text || "";
  if (lang === "hi") {
    return `${name} (${ml.symbol}) लाइव ${px} (${chgTxt})।
ML बायस: ${ml.lean} (स्कोर ${ml.score}, विश्वास ${ml.confidence}%) — ${ml.horizon}।
ट्रेंड ${ml.trend?.bias || "—"} · RSI ${ml.technicals?.rsi ?? "—"} · MACD ${ml.technicals?.macd ?? "—"} · 20दिन वोल ${ml.risk?.realizedVol20 ?? "—"}%।
सेंटिमेंट ${ml.sentiment?.bias || "—"} · 52w ${ml.financials?.week52Low ?? "—"}–${ml.financials?.week52High ?? "—"}।
${alert}
यह इतिहास का पैटर्न स्कोर है, गारंटी वाला ट्रेड नहीं।`;
  }
  if (lang === "mr") {
    return `${name} (${ml.symbol}) लाइव्ह ${px} (${chgTxt}).
ML बायस: ${ml.lean} (स्कोर ${ml.score}, विश्वास ${ml.confidence}%) — ${ml.horizon}.
ट्रेंड ${ml.trend?.bias || "—"} · RSI ${ml.technicals?.rsi ?? "—"} · MACD ${ml.technicals?.macd ?? "—"} · 20दिवस व्होल ${ml.risk?.realizedVol20 ?? "—"}%.
सेंटिमेंट ${ml.sentiment?.bias || "—"} · 52w ${ml.financials?.week52Low ?? "—"}–${ml.financials?.week52High ?? "—"} .
${alert}
हा इतिहासाचा पॅटर्न स्कोर आहे, हमीचा ट्रेड नाही.`;
  }
  return `${name} (${ml.symbol}) is live at ${px} (${chgTxt}).
ML bias: ${ml.lean} (score ${ml.score}, confidence ${ml.confidence}%) over ${ml.horizon}.
Trend ${ml.trend?.bias || "—"} · RSI ${ml.technicals?.rsi ?? "—"} · MACD ${ml.technicals?.macd ?? "—"} · 20d vol ${ml.risk?.realizedVol20 ?? "—"}%.
News tone ${ml.sentiment?.bias || "—"} · 52-week ${ml.financials?.week52Low ?? "—"} – ${ml.financials?.week52High ?? "—"}.
${ml.forecast?.summary || ""}
${alert}
Educational pattern read from live history — not a guaranteed call.`;
}

function localBrain(question, ctx, lang = "en") {
  const q = question.toLowerCase();
  const t = ctx.tickers || {};
  const n = t.nifty || {};
  const chain = ctx.chain;
  const hi = lang === "hi";
  const mr = lang === "mr";
  const asked = detectSymbol(question, "");
  const namedStock = asked && asked !== "NIFTY" && (ctx.ml?.symbol === asked || NIFTY50.some((s) => s.symbol === asked));
  if (ctx.ml && (namedStock || wantsStockRead(q))) {
    return stockReply(ctx.ml, lang);
  }
  if (q.includes("btc") || q.includes("bitcoin") || q.includes("बिटकॉइन")) {
    if (hi) return `बिटकॉइन लाइव ${t.btc?.price} USD (${t.btc?.changePct}%) पर है। क्रिप्टो 24x7 चलता है, इसलिए GIFT निफ्टी के ओवरनाइट रिस्क को लीड कर सकता है।`;
    if (mr) return `बिटकॉइन लाइव्ह ${t.btc?.price} USD (${t.btc?.changePct}%) वर आहे. क्रिप्टो 24x7 चालते, त्यामुळे GIFT निफ्टीच्या ओव्हरनाइट जोखमीला दिशा देऊ शकते.`;
    return `Bitcoin is live at ${t.btc?.price} USD (${t.btc?.changePct}%). Crypto trades 24x7 so it can lead overnight risk for GIFT Nifty. If BTC is sharply down, fade aggressive long Nifty overnight exposure; if BTC is ripping with calm VIX, high-beta risk appetite usually improves.`;
  }
  if (q.includes("ml") || q.includes("rsi") || q.includes("macd") || q.includes("predict") || q.includes("sentiment") || q.includes("bias") || q.includes("बायस")) {
    if (ctx.ml) return stockReply(ctx.ml, lang);
    const ml = ctx.pulse?.ml;
    if (hi) return `ML पैटर्न झुकाव ${ml?.lean || ctx.pulse?.bias} (स्कोर ${ml?.score || ctx.pulse?.score}, विश्वास ${ml?.confidence || "—"}%)। RSI ${ml?.rsi ?? "—"}, MACD ${ml?.macd ?? "—"}, समाचार ${ml?.sentiment || "—"}। यह इतिहास का स्कोर है, गारंटी नहीं।`;
    if (mr) return `ML पॅटर्न कल ${ml?.lean || ctx.pulse?.bias} (स्कोर ${ml?.score || ctx.pulse?.score}, विश्वास ${ml?.confidence || "—"}%). RSI ${ml?.rsi ?? "—"}, MACD ${ml?.macd ?? "—"}, बातम्या ${ml?.sentiment || "—"}. हा इतिहासाचा स्कोर आहे, हमी नाही.`;
    return `ML pattern lean is ${ml?.lean || ctx.pulse?.bias} (score ${ml?.score || ctx.pulse?.score}, confidence ${ml?.confidence || "—"}%). RSI ${ml?.rsi ?? "—"}, MACD ${ml?.macd ?? "—"}, news tone ${ml?.sentiment || "—"}. This is a historical mix, not a guaranteed prediction. Open AI / ML Lab for the full seven-block read.`;
  }
  if (q.includes("pcr") || q.includes("max pain") || q.includes("oi") || q.includes("पेन")) {
    if (!chain) {
      if (hi) return "NSE से ऑप्शन चेन अभी आ रही है। कुछ सेकंड बाद फिर पूछें।";
      if (mr) return "NSE कडून ऑप्शन चेन अजून येत आहे. काही सेकंदांनी पुन्हा विचारा.";
      return "Option chain is still warming up from NSE. Ask again in a few seconds.";
    }
    if (hi) return `निफ्टी PCR ${chain.pcr} है। मैक्स पेन ${chain.maxPain}, स्पॉट ${chain.spot}। पुट OI सपोर्ट ${chain.support}, कॉल OI रेसिस्टेंस ${chain.resistance}।`;
    if (mr) return `निफ्टी PCR ${chain.pcr} आहे. मॅक्स पेन ${chain.maxPain}, स्पॉट ${chain.spot}. पुट OI सपोर्ट ${chain.support}, कॉल OI रेझिस्टन्स ${chain.resistance}.`;
    return `Nifty PCR is ${chain.pcr}. Max pain is ${chain.maxPain} versus spot ${chain.spot}. Highest put OI (support) sits at ${chain.support} and highest call OI (resistance) at ${chain.resistance}. Expiry pinning often gravitates toward max pain into the last session, but a PCR extreme plus a VIX spike can break that magnet.`;
  }
  if (q.includes("strategy") || q.includes("trade") || q.includes("option") || q.includes("ट्रेड") || q.includes("रणनीत")) {
    const bias = ctx.pulse?.bias || "Range / Mixed";
    if (bias === "Bullish") {
      if (hi) return `बायस तेजी का है। ATM के पास बुल कॉल स्प्रेड या बुल पुट स्प्रेड बेहतर है। स्पॉट ${n.price}, PCR ${chain?.pcr}। मैक्स लॉस तय रखें।`;
      if (mr) return `बायस तेजीचा आहे. ATM जवळ बुल कॉल स्प्रेड किंवा बुल पुट स्प्रेड चांगले. स्पॉट ${n.price}, PCR ${chain?.pcr}. मॅक्स तोटा निश्चित ठेवा.`;
      return `Bias is bullish. A bull call spread around ATM or a bull put spread (credit) fits better than a naked long call. Spot ${n.price}, PCR ${chain?.pcr}. Keep max loss defined — that is the Sensibull-style discipline.`;
    }
    if (bias === "Bearish") {
      if (hi) return `बायस रक्षात्मक है। बेयर पुट स्प्रेड या छोटा हेज बेहतर। VIX बढ़े तो शॉर्ट पुट न लें। निफ्टी ${n.price}, मैक्स पेन ${chain?.maxPain}।`;
      if (mr) return `बायस बचावात्मक आहे. बेअर पुट स्प्रेड किंवा छोटा हेज चांगले. VIX वाढत असेल तर शॉर्ट पुट टाळा. निफ्टी ${n.price}, मॅक्स पेन ${chain?.maxPain}.`;
      return `Bias is defensive. Prefer a bear put spread or a small hedge. Avoid short puts while VIX is rising. Nifty ${n.price}, max pain ${chain?.maxPain}.`;
    }
    if (hi) return `बाज़ार रेंज में है। मैक्स पेन ${chain?.maxPain} के आसपास आयरन कोंडोर / आयरन फ्लाई साफ़ संरचना है। सपोर्ट ${chain?.support}, रेसिस्टेंस ${chain?.resistance}।`;
    if (mr) return `बाजार रेंजमध्ये आहे. मॅक्स पेन ${chain?.maxPain} जवळ आयर्न कोंडोर / आयर्न फ्लाय स्वच्छ स्ट्रक्चर आहे. सपोर्ट ${chain?.support}, रेझिस्टन्स ${chain?.resistance}.`;
    return `Market is range-bound. Iron condor or iron fly around max pain ${chain?.maxPain} with wings beyond OI support ${chain?.support} / resistance ${chain?.resistance} is the cleaner structure.`;
  }
  if (q.includes("sensex") || q.includes("bse") || q.includes("सेंसेक्स") || q.includes("सेन्सेक्स")) {
    if (hi) return `सेंसेक्स ${t.sensex?.price} (${t.sensex?.changePct}%) पर है। निफ्टी के साथ चलता है, लेकिन रिलायंस / HDFC बैंक से BSE अलग हो सकता है।`;
    if (mr) return `सेन्सेक्स ${t.sensex?.price} (${t.sensex?.changePct}%) वर आहे. निफ्टीसोबत चालतो, पण रिलायन्स / HDFC बँकमुळे BSE वेगळा होऊ शकतो.`;
    return `SENSEX is at ${t.sensex?.price} (${t.sensex?.changePct}%). It usually rhymes with Nifty but heavyweights like Reliance and HDFC Bank can make BSE diverge for a session. Use both tapes before sizing an index trade.`;
  }
  if (q.includes("vix")) {
    if (hi) return `इंडिया VIX ${t.vix?.price} (${t.vix?.changePct}%) है। 13 से नीचे प्रीमियम सेलिंग; अचानक उछाल पर साइज़ घटाएँ।`;
    if (mr) return `इंडिया VIX ${t.vix?.price} (${t.vix?.changePct}%) आहे. 13 खाली प्रीमियम सेलिंग; अचानक उसळीवर साइझ कमी करा.`;
    return `India VIX is ${t.vix?.price} (${t.vix?.changePct}%). Sub-13 favours premium selling; a sudden jump argues for long vega (strangles/straddles) or simply smaller size.`;
  }
  if (q.includes("news") || q.includes("headline") || q.includes("समाचार") || q.includes("बातम्या")) {
    const h = (ctx.headlines || []).slice(0, 4).map((x) => `• ${x.title}`).join("\n");
    if (hi) return `ताज़ा हेडलाइन:\n${h || "फीड रिफ्रेश हो रहा है।"}\nहेडलाइन नहीं, टेप देखें — PCR, VIX और स्पॉट से पुष्टि करें।`;
    if (mr) return `ताज्या हेडलाईन:\n${h || "फीड रिफ्रेश होत आहे."}\nहेडलाईन नाही, टेप पहा — PCR, VIX आणि स्पॉटने खात्री करा.`;
    return `Latest market headlines:\n${h || "Feed is refreshing."}\nTrade the tape, not the headline — confirm with PCR, VIX and spot vs VWAP/SMA20.`;
  }
  if (hi) {
    if (ctx.ml) return stockReply(ctx.ml, lang);
    return `लाइव पल्स: ${ctx.pulse?.bias || "n/a"} (स्कोर ${ctx.pulse?.score})। निफ्टी ${n.price} ${n.changePct}%, सेंसेक्स ${t.sensex?.price}, बैंक निफ्टी ${t.banknifty?.price}, BTC ${t.btc?.price}। ${ctx.pulse?.summary || ""} ऑप्शन चेन, PCR, मैक्स पेन या सुरक्षित ट्रेड पूछ सकते हैं।`;
  }
  if (mr) {
    if (ctx.ml) return stockReply(ctx.ml, lang);
    return `लाइव्ह पल्स: ${ctx.pulse?.bias || "n/a"} (स्कोर ${ctx.pulse?.score}). निफ्टी ${n.price} ${n.changePct}%, सेन्सेक्स ${t.sensex?.price}, बँक निफ्टी ${t.banknifty?.price}, BTC ${t.btc?.price}. ${ctx.pulse?.summary || ""} ऑप्शन चेन, PCR, मॅक्स पेन किंवा सुरक्षित ट्रेड विचारू शकता.`;
  }
  if (ctx.ml) return stockReply(ctx.ml, lang);
  return `Live pulse: ${ctx.pulse?.bias || "n/a"} (score ${ctx.pulse?.score}). Nifty ${n.price} ${n.changePct}%, Sensex ${t.sensex?.price}, Bank Nifty ${t.banknifty?.price}, BTC ${t.btc?.price}. ${ctx.pulse?.summary || ""} Ask a stock name + bias (example: HCLTECH bias) for a proper ML read.`;
}

export const DISCLAIMER =
  "Educational analysis from live market data. Not SEBI-registered advice. Not a guaranteed forecast or a buy/sell recommendation.";

export function listEngines() {
  return [
    { id: "openai", label: "OpenAI", ready: Boolean(process.env.OPENAI_API_KEY) },
    { id: "claude", label: "Claude", ready: Boolean(process.env.ANTHROPIC_API_KEY) },
    { id: "gemini", label: "Gemini", ready: Boolean(process.env.GEMINI_API_KEY) },
    { id: "live-ml", label: "Desk ML", ready: true }
  ];
}

function pickEngine(requested) {
  const id = String(requested || "auto").toLowerCase();
  const engines = listEngines();
  if (id === "live-ml" || id === "desk" || id === "ml") return "live-ml";
  if (id === "openai" || id === "claude" || id === "gemini") return id;
  const first = engines.find((e) => e.id !== "live-ml" && e.ready);
  return first?.id || "live-ml";
}

async function callOpenAI(system, user) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI is not configured on the server");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(data?.error?.message || "OpenAI empty");
  return { engine: "openai", text };
}

async function callClaude(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Claude is not configured on the server");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 900,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  const data = await res.json();
  const text = (data?.content || []).map((p) => p.text).filter(Boolean).join("\n");
  if (!text) throw new Error(data?.error?.message || "Claude empty");
  return { engine: "claude", text };
}

async function callGemini(system, user) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured on the server");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }]
      })
    }
  );
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n");
  if (!text) throw new Error(data?.error?.message || "Gemini empty");
  return { engine: "gemini", text };
}

async function callLlm(system, user, engine) {
  if (engine === "openai") return callOpenAI(system, user);
  if (engine === "claude") return callClaude(system, user);
  if (engine === "gemini") return callGemini(system, user);
  return null;
}

export async function chat(message, history = [], lang = "en", engineReq = "auto") {
  const symbol = detectSymbol(message, "NIFTY");
  const wantChain = /pcr|max pain|oi|option|strategy|spread|condor/i.test(message);
  const [tickers, chain, news, ml] = await Promise.allSettled([
    liveOrTickers(),
    wantChain ? getOptionChain(NIFTY50.some((s) => s.symbol === symbol) ? "NIFTY" : symbol) : Promise.resolve(null),
    getNewsBundle(),
    analyzeSymbol(symbol)
  ]);
  const t = tickers.status === "fulfilled" ? tickers.value : {};
  const oc = chain.status === "fulfilled" ? chain.value : null;
  const headlines = news.status === "fulfilled" ? (news.value.headline || news.value.market || []).slice(0, 8) : [];
  const mlPack = ml.status === "fulfilled" ? ml.value : null;
  const pulse =
    symbol === "NIFTY"
      ? await marketPulse().catch(() => null)
      : {
          bias: mlPack?.lean,
          score: mlPack?.score,
          summary: mlPack?.forecast?.summary,
          ml: mlPack
        };
  const named = liveQuote(symbol);
  const live = `${snapshotText(t, oc, {
    symbol: mlPack?.symbol || symbol,
    price: named?.price ?? mlPack?.price,
    changePct: named?.changePct ?? mlPack?.changePct,
    bias: mlPack?.technicals?.bias,
    rsi: mlPack?.technicals?.rsi,
    sma20: mlPack?.technicals?.sma20,
    sma50: mlPack?.technicals?.sma50,
    sma200: mlPack?.technicals?.sma200
  })}\n${mlSnapshot(mlPack)}`;
  const speak =
    lang === "hi"
      ? "Reply in simple Hindi (Devanagari script)."
      : lang === "mr"
        ? "Reply in simple Marathi (Devanagari script)."
        : "Reply in English.";
  const engine = pickEngine(engineReq);
  const system = `You are Am Market Copilot for the Indian cash and F&O tape. The user asked about ${symbol}. Answer THAT name first using NIFTY, SENSEX, BANK NIFTY, VIX, option chain, volume, RSI, MACD, news, trend and risk from the live snapshot. Never invent prices, PCR, RSI or headlines. If a field is missing, say the feed does not have it. ${speak} Be concise with numbers. ${DISCLAIMER}
LIVE SNAPSHOT:
${live}
PULSE: ${pulse?.bias} ${pulse?.score} ${pulse?.summary}
HEADLINES: ${headlines.map((h) => h.title).join(" | ")}`;
  const prior = (history || [])
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const user = `${prior}\nuser: ${message}`;
  const brainCtx = { tickers: t, chain: oc, pulse, headlines, ml: mlPack, symbol };
  const publicEngines = listEngines().map(({ id, label, ready }) => ({ id, label, ready }));
  const payload = { pulse, live, symbol, disclaimer: DISCLAIMER, engines: publicEngines };
  if (engine === "live-ml") {
    return { reply: `${localBrain(message, brainCtx, lang)}\n\n${DISCLAIMER}`, engine: "live-ml", ...payload };
  }
  try {
    const llm = await callLlm(system, user, engine);
    if (llm) return { reply: `${llm.text}\n\n${DISCLAIMER}`, engine: llm.engine, ...payload };
  } catch (err) {
    const fallback = localBrain(message, brainCtx, lang);
    return {
      reply: `${fallback}\n\n(${engine} unavailable: ${err.message}. Answer uses live desk ML from the tape only.)\n${DISCLAIMER}`,
      engine: "live-ml",
      ...payload
    };
  }
  return { reply: `${localBrain(message, brainCtx, lang)}\n\n${DISCLAIMER}`, engine: "live-ml", ...payload };
}
