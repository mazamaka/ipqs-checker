# IPQS Fingerprint Checker

## Назначение проекта

**Сервис для проверки качества Octo Browser сессий** через IPQS Device Fingerprint API.

Позволяет проверить:
- Насколько "чистый" fingerprint у антидетект-профиля
- Не засвечен ли профиль (повторные визиты)
- Есть ли детекты (proxy, VPN, OS mismatch и т.д.)
- Fraud Score профиля

---

## КРИТИЧЕСКИ ВАЖНО

### Не ломать проверку через indeed.com!

**ЗАПРЕЩЕНО** вносить изменения, которые могут нарушить корректную работу проверки:

1. **НЕ менять URL проверки** - `https://secure.indeed.com/auth` это единственный рабочий endpoint
2. **НЕ менять логику перехвата IPQS** - паттерн `ipqscdn.com.*learn/fetch` критичен
3. **НЕ отключать очистку данных** - `browsingData.remove()` обязателен перед каждой проверкой
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

---

## Чеклист интеграции нового сервиса

**ОБЯЗАТЕЛЬНО** при добавлении нового чекера/сервиса проверь ВСЕ пункты:

### 1. Extension (extension-chrome/)
- [ ] background.js — обработчик нового сервиса
- [ ] popup.html/js — кнопка запуска
- [ ] manifest.json — permissions, version bump
- [ ] content/injected скрипты (если нужны)

### 2. Backend (app/)
- [ ] main.py — API endpoints (/api/extension/report-*, /result-*)
- [ ] services/check_service.py — статистика нового сервиса
- [ ] models/ — если нужны новые поля

### 3. Статические страницы (static/)
- [ ] **index.html** — описание, карточка сервиса, инструкции
- [ ] result-*.html — страница результатов

### 4. Админ-панель (app/admin/)
- [ ] routes.py — добавить в valid_services
- [ ] templates/dashboard.html — статистика, badges, таблица
- [ ] templates/history.html — фильтр, badges, отображение
- [ ] templates/profile_detail.html — поддержка нового сервиса

### 5. Документация
- [ ] CLAUDE.md — обновить описание проекта если нужно

**НЕ ЗАБЫВАЙ про пользовательские страницы (index.html) — это первое что видит пользователь!**

---

## Архитектура

### Компоненты

| Компонент | Технология | Описание |
|-----------|------------|----------|
| Backend | FastAPI + Uvicorn | API сервер (Python 3.12) |
| Database | PostgreSQL 16 + asyncpg | Хранение профилей и проверок |
| ORM | SQLModel + SQLAlchemy | Async модели |
| Firefox Extension | Manifest V2 | webRequestBlocking API |
| Chrome Extension | Manifest V3 | Script injection для Octo Browser |
| Админ-панель | Jinja2 + JWT | Мониторинг и статистика |

### Поток данных

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Пользователь нажимает "Проверить" в popup              │
├─────────────────────────────────────────────────────────────┤
│ 2. background.js: clearIndeedData() → удаление cookies    │
├─────────────────────────────────────────────────────────────┤
│ 3. Открывается https://secure.indeed.com/auth             │
│    content.js инжектирует injected.js                     │
├─────────────────────────────────────────────────────────────┤
│ 4. injected.js перехватывает fetch к ipqscdn.com          │
│    Парсит JSON → CustomEvent 'ipqs-fingerprint'           │
├─────────────────────────────────────────────────────────────┤
│ 5. content.js → chrome.runtime.sendMessage                 │
│    background.js получает IPQS_FINGERPRINT                │
├─────────────────────────────────────────────────────────────┤
│ 6. POST к /api/extension/report                            │
│    {session_id, fingerprint, source}                      │
├─────────────────────────────────────────────────────────────┤
│ 7. FastAPI: Profile + Check → PostgreSQL + JSONL          │
├─────────────────────────────────────────────────────────────┤
│ 8. popup.js polling GET /api/extension/result/{session_id}│
├─────────────────────────────────────────────────────────────┤
│ 9. Открывается /result с результатами                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Структура проекта

```
ipqs-checker/
├── app/                           # FastAPI приложение
│   ├── main.py                    # Сервер (487 строк)
│   ├── config.py                  # Pydantic Settings
│   ├── db/
│   │   ├── database.py            # AsyncEngine + asyncpg
│   │   └── deps.py                # get_db dependency
│   ├── models/
│   │   ├── profile.py             # Уникальные fingerprints
│   │   └── check.py               # Результаты проверок
│   ├── services/
│   │   ├── profile_service.py     # CRUD Profile
│   │   └── check_service.py       # CRUD Check + статистика
│   └── admin/
│       ├── auth.py                # JWT авторизация
│       ├── routes.py              # Админ endpoints
│       └── templates/             # Jinja2 шаблоны
│           ├── base.html
│           ├── login.html
│           ├── dashboard.html
│           ├── profiles.html
│           ├── profile_detail.html
│           └── history.html
├── extension/                     # Firefox (MV2)
│   ├── manifest.json
│   ├── background.js              # webRequestBlocking
│   ├── content.js
│   ├── popup.html / popup.js
│   └── ipqs-checker.xpi
├── extension-chrome/              # Chrome/Octo (MV3)
│   ├── manifest.json
│   ├── background.js              # Service Worker
│   ├── content.js                 # Инжектор
│   ├── injected.js                # Перехват fetch/XHR
│   ├── popup.html / popup.js
│   └── icon*.png
├── static/
│   ├── index.html                 # Главная (инструкция)
│   └── result.html                # Страница результатов (37 KB)
├── dist/                          # Скомпилированные расширения
├── data/
│   └── visitors.jsonl             # Backup лог
├── docker-compose.yml
├── Dockerfile
├── start-up.sh
├── requirements.txt
├── .env.example
└── stack.env.example              # Для Portainer
```

---

## Модели данных

### Profile (app/models/profile.py)

Уникальное устройство, идентифицируемое по fingerprint.

```python
class Profile(SQLModel, table=True):
    id: int | None
    fingerprint_hash: str           # SHA256(canvas|webgl|device_id) - UNIQUE

    # Fingerprint компоненты
    canvas_hash: str | None
    webgl_hash: str | None
    device_id: str | None

    # Текущие данные (обновляются при каждой проверке)
    last_ip, last_country, last_city
    last_browser, last_os
    last_fraud_score: int | None

    # Статистика
    check_count: int = 0
    avg_fraud_score, max_fraud_score, min_fraud_score

    # Модерация
    is_flagged: bool = False
    notes: str | None

    # Timestamps
    first_seen, last_seen, created_at, updated_at

    # Связь 1:N
    checks: List["Check"]
```

**Индексы**: fingerprint_hash (unique), canvas+webgl, device_id, fraud_score, check_count

### Check (app/models/check.py)

Результат одной проверки.

```python
class Check(SQLModel, table=True):
    id: int | None
    profile_id: int                 # FK → profiles
    session_id: str
    guid: str

    # Геолокация
    ip_address, country, city, region
    isp, organization, asn, timezone

    # Оценки
    fraud_chance: int               # 0-100
    guid_confidence: int

    # Девайс
    browser, operating_system, true_os
    device_type, is_mobile: bool

    # Hardware fingerprints
    canvas_hash, webgl_hash, audio_hash, ssl_hash, device_id

    # Детекции (bool)
    proxy, vpn, tor, bot_status, is_crawler
    recent_abuse, high_risk_device, active_vpn, active_tor

    # Несоответствия
    os_mismatch: bool               # OS != true_os
    timezone_mismatch: bool         # Timezone != IP timezone

    # Полные данные
    raw_response: dict              # JSONB - весь ответ IPQS
    source: str = "extension"
    user_agent: str | None
    created_at: datetime
```

**Индексы**: session_id, profile_id, fraud_chance, created_at

---

## API Endpoints

### Основные

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Главная страница |
| GET | `/result` | Страница результатов |
| GET | `/health` | Health check |

### Extension API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/extension/report` | Приём fingerprint от расширения |
| GET | `/api/extension/result/{session_id}` | Получение результатов проверки |

### Visitors API (legacy)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/visitors` | История посещений |
| GET | `/api/visitors/stats` | Статистика |

### IPQS Proxy

| Метод | Путь | Описание |
|-------|------|----------|
| GET/POST | `/ipqs/{path}` | Reverse proxy для IPQS API (с патчем learn.js) |

### Админ-панель

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/login` | Форма входа |
| POST | `/admin/login` | Авторизация |
| GET | `/admin/logout` | Выход |
| GET | `/admin` | Dashboard |
| GET | `/admin/profiles` | Список профилей |
| GET | `/admin/profile/{id}` | Детали профиля |
| GET | `/admin/history` | История проверок |
| POST | `/admin/api/profile/{id}/flag` | Пометить профиль |

---

## Сервисы

### ProfileService (app/services/profile_service.py)

```python
generate_fingerprint_hash(canvas, webgl, device_id) -> str  # SHA256[:32]
get_or_create_profile(session, canvas, webgl, device_id) -> Profile
update_profile_from_check(session, profile, check_data) -> None
get_profile_by_id(session, profile_id) -> Profile | None
get_profiles(session, limit, offset, order_by, search, flagged_only) -> (List, int)
update_profile_flag(session, profile_id, is_flagged, notes) -> Profile
```

### CheckService (app/services/check_service.py)

```python
create_check(session, profile_id, data, session_id) -> Check
get_check_by_session(session, session_id) -> Check | None
get_profile_checks(session, profile_id, limit) -> List[Check]
get_recent_checks(session, limit, offset) -> List[Check]
get_checks_count(session) -> int
get_stats(session) -> dict  # profiles_count, checks_count, avg_fraud_score, etc.
```

---

## Расширения браузеров

### Chrome/Octo (Manifest V3) - рекомендуется

**extension-chrome/**

- `background.js` - Service Worker, управление сессиями
- `content.js` - инжектирует injected.js в страницу
- `injected.js` - перехватывает fetch/XHR к ipqscdn.com
- `popup.js` - UI с кнопкой проверки, polling результатов

**Особенности:**
- sessionId хранится в `chrome.storage.local`
- Подсказка "Проверка до 60 сек"
- Debug логи с copy to clipboard

### Firefox (Manifest V2)

**extension/**

- `background.js` - webRequestBlocking API для перехвата
- `content.js` - слушатель событий
- `popup.js` - UI

**Особенности:**
- Использует `filterResponseData` (deprecated в MV3)
- Требует временную установку через about:debugging

---

## Установка

### Chrome / Octo Browser

1. Открой `chrome://extensions/`
2. Включи **"Режим разработчика"**
3. Нажми **"Загрузить распакованное расширение"**
4. Выбери папку `extension-chrome/`

### Firefox

1. Открой `about:debugging#/runtime/this-firefox`
2. Нажми **"Загрузить временное дополнение..."**
3. Выбери `extension/manifest.json`

---

## Разработка

### Локальный запуск

```bash
# С Docker (рекомендуется)
docker-compose up -d

# Без Docker (нужен PostgreSQL)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Зависимости (requirements.txt)

```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
sqlmodel>=0.0.22
asyncpg>=0.30.0
sqlalchemy>=2.0.0
pydantic-settings>=2.0.0
httpx>=0.27.0
aiofiles>=23.2.0
PyJWT>=2.8.0
jinja2>=3.1.0
python-dotenv>=1.0.0
python-multipart>=0.0.6
```

### Переменные окружения (.env)

```bash
# IPQS
IPQS_API_KEY=...              # НЕ ИСПОЛЬЗУЕТСЯ напрямую
IPQS_DOMAIN=indeed.com

# PostgreSQL
POSTGRES_HOST=db              # "db" в Docker, "127.0.0.1" локально
POSTGRES_PORT=5432
POSTGRES_USER=ipqs
POSTGRES_PASSWORD=<strong_password>
POSTGRES_DB=ipqs_checker

# Admin
ADMIN_PASSWORD=<admin_password>
ADMIN_TOKEN_SECRET=<random_secret>

# Server
PORT=8000
WORKERS=1
```

---

## Деплой

Deploy via Docker Compose or Portainer. See docker-compose.yml for configuration.

```bash
docker-compose up -d
curl -s http://localhost:8000/health
```

---

## Интерпретация результатов

| Показатель | Хорошо | Плохо |
|------------|--------|-------|
| Fraud Score | < 30% | > 70% |
| Fingerprint unique | Да | Нет (засвечен) |
| Visit Count | 1 | > 3 |
| OS Mismatch | Нет | Да |
| Proxy/VPN | Зависит | Детект = плохо |
| Bot Status | No | Yes |

---

## Технические особенности

### Двойное хранилище

- **PostgreSQL** - основное (Profile, Check с индексами)
- **JSONL файл** (data/visitors.jsonl) - backup на диске

### Подсчёт уникальности

1. По **device_id** (самый надёжный)
2. По **canvas_hash + webgl_hash** (комбинация)

### Reverse proxy для IPQS

`/ipqs/{path}` проксирует запросы к IPQS API с патчем:
- Исправляет `fn.fn` bug в learn.js

### Chrome MV3 ограничения

- Нет webRequestBlocking
- Используется script injection через content.js → injected.js
- Service Worker может "засыпать" - sessionId в storage.local

---

## Админ-панель

### Доступ

- **URL**: https://check.maxbob.xyz/admin
- **Авторизация**: только пароль (ADMIN_PASSWORD)
- **JWT**: 24h expiration, cookie `ipqs_admin_token`

### Функции

- **Dashboard** - общая статистика, графики
- **Profiles** - список профилей с фильтрами и поиском
- **Profile detail** - история проверок профиля
- **History** - лента всех проверок
- **Flagging** - пометка подозрительных профилей

---

## Анализ HAR файлов

При анализе HAR файлов для поиска API endpoints:

```bash
# 1. Найти большие JSON ответы (API обычно > 1KB)
jq '.log.entries[] | select(.response.content.size > 1000) |
    select(.response.content.mimeType | contains("json")) |
    {url, size: .response.content.size}' file.har

# 2. Найти необычные короткие пути (proxy endpoints)
jq -r '.log.entries[].request.url' file.har | grep -E '/[A-Za-z0-9]{4,10}/?$'

# 3. Найти XHR с кастомными заголовками
jq '.log.entries[] | select(.request.headers[] |
    .name | test("x-request|x-visitor|x-api"))' file.har

# 4. НЕ полагаться на grep с известными доменами — сервисы используют custom proxy
```

---

## Работа с большими файлами

При ошибке `File content exceeds maximum allowed tokens`:

```bash
# 1. Читать файл частями через offset/limit
Read(file_path, offset=0, limit=500)      # строки 1-500
Read(file_path, offset=500, limit=500)    # строки 501-1000

# 2. Использовать Grep для поиска конкретного контента
Grep("products", path="file.json")        # найти строки с "products"
Grep("antiDetect", path="file.md")        # найти упоминания antiDetect

# 3. Для JSON файлов использовать jq через Bash
jq '.products.identification' large_file.json | head -100
jq 'keys' large_file.json                 # посмотреть структуру

# 4. Для HAR файлов — структурированный анализ
jq '.log.entries[] | select(.response.content.size > 1000) |
    {url: .request.url, size: .response.content.size}' file.har

# 5. Посмотреть начало/конец файла
head -100 large_file.md
tail -100 large_file.md

# 6. Получить размер и структуру
wc -l large_file.md                       # количество строк
file large_file.json                      # тип файла
```

**Важно**: НЕ игнорировать большие файлы! Они часто содержат важные данные.

---

## Fingerprint Pro Integration

### Что проверяет Fingerprint Pro

**Canvas:**
- `toDataURL` (8-16 вызовов)
- `getImageData` (1-2 вызова)
- `fillText` (2 вызова)

**WebGL:**
- `getParameter` (97-111 вызовов)
- `getExtension` (36-69 вызовов)
- `getShaderPrecisionFormat` (12-24 вызова)
- `getSupportedExtensions` (1 вызов)

**Audio:**
- `OfflineAudioContext` (1 вызов)

**Navigator (TOP по частоте):**
- `navigator.userAgent` (422-480x)
- `navigator.vendor` (42-99x)
- `navigator.language` (40-100x)
- `navigator.webdriver` (13-37x) ← **детект ботов!**
- `navigator.platform` (5-8x)
- `navigator.maxTouchPoints` (4-7x)
- `navigator.hardwareConcurrency` (3-4x)
- `navigator.deviceMemory` (3x)

### API Endpoints на fingerprint.com

Fingerprint Pro использует динамические короткие пути (proxy endpoints):

| Тип | Примеры | Query params |
|-----|---------|--------------|
| Loader | `/CwCV/`, `/UQur/` | `?b=load-vercel&v=3&a=...&l=3.12.1` |
| Script | `/sdub4ver/` | `?q=NIrKSr1SW3HEAoyttBe2` |
| POST API | `/r4a0Rd2Xs/`, `/Vtu1bhY5s/` | `?ci=js/3.12.5&q=...` |
| GET API | `/NsV02kcx/`, `/cpaJ/`, `/DRDgIsvG/`, `/CToT/` | - |

**Паттерн**: `/[A-Za-z0-9]{4,12}(\/|\?|$)`

### Файлы расширения для FP

- `extension-chrome/content-fp.js` - Content script для fingerprint.com
- `extension-chrome/injected-fp.js` - Перехватчик fetch/XHR
- `static/result-fp.html` - Страница результатов FP Pro

### Структура ответа FP Pro

```json
{
  "products": {
    "identification": {
      "data": {
        "visitorId": "...",
        "requestId": "...",
        "confidence": { "score": 0.999 },
        "firstSeenAt": { "global": "...", "subscription": "..." },
        "lastSeenAt": { "global": "...", "subscription": "..." }
      }
    },
    "tampering": {
      "data": {
        "result": false,
        "anomalyScore": 0,
        "antiDetectBrowser": false
      }
    },
    "suspectScore": {
      "data": { "result": 0 }
    },
    "rawDeviceAttributes": {
      "data": {
        "canvas": { "value": { "Winding": true, "Geometry": "...", "Text": "..." } },
        "audio": { "value": 124.04345808873768 },
        "webGlBasics": { "value": { "vendor": "...", "renderer": "..." } },
        "webGlExtensions": { "value": { "extensions": [...], "extensionHash": "..." } }
      }
    }
  }
}
```

---

## Troubleshooting

### Проверка не работает

1. Убедись что indeed.com открывается
2. Проверь консоль расширения (chrome://extensions → Inspect)
3. Проверь что сервер доступен: `curl https://check.maxbob.xyz/health`

### Service Worker "засыпает" (Chrome)

- sessionId хранится в chrome.storage.local
- При рестарте восстанавливается автоматически

### База данных не подключается

- Проверь POSTGRES_HOST: "db" в Docker, "127.0.0.1" локально
- Проверь что контейнер db запущен: `docker-compose ps`
