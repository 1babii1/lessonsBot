import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";

type Lesson = {
  id: number;
  title: string;
  counter: number;
};

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN не задан в .env");
}

const bot = new TelegramBot(token, { polling: true });

// Подключение к SQLite
const db = new sqlite3.Database("./lessons.db");

// Создание таблицы (если её нет)
db.run(`
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    counter INTEGER NOT NULL
  )
`);

// Команда /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привет! Я бот для учёта уроков.");
});

// Команда /lessons — показать оставшиеся уроки
bot.onText(/\/lessons/, (msg) => {
  const now = new Date();

  // Получаем уроки из БД
  db.all<Lesson>(
    "SELECT * FROM lessons WHERE counter > 0",
    (err, rows: Lesson[]) => {
      if (err) {
        console.error("Ошибка при запросе к БД:", err);
        bot.sendMessage(msg.chat.id, "Произошла ошибка при получении данных.");
        return;
      }

      if (rows.length === 0) {
        bot.sendMessage(msg.chat.id, "Нет предстоящих уроков.");
      } else {
        const list = rows
          .map((lesson) => `- ${lesson.title} (осталось: ${lesson.counter})`)
          .join("\n");
        bot.sendMessage(msg.chat.id, `Оставшиеся уроки:\n${list}`);
      }
    },
  );
});

bot.onText(/\/add_lesson (.+?) (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const title = match![1].trim();
  const count = parseInt(match![2], 10);

  if (count <= 0) {
    bot.sendMessage(chatId, "Количество должно быть больше 0.");
    return;
  }

  // UPSERT: вставка или обновление
  db.run(
    `INSERT INTO lessons (title, counter) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET counter = excluded.counter`,
    [title, count],
    function (err) {
      if (err) {
        console.error("Ошибка БД:", err);
        bot.sendMessage(chatId, "Ошибка при добавлении урока.");
        return;
      }
      bot.sendMessage(
        chatId,
        `Урок "${title}" добавлен/обновлён. Осталось: ${count}`,
      );
    },
  );
});

bot.onText(/\/done (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const title = match![1].trim();

  db.get<Lesson>(
    "SELECT id, counter FROM lessons WHERE title = ?",
    [title],
    (err, row) => {
      if (err) {
        console.error("Ошибка БД:", err);
        bot.sendMessage(chatId, "Ошибка при поиске урока.");
        return;
      }
      if (!row) {
        bot.sendMessage(chatId, `Урок "${title}" не найден.`);
        return;
      }

      const newCounter = row.counter - 1;
      if (newCounter <= 0) {
        // Удаляем урок
        db.run("DELETE FROM lessons WHERE id = ?", [row.id], function (err) {
          if (err) {
            console.error("Ошибка удаления:", err);
            bot.sendMessage(chatId, "Ошибка при удалении.");
            return;
          }
          bot.sendMessage(chatId, `Урок "${title}" завершён!`);
        });
      } else {
        // Обновляем counter
        db.run(
          "UPDATE lessons SET counter = ? WHERE id = ?",
          [newCounter, row.id],
          function (err) {
            if (err) {
              console.error("Ошибка обновления:", err);
              bot.sendMessage(chatId, "Ошибка при обновлении.");
              return;
            }
            bot.sendMessage(
              chatId,
              `Урок "${title}" обновлён. Осталось: ${newCounter}`,
            );
          },
        );
      }
    },
  );
});

console.log("Бот запущен!");
