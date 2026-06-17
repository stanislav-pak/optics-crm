import { supabase } from './supabase';
import type {
  Product, ProductCategory, Brand, Stock, StockMovement,
  Supplier, PurchaseOrder, PurchaseOrderItem,
  Sale, SaleItem, SaleStatus, Revision, RevisionItem,
  InventoryStats, StockAlert, Branch
} from '../types';
import { WAREHOUSE_ID } from '../constants';

// ============================================
// ТОВАРЫ
// ============================================

export async function getProducts(branchId?: string) {
  let query = supabase
    .from('products')
    .select(`
      *,
      category:product_categories(id, name, slug),
      brand:brands(id, name),
      stock(quantity, branch_id)
    `)
    .eq('is_active', true)
    .order('name');

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Product[];
}

// Для manager/branch_admin: только товары с фактическим остатком в их филиале
export async function getProductsFromStock(branchId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('stock')
    .select(`
      quantity,
      product:products(
        id, name, sku, barcode, price, cost_price, unit, min_stock, is_active, branch_id, created_at,
        category:product_categories(id, name, slug),
        brand:brands(id, name),
        stock(quantity, branch_id)
      )
    `)
    .eq('branch_id', branchId)
    .gt('quantity', 0);

  if (error) throw error;

  return ([...(data ?? [])] as any[])
    .filter(s => s.product?.is_active !== false)
    .map(s => s.product as Product)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'));
}

export async function getProductByBarcode(barcode: string, branchId?: string): Promise<Product | null> {
  if (branchId) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:product_categories(id, name, slug),
        brand:brands(id, name),
        stock!inner(quantity, branch_id)
      `)
      .eq('barcode', barcode)
      .eq('stock.branch_id', branchId)
      .gt('stock.quantity', 0)
      .maybeSingle();
    if (error) throw error;
    return data as Product | null;
  }

  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:product_categories(id, name, slug),
      brand:brands(id, name),
      stock(quantity, branch_id)
    `)
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

export async function createProduct(product: Omit<Product, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single();

  if (error) throw error;
  return data as Product;
}

export async function getProductById(id: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .select('*, category:product_categories(id, name, slug), brand:brands(id, name), stock(quantity, branch_id)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Product;
}

// Генерация штрихкода EAN-13
export function generateBarcode(productId: string): string {
  const digits = productId.replace(/-/g, '').slice(0, 12).replace(/[^0-9]/g, '0').padEnd(12, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits + checkDigit;
}

// ============================================
// КАТЕГОРИИ И БРЕНДЫ
// ============================================

export async function getCategories() {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .order('name');

  if (error) throw error;
  return data as ProductCategory[];
}

export async function getBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('name');

  if (error) throw error;
  return data as Brand[];
}

// ============================================
// ОСТАТКИ
// ============================================

export async function getStock(branchId?: string) {
  let query = supabase
    .from('stock')
    .select(`
      *,
      product:products(
        id, name, sku, barcode, min_stock, unit, price,
        category:product_categories(name),
        brand:brands(name)
      )
    `)
    .order('updated_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Stock[];
}

export async function getLowStockAlerts(branchId?: string) {
  let query = supabase
    .from('stock')
    .select(`
      *,
      product:products(id, name, sku, min_stock, unit),
      branch:branches(id, name)
    `);

  // Для admin (branchId undefined) — не фильтруем, загружаем все филиалы
  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;

  return (data as Stock[])
    .filter(s => s.product && s.quantity <= (s.product as Product).min_stock)
    .map(s => ({
      product: s.product as Product,
      current_qty: s.quantity,
      min_stock: (s.product as Product).min_stock,
      branch: s.branch as Branch,
    })) as StockAlert[];
}

// ============================================
// ДВИЖЕНИЯ СКЛАДА
// ============================================

export async function addStockMovement(movement: Omit<StockMovement, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('stock_movements')
    .insert(movement)
    .select()
    .single();

  if (error) throw error;
  return data as StockMovement;
}

export async function getStockMovements(branchId?: string, productId?: string) {
  let query = supabase
    .from('stock_movements')
    .select('*, product:products(id, name, sku), employee:employees!stock_movements_created_by_fkey(id, name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (branchId) {
    query = query.or(`branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
  }

  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error) throw error;
  return data as StockMovement[];
}

// ============================================
// ЗАКАЗЫ
// ============================================

export async function createPurchaseOrder(
  order: Omit<PurchaseOrder, 'id' | 'created_at'>,
  items: Omit<PurchaseOrderItem, 'id' | 'purchase_order_id' | 'created_at'>[]
) {
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert(order)
    .select()
    .single();

  if (poError) {
    throw poError;
  }

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(items.map(i => ({ ...i, purchase_order_id: po.id })));

  if (itemsError) {
    throw itemsError;
  }

  // Если статус received — сразу создаём движения прихода
  if (order.status === 'received') {
    const movements = items.map(i => ({
      product_id: i.product_id,
      branch_id: order.branch_id!,
      type: 'in' as const,
      quantity: i.quantity,
      price: i.cost_price,
      reference_id: po.id,
      reference_type: 'purchase_order',
      created_by: order.created_by,
    }));

    const { error: movError } = await supabase
      .from('stock_movements')
      .insert(movements);

    if (movError) {
      throw movError;
    }

    // Синхронизация с главным складом (если приход НЕ на склад)
    if (order.branch_id !== WAREHOUSE_ID) {
      const { data: branch } = await supabase
        .from('branches').select('name').eq('id', order.branch_id!).single();
      const branchName = branch?.name ?? 'Филиал';

      const warehouseMovements = items.map(i => ({
        product_id: i.product_id,
        branch_id: WAREHOUSE_ID,
        type: 'in' as const,
        quantity: i.quantity,
        price: i.cost_price,
        reference_id: po.id,
        reference_type: 'purchase_order',
        notes: `Синхронизация: ${branchName}`,
        created_by: order.created_by,
      }));

      const { error: wMovError } = await supabase
        .from('stock_movements').insert(warehouseMovements);

      if (!wMovError) {
        // Upsert остатков на складе
        for (const i of items) {
          const { data: existing } = await supabase
            .from('stock').select('quantity')
            .eq('product_id', i.product_id)
            .eq('branch_id', WAREHOUSE_ID)
            .maybeSingle();
          const currentQty = existing?.quantity ?? 0;
          await supabase.from('stock').upsert(
            { product_id: i.product_id, branch_id: WAREHOUSE_ID, quantity: currentQty + i.quantity },
            { onConflict: 'product_id,branch_id' }
          );
        }
      }
    }
  }

  return po as PurchaseOrder;
}

export async function receivePurchaseOrder(orderId: string, employeeId: string) {
  // Получаем позиции
  const { data: items, error: itemsError } = await supabase
    .from('purchase_order_items')
    .select('*, product:products(branch_id)')
    .eq('purchase_order_id', orderId);

  if (itemsError) throw itemsError;

  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('branch_id')
    .eq('id', orderId)
    .single();

  if (orderError) throw orderError;

  // Создаём движения склада
  const movements = items!.map(item => ({
    product_id: item.product_id,
    branch_id: order.branch_id,
    type: 'in' as const,
    quantity: item.quantity,
    price: item.cost_price,
    reference_id: orderId,
    reference_type: 'purchase_order',
    created_by: employeeId,
  }));

  const { error: movError } = await supabase
    .from('stock_movements')
    .insert(movements);

  if (movError) throw movError;

  // Обновляем статус заказа
  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({ status: 'received', received_at: new Date().toISOString() })
    .eq('id', orderId);

  if (updateError) throw updateError;
}

export async function getPurchaseOrders(branchId?: string) {
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name),
      items:purchase_order_items(*, product:products(id, name, sku))
    `)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return data as PurchaseOrder[];
}

// ============================================
// ПРОДАЖИ
// ============================================

export async function createSale(
  sale: Omit<Sale, 'id' | 'created_at'>,
  items: Omit<SaleItem, 'id' | 'sale_id' | 'created_at'>[]
) {
  const { data: newSale, error: saleError } = await supabase
    .from('sales')
    .insert(sale)
    .select()
    .single();

  if (saleError) throw saleError;

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(items.map(i => ({ ...i, sale_id: newSale.id })));

  if (itemsError) {
    await supabase.from('sales').delete().eq('id', newSale.id);
    throw itemsError;
  }

  // Создаём движения склада
  const movements = items.map(item => ({
    product_id: item.product_id,
    branch_id: sale.branch_id!,
    type: 'out' as const,
    quantity: item.quantity,
    price: item.price,
    reference_id: newSale.id,
    reference_type: 'sale',
    created_by: sale.employee_id,
  }));

  const { error: movError } = await supabase
    .from('stock_movements')
    .insert(movements);

  if (movError) {
    await supabase.from('sale_items').delete().eq('sale_id', newSale.id);
    await supabase.from('sales').delete().eq('id', newSale.id);
    throw movError;
  }

  return newSale as Sale;
}

export async function createReturn(
  saleId: string,
  returnItems: { product_id: string; quantity: number }[],
  reason: string,
  employeeId: string
): Promise<SaleStatus> {
  // 1. Загружаем продажу с позициями
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('*, items:sale_items(product_id, quantity)')
    .eq('id', saleId)
    .single();

  if (saleErr || !sale) throw new Error('Продажа не найдена');
  if (!sale.branch_id) throw new Error('Филиал продажи не определён');

  // 2-3. Валидируем: не превышает ли сумма возвратов кол-во в продаже.
  // Фильтруем previousReturns по обоим: sale_id (reference_id) И product_id.
  const returnedMap: Record<string, number> = {};
  for (const item of returnItems) {
    const saleItem = (sale.items as { product_id: string; quantity: number }[])
      ?.find(i => i.product_id === item.product_id);
    if (!saleItem) throw new Error('Товар не найден в продаже');

    // Считаем возвраты только по ЭТОЙ продаже И ЭТОМУ товару
    const { data: prevReturns } = await supabase
      .from('stock_movements')
      .select('quantity')
      .eq('reference_id', saleId)
      .eq('product_id', item.product_id)
      .eq('type', 'return');

    const alreadyReturned = (prevReturns ?? []).reduce((sum, r) => sum + r.quantity, 0);
    returnedMap[item.product_id] = alreadyReturned;

    if (alreadyReturned + item.quantity > saleItem.quantity) {
      throw new Error('Суммарный возврат превышает количество в продаже');
    }
  }

  // 4. Возвращаем товары на склад
  for (const item of returnItems) {
    if (item.quantity === 0) continue;
    const { data: stockRow } = await supabase
      .from('stock')
      .select('quantity')
      .eq('product_id', item.product_id)
      .eq('branch_id', sale.branch_id)
      .maybeSingle();

    if (stockRow) {
      const { error: stockUpdErr } = await supabase
        .from('stock')
        .update({ quantity: stockRow.quantity + item.quantity })
        .eq('product_id', item.product_id)
        .eq('branch_id', sale.branch_id);
      if (stockUpdErr) throw new Error(`Ошибка обновления остатка: ${stockUpdErr.message}`);
    } else {
      const { error: stockInsErr } = await supabase
        .from('stock')
        .insert({ product_id: item.product_id, branch_id: sale.branch_id, quantity: item.quantity });
      if (stockInsErr) throw new Error(`Ошибка создания остатка: ${stockInsErr.message}`);
    }
  }

  // 5. Создаём движения с type='return'
  const movements = returnItems
    .filter(i => i.quantity > 0)
    .map(item => ({
      product_id: item.product_id,
      branch_id: sale.branch_id,
      type: 'return' as const,
      status: 'completed',
      quantity: item.quantity,
      notes: reason,
      reference_id: saleId,
      reference_type: 'sale',
      created_by: employeeId,
    }));

  if (movements.length > 0) {
    const { error: movErr } = await supabase.from('stock_movements').insert(movements);
    if (movErr) throw new Error(`Ошибка записи движений возврата: ${movErr.message}`);
  }

  // 6. Обновляем статус продажи: полный или частичный возврат
  const totalReturnedMap: Record<string, number> = { ...returnedMap };
  returnItems.forEach(i => {
    totalReturnedMap[i.product_id] = (totalReturnedMap[i.product_id] ?? 0) + i.quantity;
  });

  const saleItemsTyped = (sale.items as { product_id: string; quantity: number }[]) ?? [];
  const isFullRefund = saleItemsTyped.every(
    si => (totalReturnedMap[si.product_id] ?? 0) >= si.quantity
  );

  const newStatus: SaleStatus = isFullRefund ? 'refunded' : 'partially_refunded';

  const { error: statusError } = await supabase.rpc('update_sale_status_for_return', {
    p_sale_id: saleId,
    p_new_status: newStatus,
  });
  if (statusError) throw new Error(`Не удалось обновить статус продажи: ${statusError.message}`);

  // 7. Пересчитываем остатки
  await supabase.rpc('recalculate_stock', { p_branch_id: sale.branch_id });

  return newStatus;
}

export async function getSales(branchId?: string) {
  let query = supabase
    .from('sales')
    .select(`
      *,
      client:clients(id, name, phone),
      employee:employees(id, name),
      items:sale_items(*, product:products(id, name, sku))
    `)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Sale[];
}

// ============================================
// РЕВИЗИИ
// ============================================

export async function createRevision(branchId: string, employeeId: string) {
  // Создаём ревизию
  const { data: revision, error: revError } = await supabase
    .from('revisions')
    .insert({ branch_id: branchId, created_by: employeeId, status: 'in_progress' })
    .select()
    .single();

  if (revError) throw revError;

  // Берём текущие остатки для наполнения
  const { data: stock, error: stockError } = await supabase
    .from('stock')
    .select('product_id, quantity')
    .eq('branch_id', branchId);

  if (stockError) throw stockError;

  const revItems = stock!.map(s => ({
    revision_id: revision.id,
    product_id: s.product_id,
    expected_qty: s.quantity,
    actual_qty: null,
  }));

  if (revItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('revision_items')
      .insert(revItems);

    if (itemsError) throw itemsError;
  }

  return revision as Revision;
}

export async function updateRevisionItem(itemId: string, actualQty: number) {
  const { data, error } = await supabase
    .from('revision_items')
    .update({ actual_qty: actualQty })
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw error;
  return data as RevisionItem;
}

export async function completeRevision(revisionId: string, employeeId: string) {
  // Получаем позиции с расхождениями
  const { data: items, error: itemsError } = await supabase
    .from('revision_items')
    .select('*, product:products(branch_id)')
    .eq('revision_id', revisionId)
    .not('actual_qty', 'is', null);

  if (itemsError) throw itemsError;

  const { data: revision, error: revError } = await supabase
    .from('revisions')
    .select('branch_id')
    .eq('id', revisionId)
    .single();

  if (revError) throw revError;

  // Корректирующие движения склада для всех расхождений
  const adjustments = items!
    .filter(i => i.difference !== 0)
    .map(i => ({
      product_id: i.product_id,
      branch_id: revision.branch_id,
      type: 'revision_adjust' as const,
      quantity: Math.abs(i.difference),
      reference_id: revisionId,
      reference_type: 'revision',
      revision_id: revisionId,
      notes: i.difference > 0 ? 'Излишек по ревизии' : 'Недостача по ревизии',
      created_by: employeeId,
    }));

  if (adjustments.length > 0) {
    const { error: movError } = await supabase
      .from('stock_movements')
      .insert(adjustments);

    if (movError) throw movError;
  }

  // Завершаем ревизию
  const { error: updateError } = await supabase
    .from('revisions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', revisionId);

  if (updateError) throw updateError;

  // Пересчитываем остатки по всем движениям филиала
  await supabase.rpc('recalculate_stock', { p_branch_id: revision.branch_id });
}

export async function getRevisions(branchId?: string) {
  let query = supabase
    .from('revisions')
    .select(`
      *,
      items:revision_items(*, product:products(id, name, sku, barcode)),
      employee:employees(id, name)
    `)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Revision[];
}

export async function deleteRevision(id: string) {
  // Получаем branch_id до удаления — понадобится для пересчёта остатков
  const { data: rev, error: revFetchError } = await supabase
    .from('revisions')
    .select('branch_id')
    .eq('id', id)
    .single();
  if (revFetchError) throw revFetchError;

  // Явно удаляем движения (CASCADE сработает сам, но страхуемся от строк без revision_id)
  await supabase.from('stock_movements').delete().eq('revision_id', id);
  await supabase.from('revision_items').delete().eq('revision_id', id);
  const { error } = await supabase.from('revisions').delete().eq('id', id);
  if (error) throw error;

  // Пересчитываем остатки по всем движениям филиала
  await supabase.rpc('recalculate_stock', { p_branch_id: rev.branch_id });
}

// ============================================
// ПЕРЕМЕЩЕНИЯ (двухэтапные)
// ============================================

export async function createTransfer(
  fromBranchId: string,
  toBranchId: string,
  productId: string,
  quantity: number,
  employeeId: string
) {
  // Получаем названия филиалов
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .in('id', [fromBranchId, toBranchId]);

  const toName = branches?.find(b => b.id === toBranchId)?.name ?? toBranchId;

  // Атомарно списываем со склада отправителя
  const { error: stockErr } = await supabase.rpc('deduct_stock_atomic', {
    p_product_id: productId,
    p_branch_id: fromBranchId,
    p_quantity: quantity,
  });
  if (stockErr) throw new Error(stockErr.message);

  // Пересчитываем остатки отправителя
  await supabase.rpc('recalculate_stock', { p_branch_id: fromBranchId });

  // Создаём движение со статусом in_transit
  const { error } = await supabase.from('stock_movements').insert({
    product_id: productId,
    branch_id: fromBranchId,
    to_branch_id: toBranchId,
    type: 'transfer',
    status: 'in_transit',
    quantity,
    reference_type: 'transfer',
    created_by: employeeId,
    notes: `Перемещение в ${toName}`,
  });

  if (error) throw error;
}

export async function confirmTransfer(
  movementId: string,
  confirmedQuantity: number,
  employeeId: string
) {
  const { data: movement, error: fetchErr } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('id', movementId)
    .single();

  if (fetchErr || !movement) throw new Error('Перемещение не найдено');

  const discrepancy = movement.quantity - confirmedQuantity;

  // Обновляем движение
  const { error: updateErr } = await supabase.from('stock_movements').update({
    status: 'completed',
    confirmed_quantity: confirmedQuantity,
    confirmed_by: employeeId,
    confirmed_at: new Date().toISOString(),
    discrepancy,
    notes: (movement.notes ?? '') + (discrepancy > 0 ? ` (недостача: ${discrepancy} шт)` : ''),
  }).eq('id', movementId);

  if (updateErr) throw updateErr;

  // Пересчитываем остатки получателя и отправителя
  await supabase.rpc('recalculate_stock', { p_branch_id: movement.to_branch_id });
  await supabase.rpc('recalculate_stock', { p_branch_id: movement.branch_id });
}

export async function getIncomingTransfers(branchId: string) {
  // Используем явные FK-хинты, т.к. stock_movements имеет два FK на branches
  const { data, error } = await supabase
    .from('stock_movements')
    .select(`
      id, product_id, branch_id, to_branch_id, quantity, notes, created_at, status,
      product:products!stock_movements_product_id_fkey(id, name, sku),
      from_branch:branches!stock_movements_branch_id_fkey(id, name)
    `)
    .eq('to_branch_id', branchId)
    .eq('type', 'transfer')
    .eq('status', 'in_transit')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }
  return data ?? [];
}

// ============================================
// СПИСАНИЕ
// ============================================

export async function createWriteoff(
  branchId: string,
  productId: string,
  quantity: number,
  reason: string,
  employeeId: string
) {
  // Атомарно списываем остаток
  const { error: stockErr } = await supabase.rpc('deduct_stock_atomic', {
    p_product_id: productId,
    p_branch_id: branchId,
    p_quantity: quantity,
  });
  if (stockErr) throw new Error(stockErr.message);

  // Создаём движение
  const { error: movErr } = await supabase.from('stock_movements').insert({
    product_id: productId,
    branch_id: branchId,
    type: 'writeoff',
    status: 'completed',
    quantity,
    notes: reason,
    reference_type: 'writeoff',
    created_by: employeeId,
  });

  if (movErr) throw movErr;

  // Пересчитываем остатки
  await supabase.rpc('recalculate_stock', { p_branch_id: branchId });
}

// ============================================
// СТАТИСТИКА
// ============================================

export async function getInventoryStats(branchId?: string): Promise<InventoryStats> {
  if (branchId) {
    // Для manager/branch_admin: статистика только по их филиалу,
    // считаем из stock (quantity > 0) — точнее, чем из products.branch_id
    const [stockRes, movementsRes] = await Promise.all([
      supabase
        .from('stock')
        .select('quantity, product:products(price, cost_price, min_stock)')
        .eq('branch_id', branchId)
        .gt('quantity', 0),
      supabase
        .from('stock_movements')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date().toISOString().split('T')[0])
        .or(`branch_id.eq.${branchId},to_branch_id.eq.${branchId}`),
    ]);

    const stock = stockRes.data ?? [];
    const totalValue = stock.reduce((sum, s) =>
      sum + s.quantity * ((s.product as any)?.cost_price ?? 0), 0);
    const lowStock = stock.filter(s =>
      s.quantity <= ((s.product as any)?.min_stock ?? 0)).length;

    return {
      total_products: stock.length,   // уникальных товаров в наличии (quantity > 0)
      total_skus: stock.length,       // позиций на складе
      low_stock_count: lowStock,
      total_value: totalValue,
      movements_today: movementsRes.count ?? 0,
    };
  }

  // Для admin: агрегат по всем филиалам
  const [productsRes, stockRes, movementsRes] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true),
    supabase.from('stock').select('quantity, product:products(price, cost_price, min_stock)'),
    supabase.from('stock_movements').select('id', { count: 'exact' })
      .gte('created_at', new Date().toISOString().split('T')[0]),
  ]);

  const stock = stockRes.data ?? [];
  const totalValue = stock.reduce((sum, s) =>
    sum + s.quantity * ((s.product as any)?.cost_price ?? 0), 0);
  const lowStock = stock.filter(s =>
    s.quantity <= ((s.product as any)?.min_stock ?? 0)).length;

  return {
    total_products: productsRes.count ?? 0,
    total_skus: stock.length,
    low_stock_count: lowStock,
    total_value: totalValue,
    movements_today: movementsRes.count ?? 0,
  };
}

// ============================================
// ГРУППЫ ТОВАРОВ
// ============================================

export async function getProductGroups(): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('product_group')
    .eq('is_active', true)
    .not('product_group', 'is', null);

  if (error) throw error;

  const groups = [...new Set(
    (data as { product_group: string }[])
      .map(r => r.product_group)
      .filter(Boolean)
  )];

  return groups.sort((a, b) => a.localeCompare(b, 'ru'));
}
