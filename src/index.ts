import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { MongoClient, Db, Collection } from "mongodb";

dotenv.config();

type Lesson = {
  _id: string;
  title: string;
  counter: number;
};

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN не задан в .env");
}

const bot = new TelegramBot(token, { polling: true });

// Подключение к MongoDB
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://mongo:27017/lessonsdb";
const client = new MongoClient(MONGODB_URI);

let db: Db;
let lessonsCollection: Collection<Lesson>;

async function initDB() {
  try {
    await client.connect();
    console.log("Подключено к MongoDB");
    db = client.db();
    lessonsCollection = db.collection<Lesson>("lessons");
  } catch (err) {
    console.error("Ошибка подключения к MongoDB:", err);
    process.exit(1);
  }
}

// Команда /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Привет! Я бот для учёта уроков.
    /add_lesson <название> <число> - добавить урок,
    /done <название> - завершить урок,
    /lessons - показать оставшиеся уроки.`,
  );
});

// Команда /lessons — показать оставшиеся уроки
bot.onText(/\/lessons/, async (msg) => {
  try {
    const lessons = await lessonsCollection
      .find({ counter: { $gt: 0 } })
      .toArray();

    if (lessons.length === 0) {
      bot.sendMessage(msg.chat.id, "Нет предстоящих уроков.");
    } else {
      const list = lessons
        .map((lesson) => `- ${lesson.title} (осталось: ${lesson.counter})`)
        .join("\n");
      bot.sendMessage(msg.chat.id, `Оставшиеся уроки:\n${list}`);
    }
  } catch (err) {
    console.error("Ошибка при запросе к БД:", err);
    bot.sendMessage(msg.chat.id, "Произошла ошибка при получении данных.");
  }
});

// Команда /add_lesson <название> <число>
bot.onText(/\/add_lesson (.+?) (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const title = match![1].trim();
  const count = parseInt(match![2], 10);

  if (count <= 0) {
    bot.sendMessage(chatId, "Количество должно быть больше 0.");
    return;
  }

  try {
    const result = await lessonsCollection.updateOne(
      { title },
      { $set: { title, counter: count } },
      { upsert: true },
    );

    bot.sendMessage(
      chatId,
      `Ученик "${title}" добавлен/обновлён. Осталось: ${count}`,
    );
  } catch (err) {
    console.error("Ошибка БД:", err);
    bot.sendMessage(chatId, "Ошибка при добавлении урока.");
  }
});

// Команда /done <название>
bot.onText(/\/done (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const title = match![1].trim();

  try {
    const lesson = await lessonsCollection.findOne({ title });

    if (!lesson) {
      bot.sendMessage(chatId, `Ученик "${title}" не найден.`);
      return;
    }

    const newCounter = lesson.counter - 1;

    if (newCounter <= 0) {
      // Удаляем урок
      await lessonsCollection.deleteOne({ _id: lesson._id });
      bot.sendMessage(chatId, `Ученик "${title}" завершил урок!`);
    } else {
      // Обновляем counter
      await lessonsCollection.updateOne(
        { _id: lesson._id },
        { $set: { counter: newCounter } },
      );
      bot.sendMessage(
        chatId,
        `Ученик "${title}" обновлён. Осталось: ${newCounter}`,
      );
    }
  } catch (err) {
    console.error("Ошибка БД:", err);
    bot.sendMessage(chatId, "Ошибка при обработке.");
  }
});

// Инициализация и запуск
initDB()
  .then(() => {
    console.log("Бот запущен!");
  })
  .catch((err) => {
    console.error("Критическая ошибка:", err);
    process.exit(1);
  });
