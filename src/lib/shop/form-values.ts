// Forme dei dati dei form admin dello shop, condivise tra le pagine (server), i componenti
// client e le azioni (*.admin.ts). Qui e non nei file admin, perché i componenti non possono
// importare i file *.admin.ts (ESLint).
import type { Allergen } from "./allergens";
import type { ProductCategory, StockStatus, VatRate } from "./config";

export type SupplierKind = "manual" | "api";

export type SupplierFormValues = {
  id: string | null;
  name: string;
  kind: SupplierKind;
  contactEmail: string;
  portalUrl: string | null;
  adapterKey: string | null;
  notes: string | null;
  isActive: boolean;
};

export type ProducerFormValues = {
  id: string | null;
  slug: string;
  name: string;
  email: string | null;
  vatNumber: string | null;
  address: string | null;
  storyIt: string | null;
  storyEn: string | null;
  areaId: string | null;
  placeId: string | null;
  isPublic: boolean;
  isActive: boolean;
};

export type ProductFormValues = {
  id: string | null;
  slug: string;
  supplierId: string;
  producerId: string;
  supplierSku: string | null;
  titleIt: string;
  titleEn: string | null;
  category: ProductCategory;
  formatLabel: string | null;
  // Centesimi IVA inclusa; il form li mostra come importo in euro.
  priceCents: number;
  costCents: number | null;
  vatRate: VatRate;
  descriptionIt: string | null;
  descriptionEn: string | null;
  ingredientsIt: string | null;
  ingredientsEn: string | null;
  allergens: Allergen[];
  // Allergeni verificati (Reg. UE 1169/2011): obbligatorio per attivare il prodotto.
  allergensDeclared: boolean;
  storageIt: string | null;
  storageEn: string | null;
  minShelfLifeDays: number | null;
  isPerishable: boolean;
  stockStatus: StockStatus;
  leadTimeDays: number;
  areaId: string | null;
  placeIds: string[];
  activityIds: string[];
  mediaIds: string[];
  boxItems: { productId: string; quantity: number }[];
  isActive: boolean;
};

export type ShopFormOptions = {
  suppliers: { id: string; name: string }[];
  producers: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  places: { id: string; name: string }[];
  activities: { id: string; title: string }[];
  products: { id: string; title: string }[];
  media: { id: string; label: string }[];
};

export type ProductImportPreview = {
  totals: { create: number; update: number; error: number };
  rows: { line: number; title: string; status: "create" | "update" | "error"; issues: string[] }[];
};

export type ProductImportFormState =
  | { status: "idle" }
  | { status: "preview"; preview: ProductImportPreview }
  | { status: "imported"; created: number; updated: number }
  | { status: "error"; code: "invalid_file" | "missing_columns" | "failed"; columns?: string[] };

export type ProductImportFormAction = (
  prev: ProductImportFormState,
  formData: FormData,
) => Promise<ProductImportFormState>;
