import "./index.css";
import { useEffect, useState } from "react";

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1476565432231268383&permissions=8&scope=bot+applications.commands";
const API_BASE = import.meta.env.BASE_URL;

const PRIMARY = "#dc2626";
const PRIMARY_DARK = "#b91c1c";
const ACCENT = "#f97316";
const PRIMARY_LIGHT = "#fca5a5";

const COMMANDS = [
  {
    category: "🪙 Экономика",
    color: "from-yellow-700 to-orange-800",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    items: [
      { name: "/баланс", desc: "Кошелёк и портфель акций — твой или другого участника" },
      { name: "/ежедневный", desc: "Ежедневный бонус монет — каждые 24 часа" },
      { name: "/топ-богачей", desc: "Топ 10 богатейших участников сервера" },
      { name: "/перевести", desc: "Перевод монет другому участнику (с налогом)" },
      { name: "/акции список", desc: "Все акции на бирже сервера с ценами и динамикой" },
      { name: "/акции создать", desc: "Выпустить собственные акции клана/команды" },
      { name: "/акции купить", desc: "Купить акции — цена растёт от спроса" },
      { name: "/акции продать", desc: "Продать акции и зафиксировать прибыль" },
      { name: "/акции инфо", desc: "График цены и статистика акции" },
      { name: "/конфиг-монеты", desc: "Настройка экономики сервера (только для администраторов)" },
      { name: "/дать-монеты", desc: "Выдать или снять монеты у участника (только для администраторов)" },
    ],
  },
  {
    category: "🤖 ИИ Чат",
    color: "from-red-700 to-rose-800",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    items: [
      { name: "/ask", desc: "Задай любой вопрос — Gemini AI ответит мгновенно" },
      { name: "/imagine", desc: "Сгенерируй описание изображения с помощью ИИ" },
      { name: "/explain", desc: "Объясни любую тему простыми словами" },
      { name: "/translate", desc: "Переведи текст на любой язык" },
      { name: "/code", desc: "Напиши или отладь код на любом языке" },
      { name: "/summary", desc: "Сделай краткое изложение длинного текста" },
    ],
  },
  {
    category: "🎮 Игры",
    color: "from-orange-700 to-red-800",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    items: [
      { name: "/trivia", desc: "Викторина с несколькими вопросами и таблицей лидеров" },
      { name: "/quest", desc: "Текстовое приключение на основе ИИ" },
      { name: "/riddle", desc: "Загадки на сообразительность" },
      { name: "/duel", desc: "Вызов на дуэль другого участника сервера" },
      { name: "/fortune", desc: "Ежедневное предсказание судьбы" },
    ],
  },
  {
    category: "🎨 Творчество",
    color: "from-rose-700 to-pink-900",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    items: [
      { name: "/meme", desc: "Генерация мемов с подписями от ИИ" },
      { name: "/comic", desc: "Создай историю в 3 панелях комикса" },
      { name: "/avatar", desc: "Опиши аватар в 6 художественных стилях" },
      { name: "/joke", desc: "Получи свежую шутку на любую тему" },
      { name: "/fact", desc: "Случайный интересный факт дня" },
    ],
  },
  {
    category: "🎙️ Транскрипция",
    color: "from-red-900 to-rose-950",
    bg: "bg-red-900/20",
    border: "border-red-700/30",
    items: [
      { name: "/транскрипция старт", desc: "Зайти в голосовой канал и транскрибировать разговор в текстовый канал" },
      { name: "/транскрипция стоп", desc: "Остановить запись и выйти из голосового канала" },
    ],
  },
  {
    category: "⚙️ Управление сервером",
    color: "from-red-800 to-rose-950",
    bg: "bg-red-900/20",
    border: "border-red-700/30",
    items: [
      { name: "/poll", desc: "Создай интерактивный опрос с результатами в реальном времени" },
      { name: "/welcome", desc: "Настрой приветственные сообщения для новых участников" },
      { name: "/persona", desc: "Задай боту уникальную личность и имя" },
    ],
  },
];

const FEATURES = [
  {
    icon: "✨",
    title: "На базе Gemini AI",
    desc: "Самая мощная языковая модель Google за каждым ответом.",
    color: "from-red-600/20 to-rose-700/20",
    border: "border-red-500/30",
  },
  {
    icon: "🪙",
    title: "Полноценная экономика",
    desc: "Монеты за активность, биржа акций, переводы, рейтинг богачей и настраиваемый конфиг.",
    color: "from-yellow-600/20 to-orange-700/20",
    border: "border-yellow-500/30",
  },
  {
    icon: "📈",
    title: "Биржа акций",
    desc: "Создавай акции клана, торгуй с другими. Цена меняется от активности и спроса.",
    color: "from-orange-600/20 to-red-700/20",
    border: "border-orange-500/30",
  },
  {
    icon: "🎲",
    title: "5+ встроенных игр",
    desc: "Викторина, квесты, загадки, дуэли, мафия и предсказания судьбы.",
    color: "from-rose-600/20 to-pink-700/20",
    border: "border-rose-500/30",
  },
  {
    icon: "🎨",
    title: "Творческая студия",
    desc: "Мемы, комиксы и художественные стили аватаров по запросу.",
    color: "from-red-700/20 to-rose-800/20",
    border: "border-red-600/30",
  },
  {
    icon: "🎙️",
    title: "Голосовая транскрипция",
    desc: "Бот заходит в голосовой канал и переводит речь в текст через Gemini AI в реальном времени.",
    color: "from-red-800/20 to-rose-900/20",
    border: "border-red-700/30",
  },
  {
    icon: "🛠️",
    title: "Управление сервером",
    desc: "Опросы, приветствия, автомодерация и кастомные личности бота.",
    color: "from-red-600/20 to-orange-600/20",
    border: "border-red-500/30",
  },
];

const STATS = [
  { value: "30+", label: "Команд" },
  { value: "🪙", label: "Экономика" },
  { value: "24/7", label: "Онлайн" },
  { value: "∞", label: "Возможностей" },
];

type BotStatus = {
  online: boolean;
  status: "online" | "offline";
  botTag: string;
  guildCount: number;
  lastHeartbeat: string | null;
  uptimeSeconds: number;
};

const STEPS = [
  {
    num: "1",
    title: "Нажми «Добавить бота»",
    desc: "Перейди по ссылке приглашения и выбери свой сервер Discord.",
  },
  {
    num: "2",
    title: "Выдай права",
    desc: "Подтверди выдачу необходимых прав для корректной работы.",
  },
  {
    num: "3",
    title: "Используй команды",
    desc: "Введи /ask, /trivia или любую другую команду — всё готово!",
  },
];

const DiscordIcon = () => (
  <svg width="22" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M60.1 4.9A58.55 58.55 0 0045.8.8a.22.22 0 00-.23.11 40.78 40.78 0 00-1.8 3.7 54.08 54.08 0 00-16.24 0A37.47 37.47 0 0025.67.91a.23.23 0 00-.23-.11A58.41 58.41 0 0011.1 4.9a.21.21 0 00-.09.08C1.58 18.73-1 32.18.31 45.47a.24.24 0 00.09.16 58.86 58.86 0 0017.72 8.96.23.23 0 00.25-.08 42.07 42.07 0 003.64-5.9.22.22 0 00-.12-.31 38.72 38.72 0 01-5.53-2.64.23.23 0 01-.02-.38c.37-.28.74-.57 1.1-.86a.22.22 0 01.23-.03c11.6 5.3 24.17 5.3 35.63 0a.22.22 0 01.23.02c.36.3.73.59 1.1.87a.23.23 0 01-.02.38 36.34 36.34 0 01-5.54 2.63.23.23 0 00-.12.32 47.25 47.25 0 003.64 5.9.22.22 0 00.25.07 58.7 58.7 0 0017.73-8.96.23.23 0 00.09-.15c1.57-16.26-2.63-30.6-11.14-43.22a.18.18 0 00-.08-.09zm-38.6 34.7c-3.5 0-6.38-3.22-6.38-7.17 0-3.96 2.83-7.18 6.38-7.18 3.58 0 6.42 3.24 6.38 7.18 0 3.95-2.83 7.17-6.38 7.17zm23.6 0c-3.5 0-6.38-3.22-6.38-7.17 0-3.96 2.83-7.18 6.38-7.18 3.57 0 6.42 3.24 6.38 7.18 0 3.95-2.8 7.17-6.38 7.17z"
      fill="currentColor"
    />
  </svg>
);

function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-background/70 border-b border-border/50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
              boxShadow: `0 4px 14px ${PRIMARY}40`,
            }}
          >
            <DiscordIcon />
          </div>
          <span className="font-bold text-lg tracking-tight">SWAGAgpt.AI</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Возможности</a>
          <a href="#commands" className="hover:text-foreground transition-colors">Команды</a>
          <a href="#setup" className="hover:text-foreground transition-colors">Установка</a>
        </nav>
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all"
          style={{
            background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
            boxShadow: `0 4px 14px ${PRIMARY}35`,
          }}
        >
          <DiscordIcon />
          Добавить
        </a>
      </div>
    </header>
  );
}

function Hero() {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const response = await fetch(`${API_BASE}api/bot/status`, { cache: "no-store" });
        if (!response.ok) throw new Error("Status request failed");
        const data = (await response.json()) as BotStatus;
        if (active) {
          setBotStatus(data);
          setStatusError(false);
        }
      } catch {
        if (active) {
          setBotStatus((current) => current ? { ...current, online: false, status: "offline" } : current);
          setStatusError(true);
        }
      }
    }

    loadStatus();
    const interval = window.setInterval(loadStatus, 15_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const isOnline = botStatus?.online === true && !statusError;
  const statusColor = botStatus === null && !statusError ? ACCENT : isOnline ? "#22c55e" : "#ef4444";
  const statusText = botStatus === null && !statusError
    ? "Проверяем статус..."
    : `${isOnline ? "Онлайн" : "Офлайн"} · ${botStatus?.botTag ?? "SWAGAgpt.AI#7648"}`;
  const stats = STATS.map((stat) =>
    stat.label === "Онлайн"
      ? { value: botStatus === null && !statusError ? "..." : isOnline ? "LIVE" : "OFF", label: "Статус" }
      : stat,
  );

  return (
    <section className="relative overflow-hidden px-6 py-28 text-center">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[140px]"
          style={{ background: `radial-gradient(ellipse, ${PRIMARY}25, transparent 70%)` }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full blur-[100px]"
          style={{ background: `radial-gradient(ellipse, ${ACCENT}15, transparent 70%)` }}
        />
      </div>

      <div className="relative max-w-4xl mx-auto">
        <div
          className="inline-flex items-center gap-2 text-sm px-4 py-1.5 rounded-full mb-8 border"
          style={{
            background: `${PRIMARY}18`,
            borderColor: `${PRIMARY}35`,
            color: PRIMARY_LIGHT,
          }}
        >
          <span className="relative flex h-2 w-2">
            {isOnline && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: statusColor }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: statusColor }}
            />
          </span>
          {statusText}
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-5 leading-[1.1]">
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(135deg, ${PRIMARY}, #f87171, ${ACCENT})`,
            }}
          >
            SWAGAgpt.AI
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed">
          Умный Discord-бот на базе{" "}
          <span style={{ color: PRIMARY_LIGHT }} className="font-medium">Google Gemini AI</span>.
        </p>
        <p className="text-muted-foreground max-w-xl mx-auto mb-10 text-base">
          Играй в игры, создавай контент, управляй сервером и общайся с ИИ — всё в одном боте.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 text-white font-bold px-8 py-3.5 rounded-xl transition-all text-lg hover:-translate-y-0.5"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
              boxShadow: `0 8px 30px ${PRIMARY}40`,
            }}
          >
            <DiscordIcon />
            Добавить на сервер
          </a>
          <a
            href="#commands"
            className="inline-flex items-center gap-2 border border-border hover:border-red-500/40 text-muted-foreground hover:text-foreground font-medium px-8 py-3.5 rounded-xl transition-all text-lg hover:-translate-y-0.5"
          >
            Все команды →
          </a>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              <span
                className="text-3xl font-extrabold bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${PRIMARY_LIGHT}, ${ACCENT})` }}
              >
                {s.value}
              </span>
              <span className="text-sm text-muted-foreground mt-1">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-14">
        <span
          className="text-xs font-semibold tracking-widest uppercase mb-3 block"
          style={{ color: PRIMARY_LIGHT }}
        >
          Возможности
        </span>
        <h2 className="text-3xl md:text-4xl font-bold">Всё, что нужно вашему серверу</h2>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">
          Богатый функционал без лишних настроек — просто добавь и пользуйся.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className={`relative rounded-2xl p-6 border ${f.border} bg-gradient-to-br ${f.color} backdrop-blur-sm hover:scale-[1.02] transition-transform cursor-default`}
          >
            <div className="text-4xl mb-4">{f.icon}</div>
            <h3 className="font-bold text-lg mb-2 text-foreground">{f.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Commands() {
  const [activeTab, setActiveTab] = useState(0);
  const cat = COMMANDS[activeTab];

  return (
    <section id="commands" className="px-6 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-14">
        <span
          className="text-xs font-semibold tracking-widest uppercase mb-3 block"
          style={{ color: PRIMARY_LIGHT }}
        >
          Команды
        </span>
        <h2 className="text-3xl md:text-4xl font-bold">Все команды бота</h2>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">
          Более 20 slash-команд для любого случая.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 justify-center mb-8">
        {COMMANDS.map((c, i) => (
          <button
            key={c.category}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              i === activeTab
                ? "text-white shadow-lg"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
            style={
              i === activeTab
                ? {
                    background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
                    boxShadow: `0 4px 16px ${PRIMARY}40`,
                  }
                : {}
            }
          >
            {c.category}
          </button>
        ))}
      </div>

      <div className={`rounded-2xl border ${cat.border} ${cat.bg} overflow-hidden`}>
        <div className={`bg-gradient-to-r ${cat.color} px-6 py-4`}>
          <h3 className="font-bold text-white text-xl">{cat.category}</h3>
          <p className="text-white/70 text-sm mt-0.5">{cat.items.length} команд</p>
        </div>
        <div className="divide-y divide-border/50">
          {cat.items.map((cmd) => (
            <div
              key={cmd.name}
              className="flex items-start gap-4 px-6 py-4 hover:bg-white/5 transition-colors"
            >
              <code
                className="font-mono text-sm px-2.5 py-1 rounded-lg shrink-0 mt-0.5 border"
                style={{
                  color: PRIMARY_LIGHT,
                  background: `${PRIMARY}15`,
                  borderColor: `${PRIMARY}25`,
                }}
              >
                {cmd.name}
              </code>
              <span className="text-muted-foreground text-sm leading-relaxed">{cmd.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowToStart() {
  return (
    <section id="setup" className="px-6 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-14">
        <span
          className="text-xs font-semibold tracking-widest uppercase mb-3 block"
          style={{ color: PRIMARY_LIGHT }}
        >
          Установка
        </span>
        <h2 className="text-3xl md:text-4xl font-bold">Начать за 3 шага</h2>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">
          Настройка занимает меньше минуты — никаких сложных конфигураций.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {STEPS.map((step, i) => (
          <div key={step.num} className="relative">
            {i < STEPS.length - 1 && (
              <div
                className="hidden md:block absolute top-10 left-full w-full h-px z-10"
                style={{ background: `linear-gradient(to right, ${PRIMARY}60, transparent)` }}
              />
            )}
            <div className="bg-card border border-border rounded-2xl p-6 hover:border-red-500/40 transition-colors text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl mx-auto mb-4"
                style={{
                  background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
                  boxShadow: `0 6px 20px ${PRIMARY}35`,
                }}
              >
                {step.num}
              </div>
              <h3 className="font-bold text-base mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="px-6 py-20 text-center">
      <div
        className="relative max-w-2xl mx-auto overflow-hidden rounded-3xl p-12 border"
        style={{
          background: `linear-gradient(135deg, ${PRIMARY}20, ${PRIMARY_DARK}10, ${ACCENT}10)`,
          borderColor: `${PRIMARY}30`,
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top, ${PRIMARY}20, transparent 60%)`,
          }}
        />
        <div className="relative">
          <div className="text-5xl mb-5">🚀</div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Готов поднять уровень?</h2>
          <p className="text-muted-foreground mb-8 text-lg max-w-md mx-auto">
            Добавь SWAGAgpt.AI на свой сервер и открой ИИ-возможности для своего сообщества.
          </p>
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 text-white font-bold px-10 py-4 rounded-xl transition-all text-lg hover:-translate-y-0.5"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`,
              boxShadow: `0 8px 32px ${PRIMARY}45`,
            }}
          >
            <DiscordIcon />
            Добавить бота бесплатно
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-10 border-t border-border/50">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})` }}
          >
            <DiscordIcon />
          </div>
          <span>
            <strong className="text-foreground">SWAGAgpt.AI</strong> — бот для{" "}
            <strong className="text-foreground">𝐒 𝐖 𝐀 𝐆 𝐀</strong>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>Powered by Google Gemini AI</span>
          <span>·</span>
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-red-400"
            style={{ color: PRIMARY_LIGHT }}
          >
            Пригласить бота
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <Hero />
      <Features />
      <Commands />
      <HowToStart />
      <CTA />
      <Footer />
    </div>
  );
}
