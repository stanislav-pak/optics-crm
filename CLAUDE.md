---
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(npx vitest*), Bash(npm run test*), Bash(graphify*)
---

# optics-crm — Project Instructions

## Проект
CRM для сети оптик "New Line" (Казахстан).
Supabase project: **toxspgdkvxmpsvtecesy** (новый, аккаунт stanislavpak69020@gmail.com)
Старый проект (НЕ использовать): ygvsnecgmoiwlkzkerhu (аккаунт b2b-product@...)
Deploy: Vercel (автодеплой при push в main)
Repo: github.com/stanislav-pak/optics-crm

## Стек
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Supabase (Postgres + RLS + Auth)
- Deploy: Vercel
- Barcode: @zxing/browser + @zxing/library
- QR-код оплаты: qrcode + @types/qrcode

## Архитектура

### Роли
- `admin` — полный доступ
- `branch_admin` — управление своим филиалом
- `manager` — только чтение/продажи, без удаления

### Навигация (App.tsx)
- `mobileView`: `list` | `chat` | `inventory`
- Свайп вправо: возврат к предыдущему виду
- Защита от свайпа: `document.querySelector('[data-modal="true"]')` — если модал открыт, свайп игнорируется

### Паттерны
- Все модалы: `data-modal="true"` на корневом div
- Закрытие по свайпу вправо: useEffect touchstart/touchend в каждом модале
- Dropdown кнопки: `onMouseDown + e.preventDefault()` (не onClick) — защита от blur race condition
- Soft-delete товаров: `update({ is_active: false })`

---

## Модуль склада (InventoryPage)

### Статус: в разработке

### Вкладки
| Вкладка | Статус | Описание |
|---------|--------|----------|
| Обзор | ✅ Готово | Статкарточки + алерты низкого остатка + последние движения |
| Товары | ✅ Готово | Список с поиском, адаптивная таблица, добавление, soft-delete |
| Движения | ✅ Готово | Лог движений склада |
| Приходы | ✅ Готово | Список приходов, добавление, удаление, детальный просмотр, управление поставщиками |
| Продажи | ✅ Готово | Карточки продаж, добавление, детальный просмотр |
| Ревизии | ✅ Готово | Список ревизий, создание/продолжение, завершение, детальный просмотр, удаление |

---

## Файлы модуля склада

### Страница
- `src/pages/InventoryPage.tsx` — главная страница, 6 вкладок, все модалы и состояния

### Компоненты
- `src/components/Inventory/AddProductModal.tsx` — добавление товара (категория, бренд, цены, SKU, штрихкод, атрибуты линз/оправ)
- `src/components/Inventory/AddPurchaseModal.tsx` — приходная накладная (поставщик, дата, список товаров, сканер штрихкода)
- `src/components/Inventory/AddSaleModal.tsx` — оформление продажи (клиент, товары, способы оплаты cash/kaspi_qr/mixed, сдача, KaspiQR)
- `src/components/Inventory/KaspiQRModal.tsx` — QR-код оплаты Kaspi Pay (deeplink, таймер 5 мин, ручное подтверждение)
- `src/components/Inventory/RevisionModal.tsx` — ревизия склада (прогресс-бар, сканер штрихкода, +1 при скане, завершение с корректировками)
- `src/components/Inventory/SuppliersModal.tsx` — CRUD поставщиков (добавление, редактирование inline, удаление)

### Общие компоненты
- `src/components/Shared/BarcodeScanner.tsx` — сканер штрихкода через @zxing/browser, поддержка iOS Safari (явный getUserMedia + video.play()), detectedRef против двойного срабатывания

### Сервисы
- `src/services/inventory.ts` — все функции работы со складом:
  - `getProducts`, `createProduct`, `updateProduct`, `getProductByBarcode`
  - `getCategories`, `getBrands`
  - `getStock`, `getLowStockAlerts`
  - `addStockMovement`, `getStockMovements`
  - `createPurchaseOrder` (автоматически создаёт stock_movements при status=received), `receivePurchaseOrder`, `getPurchaseOrders`
  - `createSale`, `getSales` (автоматически создаёт stock_movements out)
  - `createRevision`, `updateRevisionItem`, `completeRevision`, `getRevisions`
  - `getInventoryStats`

---

## Supabase — важные детали

### RLS политики (добавлены вручную)
```sql
-- Разрешить сотрудникам вставлять и обновлять остатки
CREATE POLICY "employees_insert_stock" ON stock
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid()));

CREATE POLICY "employees_update_stock" ON stock
  FOR UPDATE USING (EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid()));
```

### Ключевые таблицы склада
- `products` — товары (branch_id, is_active для soft-delete)
- `product_categories` — категории (slug используется для определения типа: lens/contact/frame/glass/sun)
- `brands` — бренды
- `stock` — остатки (product_id + branch_id, уникальная пара)
- `stock_movements` — движения (type: in/out/transfer/writeoff/revision_adjust)
- `suppliers` — поставщики
- `purchase_orders` + `purchase_order_items` — приходные накладные
- `sales` + `sale_items` — продажи (paid_cash, paid_kaspi, status: pending→paid)
- `revisions` + `revision_items` — ревизии (expected_qty, actual_qty, difference)

---

## TODO — что осталось сделать

### Склад
- [ ] Kaspi API реальная интеграция (сейчас заглушка в KaspiQRModal — KASPI_MERCHANT_ID = 'YOUR_MERCHANT_ID')
- [ ] Категории товаров — UI управления (сейчас только через Supabase)
- [ ] Бренды — UI управления (сейчас только через Supabase)

### Сделано (не удалять — для истории)
- [x] Редактирование товара (EditProductModal)
- [x] Перемещение между филиалами (TransferModal)
- [x] Списание товаров (WriteoffModal)
- [x] Экспорт в Excel (товары, движения, приходы, продажи, списания, возвраты, ревизии)
- [x] Фильтрация движений по типу/дате/товару
- [x] Возврат продажи (ReturnModal)
- [x] Push-уведомления при низком остатке (usePushNotifications в App.tsx)
- [x] Удалены debug console.log из getCategories и getBrands

---

## Известные нюансы

### iOS Safari + камера
Нельзя использовать только `decodeFromVideoDevice` — нужно сначала явно:
```ts
const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
video.srcObject = stream;
await video.play();
// только потом reader.decodeFromVideoDevice(...)
```

### Kaspi QR (заглушка)
`KaspiQRModal` генерирует deeplink `kaspi://pay?merchantId=YOUR_MERCHANT_ID&...`.
При реальной интеграции заменить на Kaspi Pay API endpoint и убрать кнопку ручного подтверждения.

### Продажи с Kaspi
При `paymentMethod === 'kaspi_qr' | 'mixed'`:
1. Создаётся продажа со статусом `pending` (stock уже списывается)
2. Открывается `KaspiQRModal`
3. При подтверждении — статус меняется на `paid`
4. При отмене — `sale_items` и `sales` удаляются (rollback)

---

## Автодеплой после задач

После выполнения КАЖДОЙ задачи:
1. Запусти: npx vitest run
2. Если все тесты зелёные → выполни по одной:
   - git add -A
   - git commit -m "[краткое описание на английском]"
   - git push
3. Если есть упавшие тесты → сначала починить, потом пушить
4. Если код менялся — `graphify update .` (обновить граф перед коммитом, AST-only, без API-затрат)
5. Сообщи результат: тесты / коммит / пуш

---

## Правила работы (обязательно соблюдать всегда)

### Перед любым изменением кода
1. Прочитай ВСЕ затрагиваемые файлы полностью
2. Проанализируй последствия — что может сломаться
3. Не трогай код который не относится к задаче
4. Не дублируй существующий код — сначала проверь есть ли уже такая функция
5. Аккуратность и логика важнее скорости

### После каждой задачи — деплой
1. Запусти тесты: `npx vitest run`
2. Если ВСЕ тесты зелёные:
   - `git add -A`
   - `git commit -m "[краткое описание на английском]"`
   - `git push`
3. Если есть упавшие тесты → НЕ пушить. Сначала починить, потом повторить шаг 1
4. Если код менялся — `graphify update .` перед коммитом (граф должен оставаться актуальным)
5. Сообщи результат: количество тестов / что закоммичено / статус пуша

### Стиль кода
- Все тексты интерфейса на русском языке
- Мобильный UX в приоритете
- Типизация строгая — без any
- Не удалять существующие типы и интерфейсы

### База данных
- Миграции применяет владелец проекта через Supabase MCP
- Для рискованных изменений — показать SQL на проверку перед выполнением
- Имена миграций уникальные (с версионным суффиксом _v2, _v3 при коллизиях)

### Запрещено
- Пушить если есть упавшие тесты
- Трогать рабочий код без явной необходимости
- Объединять команды через && в PowerShell
- Использовать any в TypeScript

## Работа с задачами (TASKS.md и PROJECT_MEMORY.md)
- В начале каждой сессии сначала `git fetch`, затем `git log HEAD..origin/main --oneline` — проверить, нет ли новых коммитов (например, из Telegram-сессии). Если есть — `git pull`, затем свериться с TASKS.md: если там уже описаны выполненные там задачи — просто продолжай; если нет — дополни TASKS.md по содержимому новых коммитов. Делать это всегда, не дожидаясь фразы пользователя "я делал в телеграме".
- Затем читай TASKS.md и PROJECT_MEMORY.md
- Выполняй первую задачу со статусом TODO, если пользователь не указал другую
- После выполнения задачи обновляй статус: TODO → DONE (или IN_PROGRESS если не завершена)
- Обновляй счётчик статистики внизу файла
- Если создаёшь новую задачу — добавляй её в TASKS.md с очередным номером и статусом TODO

PROJECT_MEMORY.md — это проектный файл в git (ручная сводка для быстрого старта сессии). Не путать с системной автопамятью (`~/.claude/projects/.../memory/`), которую веду я сам автоматически, без команд.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

**ОБЯЗАТЕЛЬНО перед началом КАЖДОЙ задачи**, которая трогает существующий код (не только "вопросы про архитектуру" — любая правка, фикс, новая фича), если `graphify-out/graph.json` существует:
1. Сначала `graphify query "<задача своими словами>"` — получить scoped subgraph: что с чем связано, что может сломаться.
2. Для связей конкретных сущностей — `graphify path "<A>" "<B>"`; для отдельного концепта — `graphify explain "<concept>"`.
3. Только после этого читать сырые файлы (Read/Grep) — точечно, по тому что показал граф.
4. Это правило действует и для изолированных/служебных файлов (скрипты, конфиги, отдельные сервисы) — если файл в графе, проверить его связи перед правкой, не полагаться на "он же самостоятельный".
5. Это правило обязательно передавать в промпт subagent'ам, если им поручается код-эксплорейшн.
6. После изменений — `graphify update .` (AST-only, без API-затрат).

Цель: не сломать ничего по цепочке зависимостей и не тратить лишние токены на ручной grep/чтение файлов, когда граф даёт ответ быстрее.
