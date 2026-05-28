import { supabase } from './supabase';
import type {
  Product, ProductCategory, Brand, Stock, StockMovement,
  Supplier, PurchaseOrder, PurchaseOrderItem,
  Sale, SaleItem, Revision, RevisionItem,
  InventoryStats, StockAlert, Branch
} from '../types';

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

export async function getProductByBarcode(barcode: string) {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:product_categories(id, name, slug),
      brand:brands(id, name),
      stock(quantity, branch_id)
    `)
    .eq('barcode', barcode)
    .single();

  if (error) throw error;
  return data as Product;
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
    console.error('Ошибка создания PO:', JSON.stringify(poError));
    throw poError;
  }

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(items.map(i => ({ ...i, purchase_order_id: po.id })));

  if (itemsError) {
    console.error('Ошибка создания items:', JSON.stringify(itemsError));
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
      console.error('Ошибка создания movements:', JSON.stringify(movError));
      throw movError;
    }

    // Синхронизация с главным складом (если приход НЕ на склад)
    const WAREHOUSE_ID = 'a215f402-07ee-4ba9-aba5-b2b4cd5497f2';
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

      if (wMovError) {
        console.error('Ошибка синхронизации склад movements:', JSON.stringify(wMovError));
      } else {
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

  if (itemsError) throw itemsError;

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

  if (movError) throw movError;

  return newSale as Sale;
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
  console.log('createTransfer called', { fromBranchId, toBranchId, productId, quantity });

  // Получаем названия филиалов
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .in('id', [fromBranchId, toBranchId]);

  const toName = branches?.find(b => b.id === toBranchId)?.name ?? toBranchId;

  // Актуальный остаток отправителя
  const { data: fromStock } = await supabase
    .from('stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', fromBranchId)
    .single();

  console.log('current stock before transfer:', fromStock?.quantity);
  console.log('new stock after transfer:', (fromStock?.quantity ?? 0) - quantity);

  if (!fromStock || fromStock.quantity < quantity) throw new Error('Недостаточно товара');

  // Списываем со склада отправителя
  const { error: stockErr } = await supabase
    .from('stock')
    .update({ quantity: fromStock.quantity - quantity })
    .eq('product_id', productId)
    .eq('branch_id', fromBranchId);
  if (stockErr) throw stockErr;

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

  // Зачисляем на склад получателя (upsert)
  const { data: toStock } = await supabase
    .from('stock')
    .select('quantity')
    .eq('product_id', movement.product_id)
    .eq('branch_id', movement.to_branch_id)
    .maybeSingle();

  if (toStock) {
    await supabase
      .from('stock')
      .update({ quantity: toStock.quantity + confirmedQuantity })
      .eq('product_id', movement.product_id)
      .eq('branch_id', movement.to_branch_id);
  } else {
    await supabase.from('stock').insert({
      product_id: movement.product_id,
      branch_id: movement.to_branch_id,
      quantity: confirmedQuantity,
    });
  }

  // Пересчитываем остатки получателя и отправителя
  await supabase.rpc('recalculate_stock', { p_branch_id: movement.to_branch_id });
  await supabase.rpc('recalculate_stock', { p_branch_id: movement.branch_id });

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
    console.error('getIncomingTransfers supabase error:', error);
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
  // Проверяем текущий остаток
  const { data: stockRow, error: stockFetchErr } = await supabase
    .from('stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .single();

  if (stockFetchErr || !stockRow) throw new Error('Товар не найден на складе');
  if (stockRow.quantity < quantity) throw new Error(`Недостаточно товара. Доступно: ${stockRow.quantity} шт`);

  // Списываем остаток
  const { error: stockErr } = await supabase
    .from('stock')
    .update({ quantity: stockRow.quantity - quantity })
    .eq('product_id', productId)
    .eq('branch_id', branchId);

  if (stockErr) throw stockErr;

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
  let productsQuery = supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true);
  let stockQuery = supabase.from('stock').select('quantity, product:products(price, min_stock)');
  let movementsQuery = supabase.from('stock_movements').select('id', { count: 'exact' })
    .gte('created_at', new Date().toISOString().split('T')[0]);

  if (branchId) {
    productsQuery = productsQuery.eq('branch_id', branchId);
    stockQuery = stockQuery.eq('branch_id', branchId);
    movementsQuery = movementsQuery.eq('branch_id', branchId);
  }

  const [productsRes, stockRes, movementsRes] = await Promise.all([
    productsQuery,
    stockQuery,
    movementsQuery,
  ]);

  const stock = stockRes.data ?? [];
  const totalValue = stock.reduce((sum, s) => {
    const price = (s.product as any)?.price ?? 0;
    return sum + s.quantity * price;
  }, 0);

  const lowStock = stock.filter(s => {
    const minStock = (s.product as any)?.min_stock ?? 0;
    return s.quantity <= minStock;
  }).length;

  return {
    total_products: productsRes.count ?? 0,
    total_skus: stock.length,
    low_stock_count: lowStock,
    total_value: totalValue,
    movements_today: movementsRes.count ?? 0,
  };
}
