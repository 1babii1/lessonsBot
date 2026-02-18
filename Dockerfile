FROM node:20-alpine

WORKDIR /app

# Копируем package.json и lock
COPY package*.json ./

# Устанавливаем ВСЕ зависимости (включая dev)
RUN npm ci  # без --only=production!

# Копируем конфигурацию TypeScript
COPY tsconfig.json ./

# Копируем исходный код
COPY . .

# Собираем проект (tsc → dist/)
RUN npm run build

EXPOSE 3000

# Запускаем скомпилированный код из dist/
CMD ["node", "dist/index.js"]
