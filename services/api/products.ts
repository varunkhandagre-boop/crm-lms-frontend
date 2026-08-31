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

export async function listProducts(params: ListProductsParams = {}): Promise<any[]> {
  const res = await apiClient.get<ListResponse>(`/products${toQueryString({ limit: 100, ...params })}`);
  return res.data.map(toLegacyProduct);
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
