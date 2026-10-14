// NikcodeAI backend: тримає API-ключ на сервері. Потрібен Node 18+, залежностей немає.
const http = require("http");
const fs = require("fs");
const path = require("path");

// Мінімальне читання .env
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const ACCESS_CODE = process.env.ACCESS_CODE;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";

const BASE = "Ти NikcodeAI, дружній AI-помічник для Нікіти. Відповідай українською, коротко й зрозуміло.";
const SYSTEM = {
  NikChat: `${BASE} Режим чату: відповідай на будь-які питання.`,
  NikLearn: `${BASE} Режим навчання: пояснюй крок за кроком, з простими прикладами, наприкінці став одне коротке питання для перевірки.`,
  NikCode: `${BASE} Режим програмування: давай робочий код у блоках і коротко пояснюй, що він робить.`,
  NikCreative: `${BASE} Режим творчості: пропонуй оригінальні, несподівані ідеї, 3–5 варіантів.`
};

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// Простий ліміт: 20 запитів на хвилину з однієї IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function chat(req, res) {
  if (!KEY) return send(res, 500, { error: "На сервері не задано ANTHROPIC_API_KEY." });
  if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) return send(res, 401, { error: "Невірний код доступу." });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, { error: "Забагато запитів. Зачекай хвилину." });

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 50000) return send(res, 413, { error: "Запит завеликий." });
  }

  let data;
  try { data = JSON.parse(body); } catch { return send(res, 400, { error: "Некоректний JSON." }); }

  const system = SYSTEM[data.mode] || SYSTEM.NikChat;
  const messages = (Array.isArray(data.messages) ? data.messages : [])
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!messages.length || messages[messages.length - 1].role !== "user")
    return send(res, 400, { error: "Потрібне повідомлення від користувача." });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages })
    });
    const out = await r.json();
    if (!r.ok) {
      console.error("API error:", out);
      return send(res, 502, { error: "AI зараз недоступний. Спробуй пізніше." });
    }
    const reply = (out.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    send(res, 200, { reply });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: "Не вдалося зв'язатися з AI." });
  }
}

const ASSETS = {
  "/": "<!DOCTYPE html>\n<html lang=\"uk\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <meta name=\"theme-color\" content=\"#080d18\">\n  <meta name=\"description\" content=\"NikcodeAI — твоя AI-лабораторія: чат, навчання, код і творчість.\">\n  <title>NikcodeAI v0.1</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n  <link rel=\"manifest\" href=\"manifest.webmanifest\">\n  <link rel=\"icon\" href=\"icon.svg\" type=\"image/svg+xml\">\n  <link rel=\"apple-touch-icon\" href=\"icon.svg\">\n  <meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n  <meta name=\"mobile-web-app-capable\" content=\"yes\">\n</head>\n<body>\n  <header class=\"topbar\">\n    <a class=\"logo\" href=\"./\" aria-label=\"NikcodeAI — головна\">\n      <span class=\"logo-icon\">N</span>\n      <span>Nikcode<span class=\"cyan\">AI</span></span>\n    </a>\n    <span class=\"version\">v0.1</span>\n  </header>\n\n  <main class=\"container\">\n    <section class=\"hero\">\n      <div class=\"status\"><span class=\"status-dot\"></span>ТВОЯ AI-ЛАБОРАТОРІЯ</div>\n      <h1>Твій простір<br>для <span class=\"gradient\">великих ідей.</span></h1>\n      <p class=\"subtitle\">Навчайся. Створюй. Програмуй.<br>Почни з ідеї — побудуй щось неймовірне.</p>\n    </section>\n\n    <section class=\"modes\" aria-label=\"Режими NikcodeAI\">\n      <button class=\"mode active\" data-mode=\"NikChat\" aria-pressed=\"true\">\n        <span class=\"mode-icon\" aria-hidden=\"true\">✦</span>\n        <span class=\"mode-name\">NikChat</span>\n        <span class=\"mode-desc\">Спілкуйся та запитуй</span>\n      </button>\n      <button class=\"mode\" data-mode=\"NikLearn\" aria-pressed=\"false\">\n        <span class=\"mode-icon\" aria-hidden=\"true\">⌘</span>\n        <span class=\"mode-name\">NikLearn</span>\n        <span class=\"mode-desc\">Вивчай нове</span>\n      </button>\n      <button class=\"mode\" data-mode=\"NikCode\" aria-pressed=\"false\">\n        <span class=\"mode-icon\" aria-hidden=\"true\">&lt;/&gt;</span>\n        <span class=\"mode-name\">NikCode</span>\n        <span class=\"mode-desc\">Створюй код</span>\n      </button>\n      <button class=\"mode\" data-mode=\"NikCreative\" aria-pressed=\"false\">\n        <span class=\"mode-icon\" aria-hidden=\"true\">✧</span>\n        <span class=\"mode-name\">NikCreative</span>\n        <span class=\"mode-desc\">Вигадуй ідеї</span>\n      </button>\n    </section>\n\n    <section class=\"chat\">\n      <div class=\"chat-heading\">\n        <span class=\"online-dot\"></span>\n        <div>\n          <h2 id=\"chat-title\">NikChat</h2>\n          <p id=\"chat-sub\">Твоя творча лабораторія</p>\n        </div>\n      </div>\n\n      <div class=\"messages\" id=\"messages\" aria-live=\"polite\">\n        <div class=\"message ai-message\">\n          <span class=\"avatar\">N</span>\n          <div class=\"bubble\">Привіт, Нікіто! 👋 Я NikcodeAI v0.1.<br>Обери режим і напиши, що хочеш дослідити!</div>\n        </div>\n      </div>\n\n      <form id=\"chat-form\" class=\"input-area\">\n        <label class=\"sr-only\" for=\"prompt\">Твоє повідомлення</label>\n        <input id=\"prompt\" type=\"text\" placeholder=\"Запитай у NikcodeAI...\" autocomplete=\"off\" maxlength=\"1000\" required>\n        <button class=\"send-button\" type=\"submit\" aria-label=\"Надіслати\">➤</button>\n      </form>\n      <p class=\"notice\">Навчальний прототип · AI може помилятися</p>\n    </section>\n\n    <footer><span>✦</span> Створено з цікавістю та кодом · NikcodeAI</footer>\n  </main>\n\n  <script src=\"script.js\"></script>\n</body>\n</html>\n",
  "/style.css": ":root{\n  --bg:#080d18;--panel:#0f1626;--panel-2:#141d33;--line:#1f2b47;\n  --text:#e8eefc;--muted:#8d9bbd;--cyan:#22d3ee;--violet:#8b5cf6;\n  --grad:linear-gradient(90deg,var(--cyan),var(--violet));\n}\n*{box-sizing:border-box;margin:0;padding:0}\nhtml{-webkit-text-size-adjust:100%}\nbody{\n  background:radial-gradient(900px 420px at 50% -120px,#13234a 0,transparent 70%),var(--bg);\n  color:var(--text);font:16px/1.5 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;\n  min-height:100vh;\n  padding-bottom:env(safe-area-inset-bottom,0);\n}\n.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}\na{color:inherit;text-decoration:none}\n:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}\n\n.topbar{\n  display:flex;justify-content:space-between;align-items:center;\n  padding:14px 18px;padding-top:calc(14px + env(safe-area-inset-top,0));\n  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5;\n  background:rgba(8,13,24,.85);backdrop-filter:blur(10px);\n}\n.logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}\n.logo-icon{\n  width:32px;height:32px;border-radius:9px;display:grid;place-items:center;\n  background:var(--grad);color:#04101c;font-weight:800;\n}\n.cyan{color:var(--cyan)}\n.version{font-size:12px;color:var(--muted);border:1px solid var(--line);padding:3px 10px;border-radius:99px}\n\n.container{max-width:720px;margin:0 auto;padding:0 18px 40px}\n\n.hero{padding:36px 0 24px}\n.status{display:inline-flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.08em;color:var(--cyan);margin-bottom:16px}\n.status-dot,.online-dot{width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px var(--cyan)}\nh1{font-size:clamp(34px,9vw,56px);line-height:1.08;letter-spacing:-.02em}\n.gradient{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}\n.subtitle{margin-top:14px;color:var(--muted)}\n\n.modes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}\n.mode{\n  text-align:left;background:var(--panel);color:var(--text);\n  border:1px solid var(--line);border-radius:14px;padding:14px;\n  display:flex;flex-direction:column;gap:2px;cursor:pointer;font:inherit;\n  transition:border-color .2s,background .2s,transform .1s;\n}\n.mode:active{transform:scale(.97)}\n.mode-icon{font-size:20px;color:var(--cyan);margin-bottom:6px}\n.mode-name{font-weight:700}\n.mode-desc{font-size:13px;color:var(--muted)}\n.mode.active{border-color:var(--cyan);background:var(--panel-2);box-shadow:0 0 0 1px var(--cyan) inset}\n@media(min-width:620px){.modes{grid-template-columns:repeat(4,1fr)}}\n\n.chat{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}\n.chat-heading{display:flex;align-items:center;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}\n.chat-heading h2{font-size:17px}\n.chat-heading p{font-size:13px;color:var(--muted)}\n\n.messages{display:flex;flex-direction:column;gap:12px;padding:16px 0;max-height:52vh;overflow-y:auto;scroll-behavior:smooth}\n.message{display:flex;gap:10px;align-items:flex-end;max-width:92%}\n.avatar{\n  flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;\n  background:var(--grad);color:#04101c;font-weight:800;font-size:13px;\n}\n.bubble{padding:10px 14px;border-radius:16px;background:var(--panel-2);border:1px solid var(--line);overflow-wrap:anywhere;white-space:pre-wrap}\n.bubble code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:var(--cyan)}\n.user-message{align-self:flex-end;flex-direction:row-reverse}\n.user-message .bubble{background:var(--grad);color:#04101c;border:0;border-bottom-right-radius:4px}\n.ai-message .bubble{border-bottom-left-radius:4px}\n\n.typing{display:inline-flex;gap:4px;padding:4px 0}\n.typing i{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:blink 1s infinite}\n.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}\n@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}\n\n.input-area{display:flex;gap:8px;margin-top:4px}\n.input-area input{\n  flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--line);\n  border-radius:12px;padding:12px 14px;font:inherit;font-size:16px;\n}\n.input-area input:focus{border-color:var(--cyan);outline:none}\n.send-button{\n  flex:none;width:48px;border:0;border-radius:12px;background:var(--grad);\n  color:#04101c;font-size:18px;cursor:pointer;\n}\n.send-button:disabled{opacity:.5;cursor:default}\n.notice{margin-top:10px;font-size:12px;color:var(--muted);text-align:center}\n\nfooter{margin-top:28px;text-align:center;font-size:13px;color:var(--muted)}\nfooter span{color:var(--cyan)}\n\n@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n",
  "/script.js": "(() => {\n  const MODES = {\n    NikChat:     { sub: \"Твоя творча лабораторія\", ph: \"Запитай у NikcodeAI...\", hello: \"Режим NikChat: питай про що завгодно!\" },\n    NikLearn:    { sub: \"Вивчай нове крок за кроком\", ph: \"Яку тему вивчимо?\", hello: \"Режим NikLearn: назви тему, і я розкладу її на прості кроки.\" },\n    NikCode:     { sub: \"Пиши й розбирай код\", ph: \"Що будемо програмувати?\", hello: \"Режим NikCode: опиши, що хочеш створити.\" },\n    NikCreative: { sub: \"Генеруй ідеї\", ph: \"Про що вигадаємо ідею?\", hello: \"Режим NikCreative: давай придумаємо щось нове!\" }\n  };\n\n  const $ = s => document.querySelector(s);\n  const modeButtons = document.querySelectorAll(\".mode\");\n  const messages = $(\"#messages\");\n  const form = $(\"#chat-form\");\n  const input = $(\"#prompt\");\n  const sendBtn = form.querySelector(\".send-button\");\n  let mode = \"NikChat\";\n  let busy = false;\n  let history = [];\n\n  function addMessage(text, who) {\n    const wrap = document.createElement(\"div\");\n    wrap.className = `message ${who}-message`;\n    if (who === \"ai\") {\n      const av = document.createElement(\"span\");\n      av.className = \"avatar\";\n      av.textContent = \"N\";\n      wrap.append(av);\n    }\n    const bubble = document.createElement(\"div\");\n    bubble.className = \"bubble\";\n    if (text) bubble.textContent = text;\n    wrap.append(bubble);\n    messages.append(wrap);\n    messages.scrollTop = messages.scrollHeight;\n    return bubble;\n  }\n\n  function setMode(name) {\n    mode = name;\n    const m = MODES[name];\n    modeButtons.forEach(b => {\n      const on = b.dataset.mode === name;\n      b.classList.toggle(\"active\", on);\n      b.setAttribute(\"aria-pressed\", String(on));\n    });\n    $(\"#chat-title\").textContent = name;\n    $(\"#chat-sub\").textContent = m.sub;\n    input.placeholder = m.ph;\n    history = [];\n    addMessage(m.hello, \"ai\");\n  }\n\n  modeButtons.forEach(b => b.addEventListener(\"click\", () => {\n    if (b.dataset.mode !== mode) setMode(b.dataset.mode);\n  }));\n\n  async function apiChat() {\n    const call = () => fetch(\"/api/chat\", {\n      method: \"POST\",\n      headers: { \"Content-Type\": \"application/json\", \"x-access-code\": localStorage.getItem(\"nik_code\") || \"\" },\n      body: JSON.stringify({ mode, messages: history })\n    });\n    let r = await call();\n    if (r.status === 401) {\n      const code = prompt(\"Введи код доступу:\");\n      if (code) { localStorage.setItem(\"nik_code\", code); r = await call(); }\n    }\n    return r;\n  }\n\n  form.addEventListener(\"submit\", e => {\n    e.preventDefault();\n    const text = input.value.trim();\n    if (!text || busy) return;\n    busy = true;\n    sendBtn.disabled = true;\n    addMessage(text, \"user\");\n    input.value = \"\";\n\n    const bubble = addMessage(\"\", \"ai\");\n    bubble.innerHTML = '<span class=\"typing\"><i></i><i></i><i></i></span>';\n\n    history.push({ role: \"user\", content: text });\n    apiChat()\n      .then(async r => {\n        const d = await r.json().catch(() => ({}));\n        if (!r.ok) throw new Error(d.error || \"Щось пішло не так.\");\n        return d.reply;\n      })\n      .then(reply => {\n        bubble.textContent = reply;\n        history.push({ role: \"assistant\", content: reply });\n      })\n      .catch(err => {\n        history.pop();\n        bubble.textContent = \"⚠️ \" + err.message;\n      })\n      .finally(() => {\n        messages.scrollTop = messages.scrollHeight;\n        busy = false;\n        sendBtn.disabled = false;\n        input.focus();\n      });\n  });\n})();\n",
  "/manifest.webmanifest": "{\"name\":\"NikcodeAI\",\"short_name\":\"NikcodeAI\",\"start_url\":\"/\",\"display\":\"standalone\",\"background_color\":\"#080d18\",\"theme_color\":\"#080d18\",\"lang\":\"uk\",\"icons\":[{\"src\":\"icon.svg\",\"sizes\":\"any\",\"type\":\"image/svg+xml\",\"purpose\":\"any\"}]}\n",
  "/icon.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\"><stop offset=\"0\" stop-color=\"#22d3ee\"/><stop offset=\"1\" stop-color=\"#8b5cf6\"/></linearGradient></defs><rect width=\"512\" height=\"512\" rx=\"112\" fill=\"#080d18\"/><rect x=\"96\" y=\"96\" width=\"320\" height=\"320\" rx=\"80\" fill=\"url(#g)\"/><text x=\"256\" y=\"338\" font-family=\"system-ui,sans-serif\" font-size=\"230\" font-weight=\"800\" text-anchor=\"middle\" fill=\"#04101c\">N</text></svg>\n"
};
const ASSET_TYPES = { "/": "text/html; charset=utf-8", "/style.css": "text/css; charset=utf-8", "/script.js": "text/javascript; charset=utf-8", "/manifest.webmanifest": "application/manifest+json", "/icon.svg": "image/svg+xml" };

function serveStatic(req, res) {
  const p = req.url.split("?")[0];
  if (!(p in ASSETS)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": ASSET_TYPES[p] });
  res.end(ASSETS[p]);
}

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") return chat(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`NikcodeAI: http://localhost:${PORT}`));
