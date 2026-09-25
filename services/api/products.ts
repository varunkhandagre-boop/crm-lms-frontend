import { apiClient } from './client';

export interface ApiProductLink {
  title: string;
  url: string;
}

export interface ApiProduct {
  id: string;
  companyId: string;
  name: string;
  model: string | null;
  series: string | null;
  description: string | null;
  specifications: string | null;
  price: string | number;
  gstRate: string | number;
  catalogs: ApiProductLink[] | null;
  videos: ApiProductLink[] | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ApiProduct[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
interface OneResponse {
  data: ApiProduct;
}

// Maps an ApiProduct back to the old Firestore `products` doc shape used by
// product_master.tsx (and by the dropdowns in add_lead/add_sales/
// add_quotation/add_demo/add_order).
export function toLegacyProduct(p: ApiProduct): any {
  return {
    id: p.id,
    companyId: p.companyId,
    name: p.name,
    model: p.model || '',
    series: p.series || '',
    description: p.description || '',
    specifications: p.specifications || '',
    price: Number(p.price) || 0,
    gstRate: Number(p.gstRate) || 0,
    catalogs: p.catalogs || [],
    videos: p.videos || [],
    addedBy: undefined,
    updatedBy: undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export interface ListProductsParams {
  search?: string;
}

function toQueryString(params: Record<string, any>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

const PRODUCTS_PAGE_SIZE = 200;

export async function listProducts(params: ListProductsParams = {}): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const res = await apiClient.get<ListResponse>(`/products${toQueryString({ limit: PRODUCTS_PAGE_SIZE, page, ...params })}`);
    all.push(...res.data);
    if (page >= res.meta.totalPages) break;
    page++;
  }
  return all.map(toLegacyProduct);
}

export interface CreateProductPayload {
  name: string;
  model: string;
  series?: string;
  description?: string;
  specifications?: string;
  price?: number;
  gstRate?: number;
  catalogs?: ApiProductLink[];
  videos?: ApiProductLink[];
}

export async function createProduct(payload: CreateProductPayload): Promise<any> {
  const res = await apiClient.post<OneResponse>('/products', payload);
  return toLegacyProduct(res.data);
}

export async function updateProduct(id: string, payload: Partial<CreateProductPayload>): Promise<any> {
  const res = await apiClient.patch<OneResponse>(`/products/${id}`, payload);
  return toLegacyProduct(res.data);
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}`);
}

export async function bulkDeleteProducts(productIds: string[]): Promise<{ deletedCount: number }> {
  const res = await apiClient.post<{ data: { deletedCount: number } }>('/products/bulk-delete', { productIds });
  return res.data;
}

export interface BulkProductRow {
  name: string;
  model?: string;
  series?: string;
  description?: string;
  specifications?: string;
  price?: number;
  gstRate?: number;
  catalogUrl?: string;
  videoUrl?: string;
}

export interface BulkImportPreviewItem {
  row: BulkProductRow;
  status: 'new' | 'existing';
  existingId?: string;
}

export async function previewBulkImport(rows: BulkProductRow[]): Promise<BulkImportPreviewItem[]> {
  const res = await apiClient.post<{ data: BulkImportPreviewItem[] }>('/products/bulk-import/preview', { rows });
  return res.data;
}

export async function commitBulkImport(rows: BulkProductRow[], overwriteIds: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  const res = await apiClient.post<{ data: { created: number; updated: number; skipped: number } }>('/products/bulk-import/commit', { rows, overwriteIds });
  return res.data;
}