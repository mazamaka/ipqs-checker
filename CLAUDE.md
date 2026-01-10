# IPQS Fingerprint Checker

## Назначение проекта

**Сервис для проверки качества Octo Browser сессий** через IPQS Device Fingerprint API.

Позволяет проверить:
- Насколько "чистый" fingerprint у антидетект-профиля
- Не засвечен ли профиль (повторные визиты)
- Есть ли детекты (proxy, VPN, OS mismatch и т.д.)
- Fraud Score профиля

## ⚠️ КРИТИЧЕСКИ ВАЖНО

### Не ломать проверку через indeed.com!

**ЗАПРЕЩЕНО** вносить изменения, которые могут нарушить корректную работу проверки:

1. **НЕ менять URL проверки** - `https://secure.indeed.com/auth` это единственный рабочий endpoint
2. **НЕ менять логику перехвата IPQS** - паттерн `ipqscdn.com.*learn/fetch` критичен
3. **НЕ отключать очистку данных** - browsingData.remove() обязателен перед каждой проверкой
4. **НЕ менять timing** - скрипты должны инжектиться на `document_start`
5. **НЕ добавлять лишние запросы к indeed.com** - только открытие страницы auth
6. **НЕ модифицировать fingerprint данные** - передавать как есть от IPQS

### Почему indeed.com?

IPQS API ключ привязан к домену. Indeed.com использует IPQS для проверки пользователей, и мы перехватываем их ответ — это единственный способ получить реальную IPQS проверку без платной подписки.

### Для чего это нужно?

**Проверка Octo Browser сессий перед использованием:**
- Убедиться что профиль не засвечен
- Проверить что fingerprint уникален
- Оценить риск бана (Fraud Score)
- Выявить проблемы с настройками профиля (proxy детект, timezone mismatch и т.д.)

## Описание проекта

Сервис для проверки Device Fingerprint через IPQS API с использованием ключа indeed.com. Состоит из:
- **FastAPI backend** - API сервер для приёма данных от расширений
- **Firefox Extension** (Manifest V2) - с webRequestBlocking API
- **Chrome Extension** (Manifest V3) - с script injection для Octo Browser

## Структура проекта

```
ipqs-checker/
├── app/
│   └── main.py              # FastAPI сервер
├── static/
│   ├── index.html           # Главная страница
│   └── result.html          # Страница результатов
├── extension/               # Firefox расширение (MV2)
│   ├── manifest.json
│   ├── background.js        # webRequestBlocking
│   ├── content.js
│   ├── popup.html/js
│   └── *.xpi
├── extension-chrome/        # Chrome/Octo расширение (MV3)
│   ├── manifest.json
│   ├── background.js        # Service Worker
│   ├── content.js           # Инжектор
│   ├── injected.js          # Перехват fetch/XHR
│   ├── popup.html/js
│   └── icon*.png
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## Установка расширений

### Chrome / Octo Browser (рекомендуется)

1. Открой `chrome://extensions/`
2. Включи **"Режим разработчика"**
3. Нажми **"Загрузить распакованное расширение"**
4. Выбери папку `extension-chrome/`

### Firefox

1. Открой `about:debugging#/runtime/this-firefox`
2. Нажми **"Загрузить временное дополнение..."**
3. Выбери `extension/manifest.json`

## Как работает проверка

1. Пользователь нажимает кнопку в popup расширения
2. Очищаются все данные indeed.com (cookies, cache, localStorage)
3. Открывается `https://secure.indeed.com/auth` в фоновой вкладке
4. Content script инжектирует перехватчик fetch/XHR
5. Перехватывается ответ от `ipqscdn.com/learn/fetch`
6. Данные fingerprint отправляются на наш сервер
7. Вкладка indeed.com закрывается
8. Открывается страница результатов

## Интерпретация результатов для Octo

| Показатель | Хорошо | Плохо |
|------------|--------|-------|
| Fraud Score | < 30% | > 70% |
| Fingerprint unique | ✓ Да | ✗ Нет (засвечен) |
| Visit Count | 1 | > 3 (много проверок) |
| OS Mismatch | ✓ Нет | ✗ Да |
| Proxy/VPN | Зависит от задачи | Детект = плохо |
| Bot Status | ✓ No | ✗ Yes |

## Команды разработки

```bash
# Локальный запуск сервера
cd app && uvicorn main:app --reload --port 8000

# Docker
docker build -t ipqs-checker .
docker run -p 8000:8000 ipqs-checker
```

## Деплой

- **Сервер**: 94.156.232.242 (admin)
- **Домен**: check-ipqs.farm-mafia.cash
- **Portainer**: stack ipqs-checker
- **SSL**: Nginx Proxy Manager

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | / | Главная страница |
| GET | /result | Страница результатов |
| GET | /health | Health check |
| POST | /api/extension/report | Приём данных от расширения |
| GET | /api/extension/result/{session_id} | Получение результатов |

## Технические ограничения

- **Firefox**: использует `filterResponseData` (только MV2)
- **Chrome/Octo**: использует script injection (MV3 не поддерживает webRequestBlocking)
- **Результаты**: хранятся in-memory (для прода можно добавить Redis)
- **IPQS ключ**: привязан к indeed.com, нельзя использовать напрямую
