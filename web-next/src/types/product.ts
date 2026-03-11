export type ProductVariantStockMap = Record<string, number>;

export interface ProductVariant {
  color: string;
  size: string;
  stockQty: number;
}

export interface ProductMetadata {
  sizes: string[];
  colors: string[];
  variantStock: ProductVariantStockMap;
  collection?: string;
  category?: string;
  subcategory?: string;
  material?: string;
  gender?: string;
  modelInfo?: string;
  fitType?: string;
  sizeRecommendation?: string;
  detailedModeling?: string;
  materialMain?: string;
  cleaningRecommendation?: string;
  careList?: string[];
  galleryImages?: string[];
  secondaryImage?: string;
}

export interface Product {
  id: string;
  sku: string;
  dbId: string;
  name: string;
  nameEn: string;
  collection: string;
  category: string;
  material: string;
  sizes: string[];
  colors: string[];
  variantStock: ProductVariantStockMap;
  gender: string;
  priceLabel: string;
  priceValue: number;
  unitAmount: number;
  currency: string;
  stock: number;
  active: boolean;
  image: string;
  secondaryImage?: string;
  modelInfo?: string;
  fitType?: string;
  sizeRecommendation?: string;
  detailedModeling?: string;
  materialMain?: string;
  cleaningRecommendation?: string;
  careList?: string[];
  galleryImages?: string[];
  createdAt: string | null;
  updatedAt: string | null;
  href: string;
}
