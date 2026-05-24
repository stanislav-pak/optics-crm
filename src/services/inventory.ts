import { supabase } from './supabase';
import type {
  Product, ProductCategory, Brand, Stock, StockMovement,
  Supplier, PurchaseOrder, PurchaseOrderItem,
  Sale, SaleItem, Revision, RevisionItem,
  InventoryStats, StockAlert
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

  console.log('categories:', data, 'error:', error);
  if (error) throw error;
  return data as ProductCategory[];
}

export async function getBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('name');

  console.log('brands:', data, 'error:', error);
  if (error) throw error;
  return data as Brand[];
}

// ============================================
// ОСТАТКИ
// ============================================

export async function getStock(branchId: string) {
  const { data, error } = await supabase
    .from('stock')
    .select(`
      *,
      product:products(
        id, name, sku, barcode, min_stock, unit, price,
        category:product_categories(name),
        brand:brands(name)
      )
    `)
    .eq('branch_id', branchId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as Stock[];
}

export async function getLowStockAlerts(branchId: string) {
  const { data, error } = await supabase
    .from('stock')
    .select(`
      *,
      product:products(id, name, sku, min_stock, unit),
      branch:branches(id, name)
    `)
    .eq('branch_id', branchId);

  if (error) throw error;

  return (data as Stock[]).filter(
    s => s.product && s.quantity <= (s.product as Product).min_stock
  ) as unknown as StockAlert[];
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

export async function getStockMovements(branchId: string, productId?: string) {
  let query = supabase
    .from('stock_movements')
    .select(`
      *,
      product:products(id, name, sku),
      employee:employees(id, name)
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(100);

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

  if (poError) throw poError;

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(items.map(i => ({ ...i, purchase_order_id: po.id })));

  if (itemsError) throw itemsError;

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

export async function getPurchaseOrders(branchId: string) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name),
      items:purchase_order_items(*, product:products(id, name, sku))
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

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

export async function getSales(branchId: string) {
  const { data, error } = await supabase
    .from('sales')
    .select(`
      *,
      client:clients(id, name, phone),
      employee:employees(id, name),
      items:sale_items(*, product:products(id, name, sku))
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

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

export async function getRevisions(branchId: string) {
  const { data, error } = await supabase
    .from('revisions')
    .select(`
      *,
      items:revision_items(*, product:products(id, name, sku, barcode)),
      employee:employees(id, name)
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Revision[];
}

// ============================================
// СТАТИСТИКА
// ============================================

export async function getInventoryStats(branchId: string): Promise<InventoryStats> {
  const [productsRes, stockRes, movementsRes] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact' }).eq('branch_id', branchId).eq('is_active', true),
    supabase.from('stock').select('quantity, product:products(price, min_stock)').eq('branch_id', branchId),
    supabase.from('stock_movements').select('id', { count: 'exact' })
      .eq('branch_id', branchId)
      .gte('created_at', new Date().toISOString().split('T')[0]),
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
