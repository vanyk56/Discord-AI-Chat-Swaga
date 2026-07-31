import { SlashCommandBuilder } from "discord.js";

export const commands = [
  // ── ОСНОВНЫЕ ────────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Показать список всех команд бота"),

  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Задать вопрос ИИ")
    .addStringOption((opt) =>
      opt.setName("вопрос").setDescription("Твой вопрос").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("imagine")
    .setDescription("Создать изображение по описанию")
    .addStringOption((opt) =>
      opt.setName("описание").setDescription("Что нарисовать").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Очистить историю разговора в этом канале"),

  new SlashCommandBuilder()
    .setName("skala")
    .setDescription("🗿 Задать вопрос Skala (Dolphin Mistral 24B Venice Edition)")
    .addStringOption((opt) =>
      opt.setName("вопрос").setDescription("Твой вопрос к Skala").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mode")
    .setDescription("⚙️ Переключить режим ответов бота в этом канале")
    .addStringOption((opt) =>
      opt
        .setName("режим")
        .setDescription("Выбери режим ответов для канала")
        .setRequired(true)
        .addChoices(
          { name: "⚡ Стандартный (Qwen 3.7 Flash)", value: "standard" },
          { name: "🗿 Skala (Dolphin Mistral 24B Venice Edition)", value: "skala" },
        )
    ),

  new SlashCommandBuilder()
    .setName("voice-chat")
    .setDescription("🎙️ Живой голосовой диалог с ИИ (Skala + Fish Audio)")
    .addSubcommand((sub) =>
      sub
        .setName("старт")
        .setDescription("Запустить живой голосовой диалог с ботом")
        .addChannelOption((opt) =>
          opt
            .setName("канал")
            .setDescription("Голосовой канал (по умолчанию: твой текущий канал)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("стоп").setDescription("Остановить голосовой диалог и выйти")
    ),

  // ── ПОЛЕЗНЫЕ КОМАНДЫ ────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("summary")
    .setDescription("📋 Краткое резюме последних сообщений в канале")
    .addIntegerOption((opt) =>
      opt
        .setName("количество")
        .setDescription("Сколько сообщений суммаризировать (по умолчанию 30, макс 100)")
        .setMinValue(5)
        .setMaxValue(100)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("translate")
    .setDescription("🌐 Перевести текст на любой язык")
    .addStringOption((opt) =>
      opt.setName("текст").setDescription("Текст для перевода").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("язык")
        .setDescription("Язык перевода (по умолчанию: английский)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("code")
    .setDescription("💻 Написать код по описанию задачи")
    .addStringOption((opt) =>
      opt.setName("задача").setDescription("Что нужно написать").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("язык")
        .setDescription("Язык программирования (по умолчанию: python)")
        .setRequired(false)
        .addChoices(
          { name: "Python", value: "python" },
          { name: "JavaScript", value: "javascript" },
          { name: "TypeScript", value: "typescript" },
          { name: "Java", value: "java" },
          { name: "C++", value: "c++" },
          { name: "C#", value: "c#" },
          { name: "Go", value: "go" },
          { name: "Rust", value: "rust" },
          { name: "SQL", value: "sql" },
          { name: "Bash", value: "bash" },
          { name: "HTML/CSS", value: "html" },
        )
    ),

  new SlashCommandBuilder()
    .setName("explain")
    .setDescription("📚 Объяснить любую тему простым языком")
    .addStringOption((opt) =>
      opt.setName("тема").setDescription("Что объяснить?").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("уровень")
        .setDescription("Уровень объяснения")
        .setRequired(false)
        .addChoices(
          { name: "Просто (как 5-летнему)", value: "просто" },
          { name: "Средне (школьник)", value: "средне" },
          { name: "Сложно (специалист)", value: "сложно" },
        )
    ),

  new SlashCommandBuilder()
    .setName("fact")
    .setDescription("🌍 Интересный факт от ИИ")
    .addStringOption((opt) =>
      opt
        .setName("тема")
        .setDescription("Тема факта (необязательно): наука, история, животные и т.д.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("joke")
    .setDescription("😄 Анекдот или шутка от ИИ")
    .addStringOption((opt) =>
      opt
        .setName("тема")
        .setDescription("Тема анекдота (необязательно)")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("стиль")
        .setDescription("Стиль юмора")
        .setRequired(false)
        .addChoices(
          { name: "Обычный", value: "обычный" },
          { name: "Сухой (deadpan)", value: "сухой" },
          { name: "Абсурд", value: "абсурд" },
          { name: "Умный (каламбур)", value: "умный" },
        )
    ),

  // ── ИГРЫ ────────────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("🧠 Викторина — серия вопросов с таблицей лидеров!")
    .addStringOption((opt) =>
      opt
        .setName("тема")
        .setDescription("Тема вопросов (необязательно): история, наука, кино...")
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("количество")
        .setDescription("Количество вопросов (по умолчанию 5, максимум 15)")
        .setMinValue(1)
        .setMaxValue(15)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("quest")
    .setDescription("⚔️ Текстовое RPG-приключение с выборами, созданное ИИ")
    .addStringOption((opt) =>
      opt
        .setName("тема")
        .setDescription("Тема или сеттинг квеста (например: космос, пираты, киберпанк, средневековье)")
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("события")
        .setDescription("Количество событий в квесте (по умолчанию 5, от 3 до 15)")
        .setMinValue(3)
        .setMaxValue(15)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("crocodile")
    .setDescription("🐊 Крокодил — один описывает слово, весь чат угадывает!")
    .addStringOption((opt) =>
      opt
        .setName("тема")
        .setDescription("Тема слов (необязательно): животные, фильмы, еда...")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("mostlikely")
    .setDescription("🎯 Кто скорее всего... — голосуй за участников под смешные вопросы!")
    .addIntegerOption((opt) =>
      opt
        .setName("раунды")
        .setDescription("Количество раундов (по умолчанию 5, от 3 до 10)")
        .setMinValue(3)
        .setMaxValue(10)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("truthorlie")
    .setDescription("🃏 Правда или Ложь — найди ложное утверждение среди четырёх!")
    .addStringOption((opt) =>
      opt
        .setName("тема")
        .setDescription("Тема утверждений (необязательно): наука, история, животные...")
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("раунды")
        .setDescription("Количество раундов (по умолчанию 5, от 3 до 10)")
        .setMinValue(3)
        .setMaxValue(10)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("riddle")
    .setDescription("🔮 Загадка от ИИ — у вас 60 секунд чтобы ответить в чат"),

  // ── DICK ────────────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("dick")
    .setDescription("🍆 Ежедневный замер агрегата (кулдаун 24 часа)"),

  new SlashCommandBuilder()
    .setName("fight")
    .setDescription("⚔️ Драка агрегатами — победитель забирает сантиметры у соперника!")
    .addUserOption((opt) =>
      opt.setName("цель").setDescription("Кого вызываешь на бой?").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("ставка").setDescription("На сколько см сражаться?").setRequired(true).setMinValue(1).setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("top")
    .setDescription("🏆 Топ агрегатов на сервере"),

  new SlashCommandBuilder()
    .setName("dickset")
    .setDescription("🔧 [Только адмін] Установить размер дика пользователю")
    .addUserOption((opt) =>
      opt.setName("пользователь").setDescription("Кому установить размер").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("размер").setDescription("Новый размер в см").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("duel")
    .setDescription("⚡ Вызвать другого игрока на дуэль — ИИ придумает испытание и рассудит")
    .addUserOption((opt) =>
      opt.setName("opponent").setDescription("Кого вызываешь на дуэль?").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("fortune")
    .setDescription("🔮 Узнать предсказание судьбы от ИИ"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("🛑 Остановить трансляцию / активный ивент и выйти из голосового канала"),

  // ── АВТО-МОДЕРАЦИЯ ───────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("🛡️ Управление авто-модерацией (нецензурная лексика и 18+ контент)")
    .addSubcommand((sub) =>
      sub.setName("включить").setDescription("Включить авто-модерацию на сервере")
    )
    .addSubcommand((sub) =>
      sub.setName("выключить").setDescription("Выключить авто-модерацию на сервере")
    )
    .addSubcommand((sub) =>
      sub.setName("статус").setDescription("Показать текущий статус авто-модерации")
    ),

  // ── ТВОРЧЕСТВО ──────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("meme")
    .setDescription("😂 Сгенерировать мем по описанию")
    .addStringOption((opt) =>
      opt.setName("описание").setDescription("Тема или идея мема").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("comic")
    .setDescription("📖 Создать мини-комикс из 3 панелей по сценарию")
    .addStringOption((opt) =>
      opt.setName("сценарий").setDescription("О чём будет комикс?").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("🎨 Создать аватарку для профиля")
    .addStringOption((opt) =>
      opt.setName("описание").setDescription("Как должна выглядеть аватарка?").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("стиль")
        .setDescription("Стиль аватарки")
        .setRequired(false)
        .addChoices(
          { name: "🌸 Аниме", value: "anime" },
          { name: "👾 Пиксель-арт", value: "pixel" },
          { name: "📷 Реалистичный", value: "realistic" },
          { name: "🎨 Мультяшный", value: "cartoon" },
          { name: "⚔️ Фэнтези", value: "fantasy" },
          { name: "🤖 Киберпанк", value: "cyberpunk" },
        )
    ),

  // ── УПРАВЛЕНИЕ СЕРВЕРОМ ──────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("📊 Создать голосование с живым счётчиком голосов")
    .addStringOption((opt) =>
      opt.setName("вопрос").setDescription("Вопрос для голосования").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("вариант1").setDescription("Вариант 1").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("вариант2").setDescription("Вариант 2").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("вариант3").setDescription("Вариант 3 (необязательно)").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("вариант4").setDescription("Вариант 4 (необязательно)").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("вариант5").setDescription("Вариант 5 (необязательно)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Настроить авто-приветствие новых участников через ИИ")
    .addSubcommand((sub) =>
      sub
        .setName("включить")
        .setDescription("Включить авто-приветствие в выбранном канале")
        .addChannelOption((opt) =>
          opt.setName("канал").setDescription("В каком канале приветствовать").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("стиль")
            .setDescription("Стиль приветствия")
            .setRequired(false)
            .addChoices(
              { name: "Дружелюбный", value: "дружелюбный" },
              { name: "Официальный", value: "официальный" },
              { name: "Смешной", value: "смешной" },
              { name: "Мистический", value: "мистический" },
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName("выключить").setDescription("Отключить авто-приветствие")
    )
    .addSubcommand((sub) =>
      sub.setName("тест").setDescription("Отправить тестовое приветствие в настроенный канал")
    ),

  new SlashCommandBuilder()
    .setName("persona")
    .setDescription("🎭 Сменить личность и стиль общения бота")
    .addStringOption((opt) =>
      opt
        .setName("стиль")
        .setDescription("Выбери стиль общения")
        .setRequired(true)
        .addChoices(
          { name: "😊 Дружелюбный", value: "дружелюбный" },
          { name: "🎩 Серьёзный", value: "серьёзный" },
          { name: "🧘 Философский", value: "философский" },
          { name: "😏 Саркастичный", value: "саркастичный" },
          { name: "🏴‍☠️ Пират", value: "пират" },
          { name: "⚔️ Средневековый рыцарь", value: "средневековый" },
        )
    ),

  // ── АГРЕГАТ — НОВЫЕ КОМАНДЫ ─────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("gift")
    .setDescription("🎁 Подарить часть своего агрегата другому участнику")
    .addUserOption((opt) =>
      opt.setName("кому").setDescription("Кому дарить").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("размер").setDescription("Сколько см подарить").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("compare")
    .setDescription("🔍 Сравнить свой агрегат с агрегатом другого участника")
    .addUserOption((opt) =>
      opt.setName("кого").setDescription("Кого сравниваем").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("📊 Узнать своё место в рейтинге сервера"),

  new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("🎰 Поставить часть агрегата на рулетку (шанс x1 или x3 джекпот)")
    .addIntegerOption((opt) =>
      opt.setName("ставка").setDescription("Сколько см ставить").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("steal")
    .setDescription("🗡️ Попытаться украсть агрегат (40% успех, иначе сам теряешь)")
    .addUserOption((opt) =>
      opt.setName("цель").setDescription("У кого красть").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("potion")
    .setDescription("🧪 Выпить случайное зелье (кулдаун 48 часов)"),

  new SlashCommandBuilder()
    .setName("tournament")
    .setDescription("🏆 Открыть турнир агрегатов — участники вступают 45 секунд"),

  new SlashCommandBuilder()
    .setName("allin")
    .setDescription("💀 Ва-банк: победитель забирает всё у проигравшего")
    .addUserOption((opt) =>
      opt.setName("соперник").setDescription("Кого вызвать на ва-банк").setRequired(true)
    ),

  // ── ГОЛОС / ТРАНСЛЯЦИЯ ──────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("broadcast")
    .setDescription("📡 Воспроизвести аудио из YouTube в голосовом канале")
    .addStringOption((opt) =>
      opt
        .setName("ссылка")
        .setDescription("Ссылка на YouTube-видео или прямой URL аудиопотока")
        .setRequired(true)
    ),

  // ── АКТИВАЦИЯ ───────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("activate")
    .setDescription("🔑 Активировать бота на сервере с помощью кода")
    .addStringOption((opt) =>
      opt
        .setName("код")
        .setDescription("Код активации в формате SWAG-XXXXXX-XXXXXX")
        .setRequired(true)
    )
    .setDefaultMemberPermissions("32"), // MANAGE_GUILD permission

  new SlashCommandBuilder()
    .setName("gencode")
    .setDescription("⚙️ [Только для владельца] Сгенерировать коды активации")
    .addIntegerOption((opt) =>
      opt
        .setName("количество")
        .setDescription("Сколько кодов сгенерировать (по умолчанию 1, макс 10)")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("deactivate")
    .setDescription("⚙️ [Только для владельца] Деактивировать сервер")
    .addStringOption((opt) =>
      opt
        .setName("сервер")
        .setDescription("ID сервера для деактивации")
        .setRequired(true)
    ),

  // ── АВТО-РОЛЬ ───────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("🎲 Авто-выдача уникальных ИИ-ролей новым участникам")
    .addSubcommand((sub) =>
      sub.setName("включить").setDescription("Включить авто-выдачу уникальных ролей новым участникам")
    )
    .addSubcommand((sub) =>
      sub.setName("выключить").setDescription("Выключить авто-выдачу ролей")
    )
    .addSubcommand((sub) =>
      sub.setName("статус").setDescription("Проверить статус авто-ролей")
    )
    .addSubcommand((sub) =>
      sub.setName("выдать-всем").setDescription("Выдать уникальные роли всем участникам у которых их нет")
    )
    .setDefaultMemberPermissions("268435456"),

  // ── РОЛИ ────────────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("role-create")
    .setDescription("🎨 Создать новую роль на сервере")
    .addStringOption((opt) =>
      opt.setName("название").setDescription("Название роли").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("цвет").setDescription("Цвет: слово (красный, синий, gold) или HEX (#ff5733)").setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName("упоминаемая").setDescription("Можно ли упоминать роль через @").setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName("отдельно").setDescription("Отображать отдельно в списке участников").setRequired(false)
    )
    .setDefaultMemberPermissions("268435456"),

  new SlashCommandBuilder()
    .setName("role-delete")
    .setDescription("🗑️ Удалить роль с сервера")
    .addRoleOption((opt) =>
      opt.setName("роль").setDescription("Роль для удаления").setRequired(true)
    )
    .setDefaultMemberPermissions("268435456"),

  new SlashCommandBuilder()
    .setName("role-edit")
    .setDescription("✏️ Изменить существующую роль")
    .addRoleOption((opt) =>
      opt.setName("роль").setDescription("Роль для изменения").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("новое-название").setDescription("Новое название роли").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("цвет").setDescription("Цвет: слово (красный, синий, gold) или HEX (#3498db)").setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName("упоминаемая").setDescription("Можно ли упоминать роль через @").setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName("отдельно").setDescription("Отображать отдельно в списке участников").setRequired(false)
    )
    .setDefaultMemberPermissions("268435456"),

  new SlashCommandBuilder()
    .setName("role-give")
    .setDescription("✅ Выдать роль участнику")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Кому выдать роль").setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName("роль").setDescription("Какую роль выдать").setRequired(true)
    )
    .setDefaultMemberPermissions("268435456"),

  new SlashCommandBuilder()
    .setName("role-take")
    .setDescription("🚫 Забрать роль у участника")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("У кого забрать роль").setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName("роль").setDescription("Какую роль забрать").setRequired(true)
    )
    .setDefaultMemberPermissions("268435456"),

  new SlashCommandBuilder()
    .setName("role-list")
    .setDescription("📋 Показать все роли сервера"),

  // ── СОЦИАЛЬНЫЕ ──────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("приговор")
    .setDescription("⚖️ ИИ выносит абсурдный приговор участнику")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Кому выносим приговор").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roast")
    .setDescription("🔥 ИИ жёстко (но по-доброму) подкалывает участника")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Кого поджарить").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("медаль")
    .setDescription("🏅 Выдать участнику смешную почётную медаль")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Кому вручить медаль").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("причина").setDescription("За что именно (необязательно)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("аватар-вайб")
    .setDescription("🔮 ИИ анализирует ауру и вайб участника")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Чью ауру анализируем (пусто = твоя)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("совместимость")
    .setDescription("💘 Проверить совместимость двух участников")
    .addUserOption((opt) =>
      opt.setName("участник1").setDescription("Первый участник").setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName("участник2").setDescription("Второй участник").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("пара")
    .setDescription("💕 Случайно спарить двух участников сервера"),

  new SlashCommandBuilder()
    .setName("поженить")
    .setDescription("💍 Поженить двух конкретных участников с общей ролью")
    .addUserOption((opt) =>
      opt.setName("участник1").setDescription("Первый участник").setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName("участник2").setDescription("Второй участник").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("анон")
    .setDescription("🕵️ Отправить анонимное сообщение в канал")
    .addStringOption((opt) =>
      opt.setName("сообщение").setDescription("Текст анонимного сообщения").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("новости")
    .setDescription("📰 Абсурдные ИИ-новости про этот сервер"),

  // ── ИГРЫ ─────────────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("испытание")
    .setDescription("⚡ ИИ придумывает испытание для всего чата"),

  new SlashCommandBuilder()
    .setName("конкурс")
    .setDescription("🏆 Конкурс с ИИ-судьёй — кто лучший ответ")
    .addStringOption((opt) =>
      opt.setName("тема").setDescription("Тема конкурса").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("время").setDescription("Время в секундах (по умолчанию 120, макс 300)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("мафия")
    .setDescription("🎭 Запустить игру в Мафию прямо в Discord"),

  // ── ЭКОНОМИКА ────────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("баланс")
    .setDescription("🪙 Посмотреть баланс кошелька и портфель акций")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Чей баланс (пусто = твой)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("топ-богачей")
    .setDescription("🏆 Топ 10 богатейших участников сервера"),

  new SlashCommandBuilder()
    .setName("ежедневный")
    .setDescription("🎁 Получить ежедневный бонус монет"),

  new SlashCommandBuilder()
    .setName("перевести")
    .setDescription("💸 Перевести монеты другому участнику")
    .addUserOption((opt) =>
      opt.setName("участник").setDescription("Кому отправить").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("сумма").setDescription("Сколько монет").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("акции")
    .setDescription("📈 Биржа — торгуй акциями участников сервера")
    .addSubcommand((sub) =>
      sub.setName("список").setDescription("Список всех акций на сервере")
    )
    .addSubcommand((sub) =>
      sub
        .setName("создать")
        .setDescription("Выпустить собственные акции (стоит монет)")
        .addStringOption((opt) => opt.setName("символ").setDescription("Тикер: 2–5 букв/цифр, напр. SWAG").setRequired(true))
        .addStringOption((opt) => opt.setName("название").setDescription("Название акции/клана").setRequired(true))
        .addIntegerOption((opt) => opt.setName("акций").setDescription("Сколько акций выпустить (10–10 000)").setRequired(true).setMinValue(10).setMaxValue(10000))
        .addIntegerOption((opt) => opt.setName("цена").setDescription("Стартовая цена за 1 акцию").setRequired(false).setMinValue(1).setMaxValue(10000))
    )
    .addSubcommand((sub) =>
      sub
        .setName("купить")
        .setDescription("Купить акции")
        .addStringOption((opt) => opt.setName("символ").setDescription("Тикер акции").setRequired(true))
        .addIntegerOption((opt) => opt.setName("количество").setDescription("Сколько купить").setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName("продать")
        .setDescription("Продать акции из портфеля")
        .addStringOption((opt) => opt.setName("символ").setDescription("Тикер акции").setRequired(true))
        .addIntegerOption((opt) => opt.setName("количество").setDescription("Сколько продать").setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName("инфо")
        .setDescription("Подробная информация и график цены")
        .addStringOption((opt) => opt.setName("символ").setDescription("Тикер акции").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("конфиг-монеты")
    .setDescription("⚙️ Настройка экономики сервера (только для администраторов)")
    .addSubcommand((sub) => sub.setName("показать").setDescription("Показать текущие настройки"))
    .addSubcommand((sub) =>
      sub
        .setName("монеты-за-сообщение")
        .setDescription("Монет за каждое сообщение")
        .addIntegerOption((opt) => opt.setName("значение").setDescription("Сколько монет (0 — отключить)").setRequired(true).setMinValue(0).setMaxValue(100))
        .addIntegerOption((opt) => opt.setName("кулдаун").setDescription("Кулдаун в секундах").setRequired(false).setMinValue(1).setMaxValue(3600))
    )
    .addSubcommand((sub) =>
      sub.setName("ежедневный").setDescription("Размер ежедневного бонуса")
        .addIntegerOption((opt) => opt.setName("значение").setDescription("Количество монет").setRequired(true).setMinValue(0).setMaxValue(10000))
    )
    .addSubcommand((sub) =>
      sub.setName("победа-в-игре").setDescription("Монет за победу в игре")
        .addIntegerOption((opt) => opt.setName("значение").setDescription("Количество монет").setRequired(true).setMinValue(0).setMaxValue(1000))
    )
    .addSubcommand((sub) =>
      sub.setName("акция-стоимость").setDescription("Стоимость создания акции")
        .addIntegerOption((opt) => opt.setName("значение").setDescription("Количество монет").setRequired(true).setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub.setName("налог-перевода").setDescription("Налог на перевод монет (%)")
        .addIntegerOption((opt) => opt.setName("значение").setDescription("Процент (0–50)").setRequired(true).setMinValue(0).setMaxValue(50))
    )
    .addSubcommand((sub) =>
      sub.setName("валюта").setDescription("Название и эмодзи валюты")
        .addStringOption((opt) => opt.setName("название").setDescription("Название (напр. «монет»)").setRequired(false))
        .addStringOption((opt) => opt.setName("эмодзи").setDescription("Эмодзи валюты (напр. 💰)").setRequired(false))
    ),

  new SlashCommandBuilder()
    .setName("дать-монеты")
    .setDescription("🛡️ Выдать или снять монеты у участника (только для администраторов)")
    .addUserOption((opt) => opt.setName("участник").setDescription("Кому").setRequired(true))
    .addIntegerOption((opt) => opt.setName("сумма").setDescription("Сумма (отрицательная = снять)").setRequired(true)),

  // ── ТРАНСКРИПЦИЯ ─────────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("транскрипция")
    .setDescription("🎙️ Транскрибировать разговор в голосовом канале через ИИ")
    .addSubcommand((sub) =>
      sub
        .setName("старт")
        .setDescription("Зайти в голосовой канал и начать транскрипцию")
        .addChannelOption((opt) =>
          opt
            .setName("канал")
            .setDescription("Голосовой канал (по умолчанию — твой текущий канал)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("стоп").setDescription("Остановить транскрипцию и выйти из голосового канала")
    ),

  // ── ПЕРЕСКАЗ КНИГИ ───────────────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("пересказ")
    .setDescription("📚 Пересказ фрагмента книги или документа (PDF/EPUB) с помощью ИИ")
    .addAttachmentOption((opt) =>
      opt.setName("файл").setDescription("Файл PDF или EPUB для пересказа").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("от_страницы").setDescription("С какой страницы (главы) начать").setRequired(true).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt.setName("до_страницы").setDescription("По какую страницу (главу) включительно (макс. 100 стр. за раз)").setRequired(true).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt.setName("слов").setDescription("Желаемый объём пересказа в словах (по умолчанию 400)").setRequired(false)
        .addChoices(
          { name: "Кратко (~150 слов)", value: 150 },
          { name: "Средне (~400 слов)", value: 400 },
          { name: "Подробно (~800 слов)", value: 800 },
          { name: "Очень подробно (~1500 слов)", value: 1500 },
        )
    ),
];
