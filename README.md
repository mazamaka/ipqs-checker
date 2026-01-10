# IPQS Fingerprint Checker

Сервис для проверки Device Fingerprint через IPQS API с использованием ключа indeed.com.

## Компоненты

- **FastAPI backend** — API сервер и прокси для IPQS
- **Firefox Extension** — расширение для перехвата IPQS данных с indeed.com

## Структура проекта

```
ipqs-checker/
├── app/
│   └── main.py          # FastAPI сервер
├── static/
│   ├── index.html       # Главная страница с инструкцией
│   └── result.html      # Страница результатов проверки
├── extension/           # Firefox расширение
│   ├── manifest.json    # Манифест v2
│   ├── background.js    # Перехват IPQS через webRequest
│   ├── content.js       # Content script для indeed.com
│   ├── popup.html       # Popup расширения
│   └── popup.js         # Логика popup
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## Установка расширения

### Firefox

1. Открой Firefox
2. В адресной строке введи: `about:debugging#/runtime/this-firefox`
3. Нажми **"Загрузить временное дополнение..."**
4. Перейди в папку `extension/`
5. Выбери файл **manifest.json**

> Временное расширение удаляется при перезапуске Firefox.

### Chrome / Chromium / Octo Browser

1. Открой `chrome://extensions/`
2. Включи **"Режим разработчика"** (справа вверху)
3. Нажми **"Загрузить распакованное расширение"**
4. Выбери папку `extension-chrome/`

Или используй готовый архив `extension-chrome.zip`.

## Как пользоваться

1. Установи расширение (см. выше)
2. Нажми на иконку расширения в панели браузера
3. Нажми кнопку "Проверить"
4. Дождись результатов на странице

## Запуск сервера

### Локально

```bash
cd app && uvicorn main:app --reload --port 8000
```

### Docker

```bash
docker build -t ipqs-checker .
docker run -p 8000:8000 ipqs-checker
```

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Главная страница |
| GET | `/result` | Страница результатов |
| GET | `/health` | Health check |
| POST | `/api/extension/report` | Приём данных от расширения |
| GET | `/api/extension/result/{session_id}` | Получение результатов |

## Как работает

1. Пользователь нажимает кнопку в popup расширения
2. Расширение очищает куки indeed.com
3. Открывается secure.indeed.com/auth
4. webRequest перехватывает ответ от IPQS
5. Данные отправляются на сервер
6. Открывается страница с результатами

## Технологии

- Python 3.11+, FastAPI, httpx
- Firefox Extension (Manifest V2)
- Docker
