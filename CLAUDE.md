# optics-crm — Project Instructions

## Проект
CRM для сети оптик "New Line" (Казахстан).
Supabase project: **ygvsnecgmoiwlkzkerhu**
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
- [ ] Редактирование товара (EditProductModal)
- [ ] Перемещение между филиалами (TransferModal)
- [ ] Списание товаров (WriteoffModal)
- [ ] Экспорт в Excel (ревизии, движения, продажи)
- [ ] Фильтрация движений по типу/дате/товару
- [ ] Kaspi API реальная интеграция (сейчас заглушка в KaspiQRModal — KASPI_MERCHANT_ID = 'YOUR_MERCHANT_ID')
- [ ] Возврат продажи

### Общее
- [ ] Push-уведомления при низком остатке
- [ ] Удалить debug console.log из getCategories и getBrands в inventory.ts
- [ ] Категории товаров — UI управления (сейчас только через Supabase)
- [ ] Бренды — UI управления (сейчас только через Supabase)

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
4. Сообщи результат: тесты / коммит / пуш
