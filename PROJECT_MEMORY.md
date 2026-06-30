# optics-crm — Project Memory
(проектная память в git — не путать с системной автопамятью Claude)

## Проект
- Repo: github.com/stanislav-pak/optics-crm
- Supabase: toxspgdkvxmpsvtecesy
- Vercel: автодеплой при push в main
- Клиент: сеть оптик "New Line" (Казахстан)

## Роли
- admin — полный доступ
- branch_admin — управление своим филиалом
- manager — только чтение/продажи, без удаления

## Склад (InventoryPage) — все вкладки готовы
- Обзор, Товары, Движения, Приходы, Продажи, Ревизии — все ✅
- Soft-delete товаров: update({ is_active: false })
- Kaspi QR — заглушка, реальный merchantId не настроен

## Ключевые таблицы
- products, product_categories, brands, stock, stock_movements
- suppliers, purchase_orders, purchase_order_items
- sales, sale_items (paid_cash, paid_kaspi)
- revisions, revision_items

## Известные нюансы
- iOS Safari + камера: нужен явный getUserMedia перед decodeFromVideoDevice
- Kaspi QR merchantId = YOUR_MERCHANT_ID (заглушка)
- При продаже с Kaspi: статус pending → paid после подтверждения
- Экспорт в Excel работает по всем модулям
- RLS политики добавлены вручную (employees_insert_stock, employees_update_stock)

## После каждой задачи
npx vitest run → если зелёные → graphify update . → git add -A → git commit → git push
