# IPQS Fingerprint Checker

## Описание проекта

Сервис для проверки Device Fingerprint через IPQS API с использованием ключа indeed.com. Состоит из:
- **FastAPI backend** - API сервер и прокси для IPQS
- **Browser Extension** - Firefox расширение для перехвата IPQS данных с indeed.com

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
│   ├── popup.js         # Логика popup
│   └── *.xpi/*.zip      # Собранные архивы расширения
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## Ключевые технологии

- **Python 3.11+**, FastAPI, httpx
- **Firefox Extension** (Manifest V2) с webRequest API
- **Docker** для деплоя
- **browsingData API** для очистки куков indeed.com

## Команды разработки

```bash
# Локальный запуск
cd app && uvicorn main:app --reload --port 8000

# Сборка расширения
cd extension && zip -r ipqs-checker.zip manifest.json background.js content.js popup.html popup.js icon*.png && cp ipqs-checker.zip ipqs-checker.xpi

# Docker build
docker build -t ipqs-checker .
```

## Деплой

- **Сервер**: 94.156.232.242 (admin)
- **Домен**: check-ipqs.farm-mafia.cash
- **Portainer**: через stack ipqs-checker
- **SSL**: Nginx Proxy Manager с wildcard *.farm-mafia.cash

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | / | Главная страница |
| GET | /result | Страница результатов |
| GET | /health | Health check |
| POST | /api/extension/report | Приём данных от расширения |
| GET | /api/extension/result/{session_id} | Получение результатов |
| GET | /ipqs/{path} | Прокси к IPQS API |

## Как работает расширение

1. Пользователь нажимает кнопку в popup
2. Расширение очищает куки indeed.com через browsingData API
3. Открывается secure.indeed.com/auth
4. webRequest перехватывает ответ от ipqscdn.com/learn/fetch
5. Данные отправляются на сервер
6. Открывается страница результатов, popup закрывается

## Важные особенности

- **IPQS ключ привязан к домену indeed.com** - поэтому используется расширение
- **filterResponseData** работает только в Firefox
- **browsingData API** нужен для полной очистки (куки + кэш + localStorage)
- Результаты хранятся in-memory (для прода нужен Redis)
