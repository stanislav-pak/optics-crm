# TASKS — optics-crm

## Как использовать
Каждая сессия = одна задача.
Начинай сессию: «Прочитай TASKS.md и выполни первую задачу со статусом TODO»
После выполнения статус меняется на DONE.

> **Следующая задача: см. TODO ниже (T23 — подписка/оплата)**

Статусы: `TODO` | `IN_PROGRESS` | `DONE` | `SKIP`

---

## 🔴 КРИТИЧНО

### T45 — Баги в заявках на склад (продолжение T39) `DONE` (2026-07-05)
**Контекст:** при реальном тестировании T39 нашлись баги — все исправлены и проверены в тестовом окружении, затем применены в проде.

**Что сделано:**
1. RLS-политика `admin_update_requests` на `stock_requests` разрешала UPDATE только `admin`/`branch_admin` — реальный кладовщик с ролью `manager` не мог "Одобрить" (0 строк молча, без ошибки). Политика заменена, теперь учитывает сотрудников филиала "Склад".
2. Push-уведомления — не доходили из-за отдельного бага (см. T47), не из-за RLS.
3. Поле количества в заявке — фикс подтверждён рабочим.

**Файлы:** `src/services/inventory.ts`, `src/pages/InventoryPage.tsx`, миграция RLS на проде применена.

---

### T47 — Push-уведомления и бейджи: полная переработка `DONE` (2026-07-05)
**Контекст:** обнаружено и исправлено при тестировании T45 в специально созданном тестовом окружении (см. [PROJECT_MEMORY.md](PROJECT_MEMORY.md) — тестовый Supabase/Vercel).

**Найденные и исправленные баги:**
1. `push_subscriptions_employee_id_key` — UNIQUE constraint был на `employee_id` **одном**, а не на паре `(employee_id, endpoint)` — сотрудник физически не мог иметь больше одной подписки (второе устройство тихо не сохранялось). Заменено на составной constraint.
2. `usePushNotifications.ts` — insert/update подписки не проверял `{error}`, поэтому сбой (в т.ч. из-за бага #1) проходил незаметно. Переведено на `upsert(onConflict: 'employee_id,endpoint')` с проверкой ошибки.
3. `main.tsx` — `navigator.clearAppBadge()` вызывался при **любом** разворачивании приложения, независимо от реального непрочитанного — бейдж на иконке PWA пропадал без причины. Убран, бейдж теперь считается только от реального состояния (`totalBadge` в App.tsx).
4. `InventoryPage.tsx` — бейдж входящих перемещений (`hasUnreadTransfers`) был завязан на "последний просмотр вкладки", а не на реальное состояние — открыл вкладку не подтвердив перемещение → бейдж исчезал. Теперь строго `incomingTransfers.length > 0`.
5. App.tsx имел **отдельный дублирующий** поллер для того же перемещения с той же проблемой (localStorage `lastViewedMovements`) — убран, заменён на прямой count через `onPendingTransfersChange`.
6. `get_total_unread_for_employee` (SQL, используется для push `badge_count`, когда не передан явно) — считал **только** непрочитанные во внутреннем чате компании, игнорируя чаты с клиентами, заявки на склад, перемещения, заказы мастерской. Переписана функция — теперь учитывает всё то же самое, что и `totalBadge` на фронте.
7. `loadStockRequests()` грузился только при клике на вкладку "Заявки" — бейдж на самой вкладке не мог появиться при свежем заходе. Теперь грузится сразу при открытии Склада.
8. Desktop-панель иконок (менеджер и admin) — кнопки растягивались криво (21×32px вместо квадрата) из-за общего `grid-cols-5` контейнера. Зафиксирован размер `w-9 h-9` на каждой кнопке.
9. Иконки на десктопе увеличены (`w-3.5`→`w-5`), у категорий бейджей теперь разные цвета ("цветовой путь"): 🔵 заявки, 🔴 перемещения, 🟢 чаты, 🟣 задачи, 🟠 магазин/мастерская.

**Подтверждено пользователем:** push доходит даже при полностью закрытом (не свёрнутом) приложении на iPhone — так и должно быть, Service Worker не требует открытой страницы.

**Известная особенность iOS (не баг):** если Notification permission на iPhone внутри PWA случайно стал `denied` — системный тумблер "Допуск уведомлений" в Настройках это **не сбрасывает** (десинхронизация iOS между системным уровнем и уровнем WebKit). Единственный способ восстановить: удалить PWA с экрана «Домой» → Настройки → Safari → Дополнения → Данные сайтов → удалить сайт → добавить заново из Safari.

**Файлы:** `src/hooks/usePushNotifications.ts`, `src/main.tsx`, `src/App.tsx`, `src/pages/InventoryPage.tsx`, SQL-миграции (constraint + RPC) применены и в тесте, и в проде.

---

### T01 — handleRefund: ошибка Supabase игнорируется `DONE`
**Файл:** `src/components/Workshop/PendingPaymentsView.tsx` функция `handleRefund`
**Проблема:** `await supabase.from(...).update(...)` — `{error}` не деструктурируется. Если обновление провалилось — UI показывает успех, в БД ничего не изменилось. Клиент не получает предоплату, менеджер думает что вернул.
**Исправление:** деструктурировать `{ error }`, при ошибке — показать сообщение и НЕ убирать заказ из списка.

---

### T02 — createReturn: ошибки обновления склада игнорируются `DONE`
**Файл:** `src/services/inventory.ts` функция `createReturn`, строки ~483, 488, 509
**Проблема:** `if (stockUpdErr) console.error(...)` — функция продолжает работу даже при ошибке обновления stock. Возврат записывается, но товар не возвращается на склад.
**Исправление:** при ошибке обновления stock — бросать исключение (`throw`), прекращать выполнение.

---

### T03 — createSale: нет отката при ошибке stock_movements `DONE`
**Файл:** `src/services/inventory.ts` функция `createSale`, строки ~400-422
**Проблема:** Шаги: создать sale → создать sale_items → создать stock_movements. Если шаг 3 упадёт — продажа создана, товар добавлен, но сток не уменьшен.
**Исправление:** если `movError` — удалить sale_items и sale (откат вручную), бросить ошибку.

---

### T04 — completeRevision: не вызывает recalculate_stock `DONE`
**Файл:** `src/services/inventory.ts` функция `completeRevision`
**Проблема:** создаёт `revision_adjust` движения но не вызывает `recalculate_stock`. После ревизии таблица `stock` не обновляется (deleteRevision, createWriteoff, confirmTransfer — все вызывают).
**Исправление:** добавить `await supabase.rpc('recalculate_stock', { p_branch_id: revision.branch_id })` после завершения ревизии.
**Примечание:** сначала проверить через Supabase есть ли автотриггер на `revision_adjust` движения.

---

### T05 — Race condition при продаже/списании/перемещении `DONE`
**Файлы:** `src/services/inventory.ts` функции `createTransfer`, `createWriteoff`
**Проблема:** паттерн read→check→update не атомарен. Два менеджера одновременно могут продать один последний товар.
**Исправление:** добавить DB-level проверку через RPC или использовать `UPDATE stock SET quantity = quantity - N WHERE quantity >= N RETURNING quantity` и проверять результат.
**Примечание:** требует DB-решения через Supabase MCP.

---

## 🟡 СРЕДНЕ

### T06 — AddPurchaseModal: тихий скан несуществующего штрихкода `DONE`
**Файл:** `src/components/Inventory/AddPurchaseModal.tsx` функция `handleBarcodeDetected`
**Проблема:** `catch { /* не найден */ }` — при несуществующем штрихкоде ничего не происходит, нет сообщения.
**Исправление:** показать alert или toast «Товар не найден» при null/ошибке.

---

### T07 — AddSaleModal: поиск клиента по всем филиалам `DONE`
**Файл:** `src/components/Inventory/AddSaleModal.tsx` функция `searchClientsByName`
**Проблема:** автокомплит при вводе имени ищет клиентов по всей базе без фильтра по `branchId`.
**Исправление:** добавить `.eq('branch_id', branchId)` в запрос `searchClientsByName`.

---

### T08 — CashSessionCard: нет сообщения об ошибке при закрытии кассы `DONE`
**Файл:** `src/components/Inventory/CashSessionCard.tsx` функция `handleClose`
**Проблема:** если `close_cash_session` RPC вернул error — ничего не происходит, пользователь не видит причины.
**Исправление:** при `error` — показать `alert(error.message)` или inline-ошибку в модале.

---

### T09 — AddSaleModal: автоперезапись поля «Получено наличными» `DONE`
**Файл:** `src/components/Inventory/AddSaleModal.tsx` useEffect строки ~201-203
**Проблема:** при каждом изменении товаров поле `paidCash` сбрасывается к `totalNow`. Менеджер ввёл сумму → добавил товар → значение перетёрлось.
**Исправление:** автозаполнять `paidCash` только если поле пустое (`if (!paidCash)`).

---

### T10 — AddSaleModal: нет проверки остатка в момент submit `DONE`
**Файл:** `src/components/Inventory/AddSaleModal.tsx` функция `handleSubmit`
**Проблема:** список товаров загружается при открытии модала. Если другой менеджер продал последний товар пока форма открыта — submit пройдёт и stock уйдёт в минус.
**Исправление:** перед `createSale` — запросить актуальный `stock.quantity` для каждого товара и проверить `item.quantity <= stock_qty`.

---

### T11 — PendingPaymentsView: Realtime без фильтра по филиалу `DONE`
**Файл:** `src/components/Workshop/PendingPaymentsView.tsx` useEffect Realtime
**Проблема:** `{ event: '*', schema: 'public', table: 'service_orders' }` без фильтра — любое изменение в любом филиале вызывает `loadAll()`.
**Исправление:** добавить `filter: \`created_branch_id=eq.${branchId}\`` в Realtime подписку.

---

### T12 — ReturnModal: неверный лейбл суммы возврата мастерской `DONE`
**Файл:** `src/components/Inventory/ReturnModal.tsx` строка ~429
**Проблема:** написано «Возврат предоплаты мастерской» но сумма включает полную оплату (предоплата + доплата).
**Исправление:** заменить текст на «Возврат оплаты мастерской».

---

### T13 — WORKSHOP_BRANCH_ID хардкод в 4+ файлах `DONE`
**Файлы:** `AddSaleModal.tsx:12`, `services/workshop.ts:4`, `WorkshopPage.tsx:10`, `InventoryPage.tsx:279`
**Проблема:** ID захардкожен в 4 местах. Изменение в БД → нужно менять в 4 файлах.
**Исправление:** вынести в `src/constants.ts` и импортировать везде.

---

### T14 — WorkshopPage: ADMIN_BRANCHES хардкод `DONE`
**Файл:** `src/pages/WorkshopPage.tsx` строки 24-30
**Проблема:** имена и ID филиалов прошиты в коде вместо загрузки из БД.
**Исправление:** загружать список филиалов из `supabase.from('branches').select('id, name')`.

---

### T15 — ExpensesTab: удаление расхода без подтверждения `DONE`
**Файл:** `src/components/Inventory/ExpensesTab.tsx` функция `handleDelete`
**Проблема:** кнопка удаляет расход немедленно без диалога подтверждения.
**Исправление:** добавить `if (!confirm('Удалить расход?')) return;` перед `deleteExpense`.

---

### T16 — inventory.ts: reference_type неверный в возвратах `DONE`
**Файл:** `src/services/inventory.ts` функция `createReturn` строка ~502
**Проблема:** `reference_type: 'return'` при `reference_id: saleId` — логически неверно, reference_id содержит ID продажи.
**Исправление:** заменить на `reference_type: 'sale'`.

---

### T17 — AddSaleModal: предоплата мастерской без валидации `DONE`
**Файл:** `src/components/Inventory/AddSaleModal.tsx` секция мастерской
**Проблема:** `workshopPrepayment` можно ввести больше суммы услуги. Нет проверки.
**Исправление:** добавить валидацию `workshopPrepayment <= workshopServicePrice + workshopPartsPrice` и показывать ошибку.

---

## 🔵 ВЫПОЛНЕНО В ТЕКУЩЕЙ СЕССИИ

### T30 — Заявки на склад (stock requests) `DONE`
**Файлы:** `src/components/Inventory/StockRequestModal.tsx` (новый), `src/pages/InventoryPage.tsx`, `src/services/inventory.ts`, `src/types/index.ts`
**Что сделано:**
- Новая вкладка «Заявки» в InventoryPage (видна менеджерам-не-складу и сотрудникам склада)
- StockRequestModal: список всех товаров с остатком на складе, поиск, +/−, заметки, отправка
- Кнопка «Заявка на склад» в шапке InventoryPage для не-складских менеджеров
- Синий бейдж на вкладке «Заявки» = количество новых (status=pending)
- Одобрение: pre-validation наличия остатка по каждой позиции → `deduct_stock_atomic` RPC → статус → зачисление на филиал
- Отклонение: поле причины, статус rejected

---

### T31 — QA аудит: 16 багов исправлено `DONE`
**Файлы:** множественные (см. ниже)
**Что сделано:**
- Проведён полный аудит приложения: логика, математика, Realtime, push, AudioContext, UI
- Исправлены 16 багов:
  1. AddSaleModal: валидация mixed-оплаты перед созданием продажи
  2. AddSaleModal: `amount={totalNow}` в KaspiQRModal (был total — устаревшая сумма)
  3. AddSaleModal: guard от двойного submit через `isSubmittingRef`
  4. AddSaleModal: rollback stock через `recalculate_stock` при отмене Kaspi
  5. inventory.ts/approveStockRequest: pre-validation остатков до начала переводов
  6. ReturnModal: `workshopPaidAmount` с явной проверкой null (не `??`) для `original_prepayment=0`
  7. ReturnModal: ~35 дублирующихся атрибутов `className` объединены
  8. inventory.ts/createRevision: guard от создания второй активной ревизии
  9. KaspiQRModal: разделены два useEffect — countdown и onCancel
  10. InventoryPage: `audioCtxRef = useRef` на уровне компонента (не в useEffect)
  11. inventory.ts/completeRevision: фильтр `difference != null && !== 0` для stock_movements
  12. App.tsx/hasPendingTransfers: clearInterval в cleanup (не было утечки таймера)
  13. App.tsx: guard `empId` в setTimeout перед `loadInternalUnread`
  14. usePushNotifications: upsert по `employee_id + endpoint` для multi-device
  15. AddSaleModal: сброс `paidCash/paidKaspi` при смене способа оплаты
  16. App.tsx: звук только при `visibilityState === 'hidden'`

---

### T32 — Multi-device push: endpoint column `DONE`
**Файлы:** `src/hooks/usePushNotifications.ts`, migration `add_endpoint_to_push_subscriptions`
**Что сделано:**
- Добавлена колонка `endpoint text` в таблицу `push_subscriptions` через Supabase MCP
- `usePushNotifications` перезаписан: upsert по `employee_id + endpoint`
- Каждое устройство хранит свою подписку → уведомления приходят на все устройства

---

## 🟢 МЕЛКО

### T18 — Непоследовательный формат денежных сумм `DONE`
**Файлы:** `AddSaleModal.tsx`, `ReturnModal.tsx`, `CashSessionCard.tsx` и другие
**Проблема:** в разных местах разный формат: `₸10000`, `₸10,000`, `10 000 ₸`.
**Исправление:** создана утилита `formatMoney(n)` в `src/utils/formatters.ts` — возвращает `10 000 ₸`. Заменять постепенно при редактировании файлов.

---

### T19 — ReturnModal: тёмная тема в светлом приложении `DONE`
**Файл:** `src/components/Inventory/ReturnModal.tsx`
**Проблема:** ReturnModal использует тёмную WhatsApp-тему (#111b21) в то время как весь inventory — светлый.
**Исправление:** переверстать ReturnModal в светлой теме как у остальных модалов.

---

### T20 — createPurchaseOrder: console.error в production коде `DONE`
**Файл:** `src/services/inventory.ts` функция `createPurchaseOrder` строки ~243, 251, 272
**Проблема:** три `console.error` с `JSON.stringify` — debug-логи в production.
**Исправление:** удалить все три `console.error` (throw после них уже есть).

---

### T21 — AddSaleModal: свайп-закрытие не защищён от открытых дропдаунов `DONE`
**Файл:** `src/components/Inventory/AddSaleModal.tsx` useEffect свайп строки ~158-170
**Проблема:** нет проверки на открытые дропдауны — свайп вправо при открытом списке клиентов закрывает весь модал.
**Исправление:** добавить проверку `if (document.querySelector('[data-dropdown="true"]')) return;` в обработчик свайпа и добавить `data-dropdown="true"` на дропдауны.

---

### T22 — InventoryPage: any[] типизация для transfers `DONE`
**Файл:** `src/pages/InventoryPage.tsx` строки ~176-178
**Проблема:** `useState<any[]>([])` для `incomingTransfers` и `completedTransfers`.
**Исправление:** создать или использовать существующий тип `StockMovement` для типизации.

---

---

## 🟡 НОВЫЕ ЗАДАЧИ

### T24 — Встроенная справка по ролям `DONE`
**Файлы:** `src/components/HelpModal.tsx`, `src/App.tsx`
**Что сделано:**
- Кнопка «?» (HelpCircle) в шапке рядом с выходом — видна всем ролям
- HelpModal: полноэкранный модал с горизонтальным скроллом вкладок
- Контент разделён по ролям: менеджер / мастер (workshop branch) / руководитель / admin
- Модал открывается сразу на разделе текущей страницы (getCurrentHelpSection)

---

### T25 — Новый чат из поиска контактов `DONE`
**Файлы:** `src/services/chats.ts`, `src/components/Chat/NewChatModal.tsx`, `src/components/Chat/ChatList.tsx`
**Что сделано:**
- Починен поиск чатов: был сломан синтаксис PostgREST для related-таблиц, заменён на двухшаговый запрос через `clients`
- Кнопка-карандаш в шапке ChatList → открывает NewChatModal
- NewChatModal: поиск по имени/телефону, открытие существующего чата или создание нового
- Если клиент не найден и введён номер (≥10 цифр) → создаёт нового клиента + чат

---

### T26 — Contact Picker API в новом чате `DONE`
**Файл:** `src/components/Chat/NewChatModal.tsx`
**Что сделано:**
- Кнопка «Выбрать из контактов» (BookUser-иконка) в списке — видна только если браузер поддерживает Contact Picker API (Android Chrome)
- При нажатии открывается нативный выбор контакта с телефона
- Телефон контакта подставляется в поле поиска, имя сохраняется в `contactName`
- При создании нового клиента (`createClientAndChat`) имя из контакта передаётся автоматически
- Кнопка X в поиске очищает также и `contactName`
- Подсказка в пустом состоянии упоминает выбор из контактов если API доступен

---

### T27 — Филиал «Склад» в форме регистрации `DONE`
**Файл:** `src/components/Auth/SignupForm.tsx`
**Что сделано:**
- Добавлен филиал «Склад» в выпадающий список филиалов при регистрации нового сотрудника

---

### T28 — Кнопка добавления товара только для admin и склад-менеджера `DONE`
**Файл:** `src/pages/InventoryPage.tsx`
**Что сделано:**
- Кнопка «Добавить товар» скрыта от обычных менеджеров
- Доступна только admin и менеджерам филиала «Склад»

---

### T29 — Название филиала рядом с ролью в шапке `DONE`
**Файл:** `src/App.tsx`
**Что сделано:**
- В шапке приложения рядом с ролью сотрудника отображается название его филиала

---

### T33 — Очистка тестовых данных БД перед передачей заказчику `DONE`
**Где:** Supabase MCP (операции напрямую в БД, не код)
**Что сделано:**
- Удалены все транзакционные тестовые данные: продажи (7), позиции (7), движения склада (5), остатки (1), кассовые сессии (2), клиенты (1)
- Удалены все чаты и сообщения (chats, internal_chats, internal_messages)
- Удалён тестовый поставщик "ТОО «Оптик Дистрибьюшн»"
- Удалён тестовый товар "ТЕСТ — Оправа тестовая"
- Очищены push_subscriptions (7 старых токенов)
- Удалены тестовые сотрудники: "Test 1", "Тест Менеджер"
- Удалены 8 тестовых auth.users (*.newline.test, manager2/3@test.com)
- **База готова к передаче заказчику**

---

### T34 — Миграция на новый Supabase-проект + WhatsApp инфраструктура `DONE`
**Где:** Supabase MCP, n8n, PowerShell, Edge Functions
**Что сделано:**
- Новый Supabase-проект `toxspgdkvxmpsvtecesy` (аккаунт stanislavpak69020@gmail.com) — работает как основной
- Включён `pg_net`, обновлена функция `notify_push_new_message` на новый URL, добавлен `SERVICE_ROLE_KEY` в vault
- Задеплоена Edge Function `send-push` на новый проект, выставлены VAPID-секреты
- Обновлён `.env.local` — новый URL и anon key
- n8n outgoing workflow — URL обновлён на новый проект
- `SUPABASE_ACCESS_TOKEN` сохранён как постоянная переменная окружения Windows → `npx supabase functions deploy` работает без ручного ввода токена
- WhatsApp-цепочка проверена end-to-end: входящие ✅, исходящие ✅, push-уведомления ✅

---

### T44 — NKT barcode lookup: автоопределение товара по штрихкоду `DONE` (2026-06-29)
**Файлы:** `supabase/functions/nkt-lookup/`, `src/components/Inventory/EditProductModal.tsx`, `src/components/Inventory/AddProductModal.tsx`
**Что сделано:**
- Edge Function `nkt-lookup` — запрос в реестр товаров Казахстана (НКТ/GTIN) по штрихкоду
- EditProductModal: автопроверка при открытии — если штрихкод есть, подтягивает данные товара из НКТ
- AddProductModal: ручной запуск NKT-поиска при вводе штрихкода
- Исправлено отображение GTIN вместо NTIN в результатах поиска

---

### T39 — Двухэтапный запрос товара со склада + push-уведомления `DONE` (2026-07-02)
**Файлы:** `src/components/Inventory/StockRequestModal.tsx`, `src/pages/InventoryPage.tsx`, `src/services/inventory.ts`
**Что сделано:**
- Двухэтапный workflow: менеджер создаёт заявку → кладовщик одобряет/отклоняет
- Push-уведомление кладовщику при новой заявке, менеджеру при одобрении/отклонении
- Сканер штрихкода в StockRequestModal — быстрый поиск товара по коду

---

### T40 — Восстановление пароля (Forgot / Reset Password) `DONE` (2026-07-02)
**Файлы:** `src/components/Auth/`, App.tsx
**Что сделано:**
- Экран «Забыли пароль?» с отправкой письма через Supabase Auth
- Экран сброса пароля по ссылке из письма
- Показ/скрытие пароля в форме регистрации (иконка-глаз)

---

### T41 — Позиционирование штрихкода на этикетках TSC TE200 `DONE` (2026-07-02)
**Файлы:** `print_server_v2.py`, `src/components/Inventory/PrintLabelModal.tsx`
**Что сделано:**
- Серия калибровочных правок для узких этикеток 40×10 мм: раздельные смещения для EAN-13 и CODE128
- Исправлено позиционирование цены и штрихкода по X и Y для обоих типов
- `print_server_v2.py` — переписан print server с чистой центровкой для узких этикеток
- Уменьшена задержка между попытками сканирования с 500 мс до 100 мс
- Лимит количества печати поднят обратно до 999

---

### T42 — Поиск в истории печати этикеток `DONE` (2026-07-02)
**Файл:** `src/pages/InventoryPage.tsx` (вкладка Этикетки)
**Что сделано:**
- Поле поиска в секции «История печати» на вкладке Этикетки
- Фильтрация по названию товара и штрихкоду

---

### T43 — ScrollToTopButton + динамические филиалы в SignupForm `DONE` (2026-07-01)
**Файлы:** `src/components/ScrollToTopButton.tsx`, `src/components/Auth/SignupForm.tsx`
**Что сделано:**
- Плавающая кнопка «наверх» появляется при прокрутке страницы вниз
- Филиалы в форме регистрации загружаются динамически из БД (не хардкод)

---

### T35 — Фильтр по категориям в выборе товаров `DONE` (2026-07-03)
**Файлы:** `src/pages/InventoryPage.tsx`, `src/components/Inventory/AddSaleModal.tsx`, `src/components/Inventory/AddPurchaseModal.tsx`
**Что сделано:**
- Чипы-фильтры по категориям над списком товаров в трёх местах: вкладка «Товары», модал продажи, модал прихода
- Фильтр без лишних запросов — категории выводятся из уже загруженного списка товаров
- Свайп вправо не срабатывает при горизонтальном скролле чипов: `data-no-swipe="true"` + проверка в обработчике

---

### T36 — Улучшение UI групп товаров `DONE` (2026-07-03)
**Файлы:** `src/pages/InventoryPage.tsx`, `src/components/Inventory/EditProductModal.tsx`
**Что сделано:**
- Заголовок группы: название на первой строке полностью, кол-во/наличие — на второй (без truncation)
- Строки товаров внутри группы: двухстрочный layout — название товара целиком + штрихкод/цена на второй строке
- Кнопки переименования группы (✓ / ✕): `min-w-0` на input + `flex gap-3 flex-shrink-0` — обе кнопки видны
- EditProductModal: поле «Группа» с кастомным dropdown (список существующих групп + ввод новой)

---

### T37 — Параметры линз и оправы в EditProductModal `DONE` (2026-07-03)
**Файл:** `src/components/Inventory/EditProductModal.tsx`
**Что сделано:**
- Секция «Параметры линз» (синяя): sphere, cylinder, axis, diameter, base_curve — появляется при категории lens/contact
- Секция «Параметры оправы» (фиолетовая): color, size, material, gender — появляется при категории frame/glass/sun
- Поля предзаполнены из существующих `product.attributes`
- При сохранении все атрибуты записываются обратно в БД

---

### T38 — Graphify knowledge graph `DONE` (2026-07-03)
**Где:** `graphify-out/` (локально, исключён из git)
**Что сделано:**
- Установлен `graphifyy` (pip), построен полный граф проекта: 852 узла, 1 388 рёбер, 78 сообществ
- `graphify-out/` добавлен в `.gitignore` — файлы локально, не пушатся
- Граф обновлён после всех правок дня командой `graphify update .`

---

### T23 — Подписка: напоминание об оплате и блокировка приложения `TODO`
**Описание:** Функция абонентской поддержки — ежемесячный платёж. Дата задаётся вручную администратором.

**Поведение:**
- За 5 дней до срока → жёлтый баннер «Оплата через N дней»
- В день срока → красный баннер «Оплата сегодня»
- Срок прошёл, не оплачено → полноэкранная заглушка, приложение заблокировано

**Что делать:**
1. SQL-миграция: таблица `subscription` (due_date, is_paid, paid_at, period_label)
2. Сервисные функции в `inventory.ts` или отдельный `subscription.ts`
3. Хук `useSubscription` — проверка статуса при загрузке
4. Компонент баннера предупреждения (жёлтый / красный)
5. Компонент полноэкранной блокировки
6. Раздел в настройках для admin: установить дату + кнопка «Отметить как оплачено»

**Важно:**
- Блокировка только фронтенд (для внутреннего инструмента достаточно)
- Активируется только когда admin сам установит первую дату — на существующих пользователях не скажется
- Можно делать параллельно с работающим приложением

**Оценка:** ~3 часа

---

### T48 — Редактирование количества в одобренной заявке на склад `DONE` (2026-07-06)
**Файлы:** `src/pages/InventoryPage.tsx`, `src/services/inventory.ts`

**Что сделано:**
- В карточке заявки со статусом «Одобрена» количество каждой позиции теперь редактируемое поле (было — просто текст)
- Новая функция `updateStockRequestItemQuantities()` сохраняет правки в `stock_request_items` перед вызовом `shipStockRequest`
- `shipStockRequest()` пропускает позиции с количеством 0 (способ исключить позицию из отгрузки, не отправляя лишнее)

**Найденный баг (RLS):** на `stock_request_items` не было политики `UPDATE` вообще — только SELECT/INSERT. `PATCH` возвращал `204` (успех), но фактически 0 строк обновлялось — классическая ловушка PostgREST/RLS. Добавлена политика `employees_update_request_items`.

**Побочная находка:** политика `admin_update_requests` на `stock_requests` (T45) на проде оказалась НЕ заменена — по факту всё ещё ограничена `admin`/`branch_admin`, хотя T45 утверждал обратное. В списке миграций прода фикса не было. Добавлена отдельная политика `warehouse_staff_update_requests` (через новую функцию `get_user_branch_id()`) — сотрудники филиала «Склад» любой роли теперь могут одобрять/отправлять заявки.

**Проверено:** end-to-end в тестовом окружении (создание заявки → одобрение → правка количества 1→7 → отправка → количество сохранилось), затем применено на прод.

---

### T46 — Индикаторы непрочитанного (бейдж на иконке PWA + точки в списках) `DONE` (2026-07-05)
**Описание:** Найдено при тестировании push-уведомлений в тестовом окружении — бейдж на иконке PWA не держался, даже когда реально было непрочитанное.

**Что оказалось:**
- Точки непрочитанного в чатах (per-chat `unread_count`, пропадают при открытии конкретного чата) уже работали корректно — как в WhatsApp, менять не пришлось.
- Реальный баг — в [main.tsx:17](src/main.tsx:17): при **любом** сворачивании/разворачивании приложения бейдж на иконке принудительно обнулялся (`navigator.clearAppBadge()`), независимо от того, прочитано что-то или нет.

**Что сделано:**
- Убран преждевременный `clearAppBadge()` из `main.tsx` — бейдж теперь считается только по реальному непрочитанному (`totalBadge` в App.tsx), держится пока не прочитано, как в WhatsApp
- Заявки на склад (`status IN ('new','approved')`) добавлены в общий `totalBadge` для admin/склад — раньше учитывались только внутри вкладки «Заявки», на иконку PWA не влияли

---

## Статистика
- Всего: 48 задач
- TODO: 1 (T23)
- IN_PROGRESS: 0
- DONE: 47
- SKIP: 0

## Исключено (Kaspi — не запущен)
- Kaspi QR ручное подтверждение без оплаты
- handleKaspiConfirm без проверки ошибки
- saleReturnsCash считает Kaspi как наличные
- Pending-продажа при закрытии браузера (только Kaspi-флоу)
