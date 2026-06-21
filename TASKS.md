# TASKS — optics-crm

## Как использовать
Каждая сессия = одна задача.
Начинай сессию: «Прочитай TASKS.md и выполни первую задачу со статусом TODO»
После выполнения статус меняется на DONE.

> **Следующая задача: T23 — Подписка** (единственная с TODO)

Статусы: `TODO` | `IN_PROGRESS` | `DONE` | `SKIP`

---

## 🔴 КРИТИЧНО

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

## Статистика
- Всего: 32 задачи
- TODO: 1 (T23)
- IN_PROGRESS: 0
- DONE: 31
- SKIP: 0

## Исключено (Kaspi — не запущен)
- Kaspi QR ручное подтверждение без оплаты
- handleKaspiConfirm без проверки ошибки
- saleReturnsCash считает Kaspi как наличные
- Pending-продажа при закрытии браузера (только Kaspi-флоу)
