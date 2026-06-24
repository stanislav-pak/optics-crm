# Graph Report - .  (2026-06-24)

## Corpus Check
- 124 files · ~118,268 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 736 nodes · 1255 edges · 71 communities (63 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dependencies & Build|Dependencies & Build]]
- [[_COMMUNITY_Project Docs & Inventory Modals|Project Docs & Inventory Modals]]
- [[_COMMUNITY_Workshop (Мастерская)|Workshop (Мастерская)]]
- [[_COMMUNITY_Inventory Page|Inventory Page]]
- [[_COMMUNITY_Admin Sales History|Admin Sales History]]
- [[_COMMUNITY_Admin Cash View|Admin Cash View]]
- [[_COMMUNITY_Company Chat|Company Chat]]
- [[_COMMUNITY_Expense Modal|Expense Modal]]
- [[_COMMUNITY_Help Modal|Help Modal]]
- [[_COMMUNITY_Add Product Modal|Add Product Modal]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 65|Community 65]]

## God Nodes (most connected - your core abstractions)
1. `index.ts` - 83 edges
2. `InventoryPage.tsx` - 71 edges
3. `inventory.ts` - 68 edges
4. `App.tsx` - 57 edges
5. `supabase.ts` - 55 edges
6. `supabase` - 53 edges
7. `optics-crm Project Instructions (CLAUDE.md)` - 39 edges
8. `AddSaleModal.tsx` - 27 edges
9. `AdminCashView.tsx` - 26 edges
10. `ChatList.tsx` - 26 edges

## Surprising Connections (you probably didn't know these)
- `src_app` --imports_from--> `admin_admincashview`  [EXTRACTED]
  src/App.tsx → src/App.tsx
- `src_app` --imports_from--> `admin_adminsaleshistory`  [EXTRACTED]
  src/App.tsx → src/App.tsx
- `src_app` --imports_from--> `chat_chatlist`  [EXTRACTED]
  src/App.tsx → src/App.tsx
- `src_app` --imports--> `chat_chatlist_chatlist`  [EXTRACTED]
  src/App.tsx → src/App.tsx
- `src_app` --imports_from--> `chat_chatwindow`  [EXTRACTED]
  src/App.tsx → src/App.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Inventory Module Core Components** — claude_md_inventory_page, claude_md_add_sale_modal, claude_md_add_purchase_modal, claude_md_add_product_modal, claude_md_revision_modal, claude_md_suppliers_modal, claude_md_kaspi_qr_modal, claude_md_inventory_service [EXTRACTED 0.95]
- **Supabase Inventory Database Tables** — claude_md_db_products, claude_md_db_stock, claude_md_db_stock_movements, claude_md_db_sales, claude_md_db_purchase_orders, claude_md_db_revisions, claude_md_db_suppliers, claude_md_db_product_categories, claude_md_db_brands [EXTRACTED 0.95]
- **Role-Based Access Control (admin, branch_admin, manager)** — claude_md_role_admin, claude_md_role_branch_admin, claude_md_role_manager, claude_md_rls_employees_insert_stock, claude_md_rls_employees_update_stock [INFERRED 0.85]

## Communities (71 total, 8 thin omitted)

### Community 0 - "Dependencies & Build"
Cohesion: 0.04
Nodes (47): dependencies, jsbarcode, lucide-react, qrcode, react, react-dom, recharts, @supabase/supabase-js (+39 more)

### Community 1 - "Project Docs & Inventory Modals"
Cohesion: 0.08
Nodes (47): optics-crm Project Instructions (CLAUDE.md), AddProductModal (src/components/Inventory/AddProductModal.tsx), AddPurchaseModal (src/components/Inventory/AddPurchaseModal.tsx), AddSaleModal (src/components/Inventory/AddSaleModal.tsx), App.tsx (Navigation + Swipe + Push), Autodeploy Workflow (vitest → git add → commit → push), BarcodeScanner (src/components/Shared/BarcodeScanner.tsx), DB Table: brands (+39 more)

### Community 2 - "Workshop (Мастерская)"
Cohesion: 0.07
Nodes (32): DateFilter, PageTab, STATUS_FILTERS, StatusFilter, WorkshopPageProps, createService(), createServiceOrder(), fetchCompletedOrders() (+24 more)

### Community 3 - "Inventory Page"
Cohesion: 0.07
Nodes (32): Props, RevisionModal(), InventoryPageProps, MV_TYPE_RU, STATUS_RU, Tab, WS_STATUS_RU, completeRevision() (+24 more)

### Community 4 - "Admin Sales History"
Cohesion: 0.09
Nodes (23): Branch, ORDER_STATUS_LABEL, PAYMENT_LABEL, Tab, WS_STATUS_COLOR, WS_STATUS_LABEL, ALL_STATUSES, nextStatuses() (+15 more)

### Community 5 - "Admin Cash View"
Cohesion: 0.09
Nodes (22): BranchRow, DetailScreen(), DetailScreenProps, fmt(), getDateRange(), ListScreen(), ListScreenProps, PeriodTab (+14 more)

### Community 6 - "Company Chat"
Cohesion: 0.12
Nodes (20): CompanyChatList(), getChatAvatar(), getChatName(), Props, CompanyChatWindow(), MediaModal, PendingFile, Props (+12 more)

### Community 7 - "Expense Modal"
Cohesion: 0.13
Nodes (18): Props, CashSession, CashSessionCard(), fmt(), Props, DateFilter, ExpensesTab(), Props (+10 more)

### Community 8 - "Help Modal"
Cohesion: 0.10
Nodes (21): adminSections(), ANALYTICS_SECTION, CASH_SECTION, CHAT_WINDOW_SECTION, CHATS_LIST_SECTION, CLIENT_CARD_SECTION, CRM_PANEL_SECTION, HelpBlock (+13 more)

### Community 9 - "Add Product Modal"
Cohesion: 0.12
Nodes (14): Props, Props, Props, createProduct(), generateBarcode(), getBrands(), getCategories(), getProductById() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (12): ClientSnap, Props, SaleItem, WorkshopPaymentType, KaspiQRModal(), Props, Props, RequestItem (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (11): LoginForm(), LoginFormProps, PendingManagers(), useWatchlistCount(), useAuthProvider(), subscribeToPush(), urlBase64ToUint8Array(), usePushNotifications() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (16): Branch, ChatItem(), ChatList(), ChatListProps, CLIENT_STATUS_RU, DATE_PERIODS, Employee, formatTime() (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (9): ChatRow, ErrorBoundary, periodRange(), PERIODS, ReportsPanel(), ReportsPanelInner(), ReportsPanelProps, SaleRow (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (16): ActivityLog, ApiResponse, AuthUser, DealStage, DealStats, LoginRequest, PaginatedResponse, PaymentMethod (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (8): BranchOption, ChatWindowProps, MediaModal, PendingFile, formatDur(), VoiceMessage(), VoiceMessageProps, playNotificationSound()

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (13): ChatWindow(), Branch, ImportExcel(), ImportRow, Props, ResultRow, Branch, Employee (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (10): Branch, Props, StockItem, Branch, Props, StockItem, approveStockRequest(), createTransfer() (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (12): CRMSidebarProps, Employee, LastStageInfo, STAGES, STATUS_MAP, TaskWithMeta, Reminders(), RemindersProps (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (9): LabelField, LabelTemplate, useLabelTemplates(), PrintLabelData, usePrinter(), LabelSize, PrintLabelModal(), Props (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.27
Nodes (7): ClientSearchResult, createClientAndChat(), getChats(), openOrCreateChat(), searchClientsForChat(), supabase, ChatListFilters

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (8): DEFAULT_UNITS, InitialData, OrderItem, Props, Props, createPurchaseOrder(), getProductByBarcode(), Supplier

### Community 24 - "Community 24"
Cohesion: 0.26
Nodes (9): build_tspl(), _ean13_bitmap(), _ean13_modules(), find_tsc_printer(), print_label(), 113 модулей EAN-13 (0=белый, 1=чёрный), включая тихие зоны (11 слева, 7 справа)., TSPL BITMAP: EAN-13 (с тихими зонами) растянут до w_dots точек. Растягивание, send_raw() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.25
Nodes (10): AdminDashboard(), AdminDashboardProps, Branch, ChatWithStage, DATE_PERIODS, Employee, getPeriodDates(), STAGES (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.20
Nodes (8): CRMSidebar(), Comment, ManagerCRMPanelProps, PRIORITY_COLORS, Reminder, STAGE_COLORS, STAGE_LABELS, Task

### Community 27 - "Community 27"
Cohesion: 0.31
Nodes (7): NewChatModalProps, AuthContext, AuthContextType, getCurrentEmployee(), signIn(), signOut(), Employee

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (6): Branch, BRANCHES, SignupForm(), SignupFormProps, supabaseAnonKey, supabaseUrl

### Community 29 - "Community 29"
Cohesion: 0.32
Nodes (5): formatHour(), getAlmatyHour(), isOffHours(), ManagerStats, OffHourSale

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (5): ACTION_LABELS, EmployeeActivity, EmployeeActivityProps, STATUS_COLORS, STATUS_LABELS

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (5): EVENT_CONFIG, FILTERS, WatchlistEvent, WatchlistEventType, WatchlistPanel()

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (5): ChatInfoPanel(), formatDate(), Props, STATUS_LABELS, Message

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (3): ArchiveResult, AutoArchiveSettings(), AutoArchiveSettingsProps

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (4): IncomingTransfer, Props, confirmTransfer(), getIncomingTransfers()

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (3): MovementDetail, Props, TYPE_META

### Community 37 - "Community 37"
Cohesion: 0.47
Nodes (6): Apple Touch Icon — optics-crm PWA icon (handshake on green, 512px), Apple Touch Icon v2 — optics-crm PWA icon (handshake on green, 512px), Favicon 96x96 — optics-crm browser tab icon (handshake on green), favicon.svg — optics-crm scalable favicon (handshake on green #22c55e, generated by RealFaviconGenerator), web-app-manifest-192x192.png — PWA manifest icon 192px (handshake on green), web-app-manifest-512x512.png — PWA manifest icon 512px (handshake on green)

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (5): Hero Image PNG (3D Isometric Layers), React Logo SVG, Vite Logo SVG, React Framework, Vite Build Tool

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (3): LastPurchase, Props, StockAlert

### Community 40 - "Community 40"
Cohesion: 0.50
Nodes (3): Props, createReturn(), Sale

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (3): index.html — App Entry Point, App Badge Script (totalBadgeCount from localStorage), main.tsx Entry Point Reference

## Ambiguous Edges - Review These
- `React Logo SVG` → `Hero Image PNG (3D Isometric Layers)`  [AMBIGUOUS]
  src/assets/hero.png · relation: conceptually_related_to
- `Vite Logo SVG` → `Hero Image PNG (3D Isometric Layers)`  [AMBIGUOUS]
  src/assets/hero.png · relation: conceptually_related_to

## Knowledge Gaps
- **276 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.