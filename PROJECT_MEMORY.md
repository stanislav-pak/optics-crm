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
- **iOS PWA push permission**: если `Notification.permission` стал `denied`, системный тумблер "Допуск уведомлений" в Настройках iPhone это НЕ сбрасывает (десинхронизация iOS). Чинится только полным удалением PWA + очисткой данных сайта в Safari + повторной установкой из Safari.

## Тестовое окружение (T45/T47, 2026-07-04/05)
Отдельные Supabase (`afpvhenzqtadukrmgrye`, аккаунт indpak@mail.ru) + Vercel (`optics-crm-test.vercel.app`) — схема 1:1 с продом, без бизнес-данных. Учётки для входа (все `123456`): admin `abc123@gmail.ru` (Склад), manager `sklad@gmail.com` (Склад), `Gum@gmail.com`/`Abaya@gmail.com`/`Djandosova@gmail.com`/`Masterskaya@gmail.com` (филиалы).
**Правило:** DB/RLS-изменения — сначала в тест, пользователь подтверждает результат, потом та же миграция в прод (с показом SQL). Код (frontend) — общий репозиторий, один `git push` обновляет и прод, и тест одновременно, отдельного шага не нужно.
Локальная проверка кода до пуша: `.claude/launch.json` → конфиг `dev-test` (порт 5174, режим `--mode test`, читает `.env.test.local` с данными тестового Supabase) — доступно через preview_start.

## Система бейджей/push-уведомлений (см. T47 в TASKS.md)
- Общий счётчик на иконке PWA — `totalBadge` в `App.tsx`: чаты + мастерская(×2) + внутренний чат + заявки на склад + перемещения.
- SQL-функция `get_total_unread_for_employee` (используется `send-push` edge-функцией как fallback, когда `badge_count` не передан явно) должна учитывать те же компоненты — раньше считала только внутренний чат, из-за этого push показывал неверное число, пока приложение не открыто.
- Бейдж категории пропадает **только при реальном разрешении** (approve/reject/подтверждение), не при простом просмотре вкладки — если чинишь новый тип бейджа, следи за этим паттерном (не привязывай к "last viewed timestamp").
- Цветовая схема бейджей ("цветовой путь" — одна категория = один цвет везде): 🔵 заявки на склад, 🔴 перемещения, 🟢 чаты, 🟣 задачи, 🟠 магазин/мастерская.
- Десктопная панель иконок (menedzher и admin) сидит в общем `grid-cols-5` контейнере — кнопкам нужен фиксированный `w-9 h-9 flex items-center justify-center`, иначе бейдж растягивается криво.

## RLS-заметка (T48, 2026-07-06)
Supabase/PostgREST: `UPDATE` без соответствующей RLS-политики отвечает `204 No Content` (успех), но обновляет 0 строк — тихий провал без ошибки. При отладке "правка не сохраняется, но код без ошибок" — первым делом проверять `pg_policy` на таблице, не гадать в коде.
Также выяснилось: T45 обещал заменить `admin_update_requests` (только admin/branch_admin) на политику, пускающую сотрудников филиала «Склад» любой роли — по факту на проде этого не было (в `list_migrations` фикса тоже нет). Заведена отдельная политика `warehouse_staff_update_requests` + функция `get_user_branch_id()`. **Вывод:** формулировки "исправлено и применено на проде" в TASKS.md стоит перепроверять `pg_policy`/`list_migrations`, а не доверять слепо прошлым записям.

## MCP-доступ к тестовому проекту
Supabase MCP-коннектор авторизован под `stanislavpak69020@gmail.com` — видит только прод (`toxspgdkvxmpsvtecesy`). Тестовый проект `afpvhenzqtadukrmgrye` зарегистрирован на **другой** Supabase-аккаунт (`indpak@mail.ru`), поэтому через MCP недоступен независимо от локального конфига. Договорились пока не подключать (можно через приглашение `stanislavpak69020@gmail.com` в Team тестового проекта) — до этого DB-фиксы в тест накатываются вручную через SQL-редактор Supabase по SQL, который даёт Claude.

## После каждой задачи
npx vitest run → если зелёные → graphify update . → git add -A → git commit → git push
