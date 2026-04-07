import { del, get, HttpError, patch, post } from "@/lib/http";
import type { HttpRequestOptions } from "@/lib/http";
import type {
  AdminAccess,
  AdminMeResponse,
  AdminModulePermission,
  Coupon,
  GiftCard,
  GiftCardTransaction,
  Order,
  Product,
  PublicUser,
  RepairRequest,
} from "@/types";
import type { ProductAvailabilityStatus } from "@/types";

/*
Endpoint mapping used in this file:
- GET /api/admin/me
- GET /api/admin/orders
- GET /api/admin/orders/:id
- PATCH /api/admin/orders/:id
- GET /api/admin/products
- GET /api/admin/products/:id
- POST /api/admin/products
- PATCH /api/admin/products/:id
- GET /api/admin/coupons
- POST /api/admin/coupons
- PATCH /api/admin/coupons/:code
- DELETE /api/admin/coupons/:code
- GET /api/admin/vip
- DELETE /api/admin/vip/:id
- GET /api/admin/newsletter
- DELETE /api/admin/newsletter/:id
- GET /api/admin/audit
- GET /api/admin/audit-logs
- GET /api/admin/audit/:id
- GET /api/admin/private-care
- PATCH /api/admin/private-care/:id
- DELETE /api/admin/private-care/:id
- GET /api/studio-auth/me
- POST /api/studio-auth/login
- POST /api/studio-auth/mfa/setup/init
- POST /api/studio-auth/mfa/verify
- POST /api/studio-auth/logout
*/

export interface AdminOrderShipmentSummary {
  id: string | null;
  provider: string;
  trackingCode: string;
  status: string;
  updatedAt: string | null;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string | null;
  updatedAt: string | null;
  status: string;
  currency: string;
  amount: number;
  itemsAmount: number;
  shippingAmount: number;
  shippingPriceCents: number;
  shippingSelectedProvider: string;
  shippingSelectedService: string;
  shippingSelectedServiceCode: string;
  shippingSelectedCarrierName: string;
  shippingDeadlineDays: number | null;
  shippingDestinationZip: string;
  userEmail: string;
  userName: string;
  isGuest: boolean;
  trackingId: string;
  trackingStatus: string;
  carrier: string;
  shippingDeadline: string | null;
  shipment: AdminOrderShipmentSummary | null;
}

export interface ListOrdersAdminParams {
  status?: string;
  query?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export interface ListOrdersAdminResponse {
  orders: AdminOrderSummary[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
}

export interface AdminShipmentDetail {
  id: string | null;
  provider: string;
  serviceCode: string;
  labelExternalId: string;
  trackingCode: string;
  status: string;
  priceCents: number;
  deadlineDays: number | null;
  rawPayload: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

// DTO: /api/admin/orders/:id extends Order with shipment object.
export interface AdminOrderDetail extends Order {
  shipment: AdminShipmentDetail | null;
}

export interface GetOrderAdminResponse {
  order: AdminOrderDetail;
}

export interface ListProductsAdminParams {
  query?: string;
  status?: string;
  stock?: string;
  page?: number;
  pageSize?: number;
}

// DTO: /api/admin/products (paginated mode) includes duplicated aliases.
export interface ListProductsAdminResponse {
  rows: Product[];
  total: number;
  page: number;
  pageSize: number;
  products: Product[];
  count: number;
  limit: number;
  offset: number;
}

export interface AdminProductCreatePayload {
  sku: string;
  name: string;
  priceCents: number;
  stockQty: number;
  currency?: string;
  imageUrl?: string;
  active?: boolean;
  sizes?: string[];
  colors?: string[];
  variantStock?: Record<string, number>;
  availabilityStatus?: ProductAvailabilityStatus;
  collection?: string;
  category?: string;
  subcategory?: string;
  material?: string;
  gender?: string;
  secondaryImage?: string;
  galleryImages?: string[];
  modelInfo?: string;
  fitType?: string;
  sizeRecommendation?: string;
  detailedModeling?: string;
  materialMain?: string;
  cleaningRecommendation?: string;
  careList?: string[];
}

export type AdminProductUpdatePayload = Partial<Omit<AdminProductCreatePayload, "sku">>;

export interface AdminProductMutationResponse {
  ok: true;
  product: Product;
}

export interface AdminOrderPatchPayload {
  status?: string;
  orderStatus?: string;
  paymentMethod?: string;
  installments?: number;
  failureReason?: string;
  cancellationReason?: string;
  trackingId?: string;
  trackingCode?: string;
  trackingStatus?: string;
  carrier?: string;
  shippingDeadline?: string;
  adminNotes?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  userCpf?: string;
  shippingStreet?: string;
  shippingNumber?: string;
  shippingComplement?: string;
  shippingDistrict?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingAmount?: number;
  shippingPriceCents?: number;
  shippingSelectedService?: string;
  shippingSelectedProvider?: string;
  shippingSelectedCarrierName?: string;
  shippingSelectedServiceCode?: string;
  shippingDestinationZip?: string;
  shipping?: Record<string, unknown>;
  amount?: number;
  itemsAmount?: number;
  items?: Array<{
    id: string;
    name?: string;
    qty: number;
    unitAmount: number;
    currency?: string;
    variantColor?: string | null;
    variantSize?: string | null;
    variantKey?: string | null;
  }>;
}

export interface ListCouponsAdminParams {
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface ListCouponsAdminResponse {
  rows: Coupon[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpsertCouponAdminPayload {
  code: string;
  type?: "percent" | "fixed" | "free_shipping";
  percentOff?: number;
  amountOffCents?: number;
  minSubtotalCents?: number;
  maxDiscountCents?: number;
  maxUses?: number;
  firstPurchaseOnly?: boolean;
  active?: boolean;
  startsAt?: string;
  expiresAt?: string;
  description?: string;
}

export interface UpsertCouponAdminResponse {
  ok: true;
  created?: boolean;
  coupon: Coupon;
}

export interface DeleteCouponAdminResponse {
  ok: true;
  removed: Coupon;
}

export interface ListVipAdminParams {
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminVipRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  source: string;
  subscribedAt: string | null;
  accountCreated: boolean;
}

export interface ListVipAdminResponse {
  rows: AdminVipRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DeleteVipAdminResponse {
  ok: true;
  removed: AdminVipRow | Record<string, unknown>;
}

export interface ListNewsletterAdminParams {
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminNewsletterRow {
  id: string;
  email: string;
  phone: string;
  source: string;
  page: string;
  status: string;
  consent: boolean;
  subscribedAt: string | null;
  updatedAt: string | null;
}

export interface ListNewsletterAdminResponse {
  rows: AdminNewsletterRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DeleteNewsletterAdminResponse {
  ok: true;
  removed: AdminNewsletterRow | Record<string, unknown>;
}

export interface AdminPrivateCareSlot {
  id?: string;
  label?: string;
  date?: string;
  time?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface AdminPrivateCareRequest {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  userId: string | null;
  userEmail: string;
  userName: string;
  channel: string;
  date: string;
  time: string;
  subject: string;
  message: string;
  status: string;
  adminNote: string;
  availableSlots: Array<string | AdminPrivateCareSlot>;
}

export interface ListPrivateCareAdminParams {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPrivateCareAdminResponse {
  rows: AdminPrivateCareRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdatePrivateCareAdminPayload {
  status?: string;
  decision?: "accept" | "decline";
  adminNote?: string;
  availableSlots?: string[];
}

export interface UpdatePrivateCareAdminResponse {
  ok: true;
  request?: AdminPrivateCareRequest;
}

export interface DeletePrivateCareAdminResponse {
  ok: true;
  removed?: AdminPrivateCareRequest;
}

export interface ListRepairsAdminParams {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ListRepairsAdminResponse {
  rows: RepairRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateRepairAdminPayload {
  decision?: "accept" | "reject";
  status?: "awaiting_shipment" | "item_received" | "in_repair" | "completed" | "returned";
  rejectionReason?: string;
  adminNote?: string;
  trackingCode?: string;
  pieceReceivedAt?: string | null;
  returnPostedAt?: string | null;
  returnedDeliveredAt?: string | null;
}

export interface UpdateRepairAdminResponse {
  ok: true;
  repair: RepairRequest;
}

export interface AdminAppointmentBooking {
  id: string;
  slotId: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: "scheduled" | "completed" | "canceled";
  serviceType: string;
  modality: string;
  notes: string;
  adminNote: string;
  createdAt: string | null;
  updatedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  date: string;
  time: string;
  label: string;
  location: string;
}

export interface AdminAppointmentSlot {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  date: string;
  time: string;
  label: string;
  modality: string;
  location: string;
  adminNote: string;
  isAvailable: boolean;
  isBlocked: boolean;
  capacity: number;
  bookedCount: number;
  remainingCount: number;
  status: "available" | "unavailable" | "blocked" | "filled" | "booked";
  createdByAdminId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  appointments: AdminAppointmentBooking[];
}

export interface ListAppointmentSlotsAdminParams {
  date?: string;
  status?: string;
  includePast?: boolean;
}

export interface ListAppointmentSlotsAdminResponse {
  rows: AdminAppointmentSlot[];
  total: number;
}

export interface UpsertAppointmentSlotAdminPayload {
  startsAt?: string;
  endsAt?: string;
  label?: string;
  modality?: string;
  location?: string;
  adminNote?: string;
  capacity?: number;
  isAvailable?: boolean;
  isBlocked?: boolean;
}

export interface CreateAppointmentSlotAdminResponse {
  ok: true;
  slot: AdminAppointmentSlot;
}

export interface UpdateAppointmentSlotAdminResponse {
  ok: true;
  slot: AdminAppointmentSlot;
}

export interface DeleteAppointmentSlotAdminResponse {
  ok: true;
  removed: AdminAppointmentSlot;
}

export interface AdminAppointmentCancelResponse {
  ok: true;
  appointment: AdminAppointmentBooking;
}

export interface AdminAppointmentRescheduleResponse {
  ok: true;
  appointment: AdminAppointmentBooking;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actorAdminId: string | null;
  actorUserId: string | null;
  actorEmail: string;
  requestIp: string;
  userAgent: string;
  changedFields: string[];
  before: unknown | null;
  after: unknown | null;
  meta: Record<string, unknown>;
  reversibleUntil: string | null;
  reversible: boolean;
  reversedAt: string | null;
  reversedByUserId: string | null;
  reversedByEmail: string;
  createdAt: string | null;
}

export interface SearchAuditLogsAdminParams {
  query?: string;
  actor?: string;
  resourceType?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface SearchAuditLogsAdminResponse {
  rows: AdminAuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListAuditLogsAdminParams {
  limit?: number;
  offset?: number;
}

export interface ListAuditLogsAdminResponse {
  logs: AdminAuditLog[];
  count: number;
  limit: number;
  offset: number;
}

export interface GetAuditLogAdminResponse {
  log: AdminAuditLog;
}

export interface StudioAuthMeResponse {
  authenticated: boolean;
  stage: string;
  admin?: PublicUser;
  access?: AdminAccess;
  csrfToken?: string;
  idleTimeoutMs?: number;
}

export interface StudioAuthLoginPayload {
  email: string;
  password: string;
}

export interface StudioAuthLoginResponse {
  ok: true;
  stage: string;
  mfaEnabled: boolean;
  admin: PublicUser;
  access?: AdminAccess;
}

export interface StudioAuthMfaSetupInitResponse {
  stage: string;
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export interface StudioAuthMfaVerifyPayload {
  token?: string;
  recoveryCode?: string;
}

export interface StudioAuthMfaVerifyResponse {
  ok: true;
  stage: string;
  admin: PublicUser;
  access?: AdminAccess;
  recoveryCodes?: string[];
  recoveryUsed?: boolean;
}

export interface AdminAccessRow extends AdminAccess {
  userId?: string | null;
  name?: string;
  nickname?: string;
  createdBy?: string | null;
  createdByEmail?: string | null;
  createdByName?: string | null;
}

export interface ListDirectoriaAdminsResponse {
  rows: AdminAccessRow[];
}

export interface CreateDirectoriaAdminPayload {
  email: string;
  role: "admin" | "director" | "superadmin";
  modules?: AdminModulePermission[];
}

export interface UpdateDirectoriaAdminPermissionsPayload {
  modules: AdminModulePermission[];
}

export interface UpdateDirectoriaAdminRolePayload {
  role: "admin" | "director" | "superadmin";
}

export interface UpdateDirectoriaAdminStatusPayload {
  isActive: boolean;
}

export interface DirectoriaAdminMutationResponse {
  ok: true;
  admin: AdminAccessRow | null;
  permissions?: AdminModulePermission[];
}

export interface BalanceCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  walletCents: number;
  createdAt: string | null;
}

export interface BalanceRequestRow {
  id: string;
  requestedBy: string;
  requesterEmail: string | null;
  requesterName: string | null;
  customerId: string;
  customerEmail: string | null;
  customerName: string | null;
  customerWalletCents: number;
  type: "credit" | "debit";
  amount: number;
  reason: "product_return" | "billing_error" | "courtesy" | "manual_adjustment" | "other";
  reasonDetail: string | null;
  relatedOrderId: string | null;
  internalNote: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewerEmail: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  resultingBalanceCents: number;
}

export interface CreateBalanceRequestPayload {
  customerId: string;
  type: "credit" | "debit";
  amount: number;
  reason: "product_return" | "billing_error" | "courtesy" | "manual_adjustment" | "other";
  reasonDetail?: string;
  relatedOrderId?: string;
  internalNote?: string;
}

export interface ListBalanceCustomersResponse {
  rows: BalanceCustomer[];
}

export interface GetBalanceCustomerResponse {
  customer: BalanceCustomer;
}

export interface BalanceRequestMutationResponse {
  ok: true;
  request: BalanceRequestRow | null;
  beforeBalanceCents?: number;
  afterBalanceCents?: number;
}

export interface ListBalanceRequestsResponse {
  rows: BalanceRequestRow[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface AdminBellNotification {
  id: string;
  adminId: string;
  type: string;
  title: string;
  message: string;
  referenceId: string | null;
  read: boolean;
  createdAt: string | null;
}

export interface ListAdminBellNotificationsResponse {
  rows: AdminBellNotification[];
  unreadCount: number;
}

export interface OpsAuditLogRow {
  id: string;
  action: string;
  performedBy: string;
  performerEmail: string | null;
  performerName: string | null;
  targetType: string | null;
  targetId: string | null;
  beforeState: unknown | null;
  afterState: unknown | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface ListOpsAuditLogsResponse {
  rows: OpsAuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export interface StudioAuthLogoutResponse {
  ok: true;
}

let pendingClientStudioAuthMeRequest: Promise<StudioAuthMeResponse> | null = null;
let cachedClientStudioAuthMe: { value: StudioAuthMeResponse; expiresAt: number } | null = null;
const CLIENT_STUDIO_AUTH_ME_CACHE_TTL_MS = 10_000;

function clearClientStudioAuthMeCache(): void {
  pendingClientStudioAuthMeRequest = null;
  cachedClientStudioAuthMe = null;
}

export interface ListUsersAdminParams {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminUserRow {
  id: string;
  title: "sr" | "sra" | "srta" | "nao_informar" | "";
  name: string;
  email: string;
  phone: string;
  status: string;
  passwordSetupPending?: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  cpf: string;
  cep: string;
}

export interface AdminUserDetail {
  id: string;
  title: "sr" | "sra" | "srta" | "nao_informar" | "";
  name: string;
  email: string;
  phone: string;
  loginDisabled: boolean;
  passwordResetRequired?: boolean;
  lastLoginAt: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  birthDate: string;
  cpf: string;
  cep: string;
  defaultAddressId: string;
  addresses: Array<Record<string, unknown>>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListUsersAdminResponse {
  users: AdminUserRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  count: number;
  limit: number;
  offset: number;
}

export interface AdminUserCreatePayload {
  title?: "sr" | "sra" | "srta" | "nao_informar";
  name: string;
  email: string;
  phone?: string;
  password: string;
  birthDate?: string;
  cpf?: string;
  cep?: string;
}

export interface AdminUserUpdatePayload {
  title?: "sr" | "sra" | "srta" | "nao_informar" | "";
  status?: "active" | "suspended";
  name?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  cpf?: string;
  cep?: string;
}

export interface AdminUserOrderRow {
  id: string;
  orderNumber: string;
  createdAt: string | null;
  status: string;
  currency: string;
  amount: number;
  userId: string;
  productName: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

function buildCsrfHeader(csrfToken?: string): HeadersInit | undefined {
  if (!csrfToken) return undefined;
  return {
    "x-csrf-token": csrfToken,
  };
}

function mergeOptionsWithHeaders(options: HttpRequestOptions | undefined, headers: HeadersInit | undefined): HttpRequestOptions {
  const mergedHeaders = new Headers(options?.headers || undefined);
  if (headers) {
    const extraHeaders = new Headers(headers);
    extraHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }

  return {
    ...(options || {}),
    headers: mergedHeaders,
  };
}

async function resolveCsrfToken(csrfToken?: string, options?: HttpRequestOptions): Promise<string | undefined> {
  const explicit = String(csrfToken || "").trim();
  if (explicit) return explicit;

  if (typeof window === "undefined") return undefined;
  try {
    return await bootstrapAdminCsrfToken(options);
  } catch {
    return undefined;
  }
}

/**
 * GET /api/admin/me
 * Auth: admin session required.
 */
export async function adminMe(options?: HttpRequestOptions): Promise<AdminMeResponse> {
  return get<AdminMeResponse>("/api/admin/me", options);
}

/**
 * GET /api/admin/orders
 * Auth: admin session required.
 */
export async function listOrdersAdmin(
  params: ListOrdersAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListOrdersAdminResponse> {
  const query = buildQuery({
    status: params.status,
    query: params.query,
    page: params.page,
    pageSize: params.pageSize,
    limit: params.limit,
    offset: params.offset,
  });
  return get<ListOrdersAdminResponse>(`/api/admin/orders${query}`, options);
}

/**
 * GET /api/admin/orders/:id
 * Auth: admin session required.
 */
export async function getOrderAdmin(id: string, options?: HttpRequestOptions): Promise<AdminOrderDetail> {
  const response = await get<GetOrderAdminResponse>(`/api/admin/orders/${encodeURIComponent(id)}`, options);
  return response.order;
}

/**
 * PATCH /api/admin/orders/:id
 * Auth: admin session required + CSRF header.
 */
export async function updateOrderAdmin(
  id: string,
  payload: AdminOrderPatchPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true; order: Order }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<{ ok: true; order: Order }>(
    `/api/admin/orders/${encodeURIComponent(id)}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/products
 * Auth: admin session required.
 */
export async function listProductsAdmin(
  params: ListProductsAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListProductsAdminResponse> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 50)));
  const query = buildQuery({
    query: params.query,
    status: params.status,
    stock: params.stock,
    page,
    pageSize,
  });
  return get<ListProductsAdminResponse>(`/api/admin/products${query}`, options);
}

/**
 * GET /api/admin/products/:id
 * Auth: admin session required.
 */
export async function getProductAdmin(id: string, options?: HttpRequestOptions): Promise<Product | null> {
  try {
    const response = await get<{ product: Product }>(`/api/admin/products/${encodeURIComponent(id)}`, options);
    return response.product || null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/**
 * POST /api/admin/products
 * Auth: admin session required + CSRF header.
 */
export async function createProductAdmin(
  payload: AdminProductCreatePayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<AdminProductMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<AdminProductMutationResponse>(
    "/api/admin/products",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * PATCH /api/admin/products/:id
 * Auth: admin session required + CSRF header.
 */
export async function updateProductAdmin(
  id: string,
  payload: AdminProductUpdatePayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<AdminProductMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<AdminProductMutationResponse>(
    `/api/admin/products/${encodeURIComponent(id)}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/coupons
 * Auth: admin session required.
 */
export async function listCouponsAdmin(
  params: ListCouponsAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListCouponsAdminResponse> {
  const query = buildQuery({
    query: params.query,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListCouponsAdminResponse>(`/api/admin/coupons${query}`, options);
}

/**
 * POST /api/admin/coupons
 * Auth: admin session required + CSRF header.
 */
export async function createCouponAdmin(
  payload: UpsertCouponAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<UpsertCouponAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<UpsertCouponAdminResponse>(
    "/api/admin/coupons",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * PATCH /api/admin/coupons/:code
 * Auth: admin session required + CSRF header.
 */
export async function updateCouponAdmin(
  code: string,
  payload: Partial<UpsertCouponAdminPayload>,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<UpsertCouponAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<UpsertCouponAdminResponse>(
    `/api/admin/coupons/${encodeURIComponent(code)}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * DELETE /api/admin/coupons/:code
 * Auth: admin session required + CSRF header.
 */
export async function deleteCouponAdmin(
  code: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DeleteCouponAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<DeleteCouponAdminResponse>(
    `/api/admin/coupons/${encodeURIComponent(code)}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

// ─── Gift Cards ───────────────────────────────────────────────────────────────

export interface ListGiftCardsAdminParams {
  query?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
}

export interface ListGiftCardsAdminResponse {
  rows: GiftCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateGiftCardAdminPayload {
  code?: string;
  initialBalanceCents: number;
  expiresAt?: string | null;
  note?: string;
  active?: boolean;
  maxUses?: number;
}

export interface PatchGiftCardAdminPayload {
  active?: boolean;
  expiresAt?: string | null;
  note?: string;
  maxUses?: number;
}

export interface GiftCardMutationResponse {
  ok: true;
  giftCard: GiftCard;
}

export interface GiftCardDetailResponse {
  giftCard: GiftCard;
  transactions: GiftCardTransaction[];
}

export interface GiftCardDeleteAdminResponse {
  ok: true;
  removed: {
    id: string;
    code: string;
  };
}

/**
 * GET /api/admin/gift-cards
 */
export async function listGiftCardsAdmin(
  params: ListGiftCardsAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListGiftCardsAdminResponse> {
  const query = buildQuery({
    query: params.query,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListGiftCardsAdminResponse>(`/api/admin/gift-cards${query}`, options);
}

/**
 * POST /api/admin/gift-cards
 */
export async function createGiftCardAdmin(
  payload: CreateGiftCardAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<GiftCardMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<GiftCardMutationResponse>(
    "/api/admin/gift-cards",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * PATCH /api/admin/gift-cards/:id
 */
export async function updateGiftCardAdmin(
  id: string,
  payload: PatchGiftCardAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<GiftCardMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<GiftCardMutationResponse>(
    `/api/admin/gift-cards/${encodeURIComponent(id)}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * DELETE /api/admin/gift-cards/:id
 */
export async function deleteGiftCardAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<GiftCardDeleteAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<GiftCardDeleteAdminResponse>(
    `/api/admin/gift-cards/${encodeURIComponent(id)}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/gift-cards/:id/transactions
 */
export async function getGiftCardTransactionsAdmin(
  id: string,
  options?: HttpRequestOptions
): Promise<GiftCardDetailResponse> {
  return get<GiftCardDetailResponse>(`/api/admin/gift-cards/${encodeURIComponent(id)}/transactions`, options);
}

/**
 * GET /api/admin/users
 * Auth: admin session required.
 */
export async function listUsersAdmin(
  params: ListUsersAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListUsersAdminResponse> {
  const query = buildQuery({
    query: params.query,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListUsersAdminResponse>(`/api/admin/users${query}`, options);
}

/**
 * GET /api/admin/users/:id
 * Auth: admin session required.
 */
export async function getUserAdmin(id: string, options?: HttpRequestOptions): Promise<AdminUserDetail> {
  const response = await get<{ user: AdminUserDetail }>(`/api/admin/users/${encodeURIComponent(id)}`, options);
  return response.user;
}

/**
 * GET /api/admin/users/:id/orders
 * Auth: admin session required.
 */
export async function listUserOrdersAdmin(id: string, options?: HttpRequestOptions): Promise<AdminUserOrderRow[]> {
  const response = await get<{ orders: AdminUserOrderRow[] }>(`/api/admin/users/${encodeURIComponent(id)}/orders`, options);
  return Array.isArray(response.orders) ? response.orders : [];
}

/**
 * POST /api/admin/users
 * Auth: admin session required + CSRF header.
 */
export async function createUserAdmin(
  payload: AdminUserCreatePayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<{ ok: true }>("/api/admin/users", payload, mergeOptionsWithHeaders(options, buildCsrfHeader(token)));
}

/**
 * PATCH /api/admin/users/:id
 * Auth: admin session required + CSRF header.
 */
export async function updateUserAdmin(
  id: string,
  payload: AdminUserUpdatePayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * POST /api/admin/users/:id/temp-password
 * Auth: admin session required + CSRF header.
 */
export async function setUserTempPasswordAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true; tempPassword: string }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<{ ok: true; tempPassword: string }>(
    `/api/admin/users/${encodeURIComponent(id)}/temp-password`,
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * POST /api/admin/users/:id/reset-password
 * Auth: admin session required + CSRF header.
 */
export async function resetUserPasswordAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true; expiresAt: string | null; resetTokenExpiresAt: string | null; devCode?: string }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<{ ok: true; expiresAt: string | null; resetTokenExpiresAt: string | null; devCode?: string }>(
    `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * POST /api/admin/users/:id/logout
 * Auth: admin session required + CSRF header.
 */
export async function logoutUserSessionsAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}/logout`,
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * DELETE /api/admin/users/:id/login
 * Auth: admin session required + CSRF header.
 */
export async function disableUserLoginAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}/login`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * DELETE /api/admin/users/:id
 * Auth: admin session required + CSRF header.
 */
export async function deleteUserAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/vip
 * Auth: admin session required.
 */
export async function listVipAdmin(
  params: ListVipAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListVipAdminResponse> {
  const query = buildQuery({
    query: params.query,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListVipAdminResponse>(`/api/admin/vip${query}`, options);
}

/**
 * DELETE /api/admin/vip/:id
 * Auth: admin session required + CSRF header.
 */
export async function deleteVipAdmin(
  id: string | number,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DeleteVipAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<DeleteVipAdminResponse>(
    `/api/admin/vip/${encodeURIComponent(String(id || "").trim())}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/newsletter
 * Auth: admin session required.
 */
export async function listNewsletterAdmin(
  params: ListNewsletterAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListNewsletterAdminResponse> {
  const query = buildQuery({
    query: params.query,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListNewsletterAdminResponse>(`/api/admin/newsletter${query}`, options);
}

/**
 * DELETE /api/admin/newsletter/:id
 * Auth: admin session required + CSRF header.
 */
export async function deleteNewsletterAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DeleteNewsletterAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<DeleteNewsletterAdminResponse>(
    `/api/admin/newsletter/${encodeURIComponent(String(id || "").trim())}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/private-care
 * Auth: admin session required.
 */
export async function listPrivateCareAdmin(
  params: ListPrivateCareAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListPrivateCareAdminResponse> {
  const query = buildQuery({
    query: params.query,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListPrivateCareAdminResponse>(`/api/admin/private-care${query}`, options);
}

/**
 * PATCH /api/admin/private-care/:id
 * Auth: admin session required + CSRF header.
 */
export async function updatePrivateCareAdmin(
  id: string,
  payload: UpdatePrivateCareAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<UpdatePrivateCareAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<UpdatePrivateCareAdminResponse>(
    `/api/admin/private-care/${encodeURIComponent(id)}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * DELETE /api/admin/private-care/:id
 * Auth: admin session required + CSRF header.
 */
export async function deletePrivateCareAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DeletePrivateCareAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<DeletePrivateCareAdminResponse>(
    `/api/admin/private-care/${encodeURIComponent(String(id || "").trim())}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/repairs
 * Auth: admin session required.
 */
export async function listRepairsAdmin(
  params: ListRepairsAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListRepairsAdminResponse> {
  const query = buildQuery({
    query: params.query,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<ListRepairsAdminResponse>(`/api/admin/repairs${query}`, options);
}

/**
 * PATCH /api/admin/repairs/:id
 * Auth: admin session required + CSRF header.
 */
export async function updateRepairAdmin(
  id: string,
  payload: UpdateRepairAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<UpdateRepairAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<UpdateRepairAdminResponse>(
    `/api/admin/repairs/${encodeURIComponent(String(id || "").trim())}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/appointment-slots
 * Auth: admin session required.
 */
export async function listAppointmentSlotsAdmin(
  params: ListAppointmentSlotsAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListAppointmentSlotsAdminResponse> {
  const query = buildQuery({
    date: params.date,
    status: params.status,
    includePast: params.includePast ? "1" : undefined,
  });
  return get<ListAppointmentSlotsAdminResponse>(`/api/admin/appointment-slots${query}`, options);
}

/**
 * POST /api/admin/appointment-slots
 * Auth: admin session required + CSRF header.
 */
export async function createAppointmentSlotAdmin(
  payload: UpsertAppointmentSlotAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<CreateAppointmentSlotAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<CreateAppointmentSlotAdminResponse>(
    "/api/admin/appointment-slots",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * PATCH /api/admin/appointment-slots/:id
 * Auth: admin session required + CSRF header.
 */
export async function updateAppointmentSlotAdmin(
  id: string,
  payload: UpsertAppointmentSlotAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<UpdateAppointmentSlotAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<UpdateAppointmentSlotAdminResponse>(
    `/api/admin/appointment-slots/${encodeURIComponent(String(id || "").trim())}`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * DELETE /api/admin/appointment-slots/:id
 * Auth: admin session required + CSRF header.
 */
export async function deleteAppointmentSlotAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DeleteAppointmentSlotAdminResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<DeleteAppointmentSlotAdminResponse>(
    `/api/admin/appointment-slots/${encodeURIComponent(String(id || "").trim())}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * POST /api/admin/appointments/:id/cancel
 * Auth: admin session required + CSRF header.
 */
export async function cancelAppointmentAdmin(
  appointmentId: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<AdminAppointmentCancelResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<AdminAppointmentCancelResponse>(
    `/api/admin/appointments/${encodeURIComponent(String(appointmentId || "").trim())}/cancel`,
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * POST /api/admin/appointments/:id/reschedule
 * Auth: admin session required + CSRF header.
 */
export async function rescheduleAppointmentAdmin(
  appointmentId: string,
  newSlotId: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<AdminAppointmentRescheduleResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<AdminAppointmentRescheduleResponse>(
    `/api/admin/appointments/${encodeURIComponent(String(appointmentId || "").trim())}/reschedule`,
    { newSlotId },
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/audit
 * Auth: admin session required.
 */
export async function searchAuditLogsAdmin(
  params: SearchAuditLogsAdminParams = {},
  options?: HttpRequestOptions
): Promise<SearchAuditLogsAdminResponse> {
  const query = buildQuery({
    query: params.query,
    actor: params.actor,
    resourceType: params.resourceType,
    action: params.action,
    from: params.from,
    to: params.to,
    page: params.page,
    pageSize: params.pageSize,
  });
  return get<SearchAuditLogsAdminResponse>(`/api/admin/audit${query}`, options);
}

/**
 * GET /api/admin/audit-logs
 * Auth: admin session required.
 */
export async function listAuditLogsAdmin(
  params: ListAuditLogsAdminParams = {},
  options?: HttpRequestOptions
): Promise<ListAuditLogsAdminResponse> {
  const query = buildQuery({
    limit: params.limit,
    offset: params.offset,
  });
  return get<ListAuditLogsAdminResponse>(`/api/admin/audit-logs${query}`, options);
}

/**
 * GET /api/admin/audit/:id
 * Auth: admin session required.
 */
export async function getAuditLogAdmin(id: string, options?: HttpRequestOptions): Promise<AdminAuditLog> {
  const response = await get<GetAuditLogAdminResponse>(`/api/admin/audit/${encodeURIComponent(id)}`, options);
  return response.log;
}

/**
 * GET /api/studio-auth/me
 * Auth: admin studio session.
 */
export async function studioAuthMe(options?: HttpRequestOptions): Promise<StudioAuthMeResponse> {
  const canDeduplicate =
    typeof window !== "undefined" && !options?.cookie && options?.cache !== "no-store";
  if (!canDeduplicate) {
    return get<StudioAuthMeResponse>("/api/studio-auth/me", options);
  }

  if (cachedClientStudioAuthMe && cachedClientStudioAuthMe.expiresAt > Date.now()) {
    return cachedClientStudioAuthMe.value;
  }

  if (!pendingClientStudioAuthMeRequest) {
    pendingClientStudioAuthMeRequest = get<StudioAuthMeResponse>("/api/studio-auth/me", options)
      .then((value) => {
        cachedClientStudioAuthMe = {
          value,
          expiresAt: Date.now() + CLIENT_STUDIO_AUTH_ME_CACHE_TTL_MS,
        };
        return value;
      })
      .finally(() => {
        pendingClientStudioAuthMeRequest = null;
      });
  }

  return pendingClientStudioAuthMeRequest;
}

/**
 * POST /api/studio-auth/login
 * Auth: public.
 */
export async function studioAuthLogin(
  payload: StudioAuthLoginPayload,
  options?: HttpRequestOptions
): Promise<StudioAuthLoginResponse> {
  clearClientStudioAuthMeCache();
  return post<StudioAuthLoginResponse>("/api/studio-auth/login", payload, options);
}

/**
 * POST /api/studio-auth/mfa/setup/init
 * Auth: admin session with password step already completed.
 */
export async function studioAuthMfaSetupInit(options?: HttpRequestOptions): Promise<StudioAuthMfaSetupInitResponse> {
  return post<StudioAuthMfaSetupInitResponse>("/api/studio-auth/mfa/setup/init", {}, options);
}

/**
 * POST /api/studio-auth/mfa/verify
 * Auth: admin session with pending MFA.
 */
export async function studioAuthMfaVerify(
  payload: StudioAuthMfaVerifyPayload,
  options?: HttpRequestOptions
): Promise<StudioAuthMfaVerifyResponse> {
  clearClientStudioAuthMeCache();
  return post<StudioAuthMfaVerifyResponse>("/api/studio-auth/mfa/verify", payload, options);
}

/**
 * POST /api/studio-auth/logout
 * Auth: optional.
 */
export async function studioAuthLogout(options?: HttpRequestOptions): Promise<StudioAuthLogoutResponse> {
  clearClientStudioAuthMeCache();
  return post<StudioAuthLogoutResponse>("/api/studio-auth/logout", {}, options);
}

/**
 * CSRF bootstrap for admin mutations.
 * Source of truth: GET /api/studio-auth/me (returns csrfToken and also refreshes csrf cookie).
 */
export async function bootstrapAdminCsrfToken(options?: HttpRequestOptions): Promise<string> {
  const me = await studioAuthMe({ cache: "no-store", ...(options || {}) });
  const token = String(me.csrfToken || "").trim();
  if (!me.authenticated || !token) {
    throw new Error("ADMIN_CSRF_TOKEN_UNAVAILABLE");
  }
  return token;
}


// ─── Notification types ───────────────────────────────────────────────────────

export type NotificationType = "custom" | "colecao" | "promocao" | "reparo" | "wishlist" | "pedido" | "atendimento";

export type NotificationTarget =
  | "all"
  | "orders"
  | "wishlist"
  | "wishlist_product"
  | "inactive"
  | "city"
  | "state";

export type SendNotificationPayload = {
  title: string;
  body: string;
  target: NotificationTarget;
  notificationType?: NotificationType;
  imageUrl?: string;
  deepLink?: string;
  productSku?: string;
  collectionName?: string;
  filterDaysInactive?: number;
  filterCity?: string;
  filterState?: string;
  scheduledAt?: string; // ISO string
};

export type SendNotificationResult = {
  ok: boolean;
  sent?: number;
  total?: number;
  logId?: string;
  scheduled?: boolean;
  scheduledAt?: string;
};

export type AdminNotificationLog = {
  id: string;
  title: string;
  body: string;
  target: string;
  notification_type: string;
  image_url: string | null;
  deep_link: string | null;
  product_sku: string | null;
  collection_name: string | null;
  filter_days_inactive: number | null;
  filter_city: string | null;
  filter_state: string | null;
  sent_count: number;
  status: string;
  created_at: string;
  sent_by_email: string | null;
};

export type AdminScheduledNotification = {
  id: string;
  title: string;
  body: string;
  target: string;
  notification_type: string;
  image_url: string | null;
  deep_link: string | null;
  product_sku: string | null;
  collection_name: string | null;
  filter_days_inactive: number | null;
  filter_city: string | null;
  filter_state: string | null;
  scheduled_at: string;
  status: string;
  created_at: string;
  created_by_email: string | null;
};

/**
 * POST /api/admin/notifications/send
 * Auth: admin session required + CSRF header.
 */
export async function sendNotificationAdmin(
  payload: SendNotificationPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<SendNotificationResult> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<SendNotificationResult>(
    "/api/admin/notifications/send",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

/**
 * GET /api/admin/notifications/logs
 * Auth: admin session required.
 */
export async function fetchNotificationLogs(
  options?: HttpRequestOptions
): Promise<{ rows: AdminNotificationLog[] }> {
  return get<{ rows: AdminNotificationLog[] }>("/api/admin/notifications/logs", options);
}

/**
 * GET /api/admin/notifications/scheduled
 * Auth: admin session required.
 */
export async function fetchScheduledNotifications(
  options?: HttpRequestOptions
): Promise<{ rows: AdminScheduledNotification[] }> {
  return get<{ rows: AdminScheduledNotification[] }>("/api/admin/notifications/scheduled", options);
}

/**
 * DELETE /api/admin/notifications/scheduled/:id
 * Auth: admin session required + CSRF header.
 */
export async function cancelScheduledNotification(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: boolean }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return del<{ ok: boolean }>(
    `/api/admin/notifications/scheduled/${id}`,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function listDirectoriaAdmins(options?: HttpRequestOptions): Promise<ListDirectoriaAdminsResponse> {
  return get<ListDirectoriaAdminsResponse>("/api/admin/diretoria/admins", options);
}

export async function createDirectoriaAdmin(
  payload: CreateDirectoriaAdminPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DirectoriaAdminMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<DirectoriaAdminMutationResponse>(
    "/api/admin/diretoria/admins",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function updateDirectoriaAdminPermissions(
  id: string,
  payload: UpdateDirectoriaAdminPermissionsPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DirectoriaAdminMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<DirectoriaAdminMutationResponse>(
    `/api/admin/diretoria/admins/${encodeURIComponent(String(id || "").trim())}/permissions`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function updateDirectoriaAdminRole(
  id: string,
  payload: UpdateDirectoriaAdminRolePayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DirectoriaAdminMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<DirectoriaAdminMutationResponse>(
    `/api/admin/diretoria/admins/${encodeURIComponent(String(id || "").trim())}/role`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function updateDirectoriaAdminStatus(
  id: string,
  payload: UpdateDirectoriaAdminStatusPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<DirectoriaAdminMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<DirectoriaAdminMutationResponse>(
    `/api/admin/diretoria/admins/${encodeURIComponent(String(id || "").trim())}/status`,
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function searchBalanceCustomersAdmin(
  queryText: string,
  options?: HttpRequestOptions
): Promise<ListBalanceCustomersResponse> {
  const query = buildQuery({ query: queryText, limit: 20 });
  return get<ListBalanceCustomersResponse>(`/api/admin/balance/customers${query}`, options);
}

export async function getBalanceCustomerAdmin(
  id: string,
  options?: HttpRequestOptions
): Promise<GetBalanceCustomerResponse> {
  return get<GetBalanceCustomerResponse>(`/api/admin/balance/customers/${encodeURIComponent(String(id || "").trim())}`, options);
}

export async function listBalanceCustomerOrdersAdmin(
  id: string,
  options?: HttpRequestOptions
): Promise<AdminUserOrderRow[]> {
  const response = await get<{ orders: AdminUserOrderRow[] }>(
    `/api/admin/balance/customers/${encodeURIComponent(String(id || "").trim())}/orders`,
    options
  );
  return Array.isArray(response.orders) ? response.orders : [];
}

export async function createBalanceRequestAdmin(
  payload: CreateBalanceRequestPayload,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<BalanceRequestMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<BalanceRequestMutationResponse>(
    "/api/admin/balance/requests",
    payload,
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function listMyBalanceRequestsAdmin(options?: HttpRequestOptions): Promise<{ rows: BalanceRequestRow[] }> {
  return get<{ rows: BalanceRequestRow[] }>("/api/admin/balance/requests/mine", options);
}

export async function listDirectoriaBalanceRequests(
  params: { status?: string; requestedBy?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number } = {},
  options?: HttpRequestOptions
): Promise<ListBalanceRequestsResponse> {
  const query = buildQuery({
    status: params.status,
    requested_by: params.requestedBy,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    page: params.page,
    limit: params.limit,
  });
  return get<ListBalanceRequestsResponse>(`/api/admin/diretoria/balance/requests${query}`, options);
}

export async function getDirectoriaBalanceRequest(
  id: string,
  options?: HttpRequestOptions
): Promise<{ request: BalanceRequestRow }> {
  return get<{ request: BalanceRequestRow }>(`/api/admin/diretoria/balance/requests/${encodeURIComponent(String(id || "").trim())}`, options);
}

export async function approveBalanceRequestAdmin(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<BalanceRequestMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<BalanceRequestMutationResponse>(
    `/api/admin/diretoria/balance/requests/${encodeURIComponent(String(id || "").trim())}/approve`,
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function rejectBalanceRequestAdmin(
  id: string,
  rejectionReason: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<BalanceRequestMutationResponse> {
  const token = await resolveCsrfToken(csrfToken, options);
  return post<BalanceRequestMutationResponse>(
    `/api/admin/diretoria/balance/requests/${encodeURIComponent(String(id || "").trim())}/reject`,
    { rejectionReason },
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function listAdminBellNotifications(options?: HttpRequestOptions): Promise<ListAdminBellNotificationsResponse> {
  return get<ListAdminBellNotificationsResponse>("/api/admin/notifications", options);
}

export async function markAdminBellNotificationRead(
  id: string,
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true; notification: AdminBellNotification }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<{ ok: true; notification: AdminBellNotification }>(
    `/api/admin/notifications/${encodeURIComponent(String(id || "").trim())}/read`,
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function markAllAdminBellNotificationsRead(
  csrfToken?: string,
  options?: HttpRequestOptions
): Promise<{ ok: true; count: number }> {
  const token = await resolveCsrfToken(csrfToken, options);
  return patch<{ ok: true; count: number }>(
    "/api/admin/notifications/read-all",
    {},
    mergeOptionsWithHeaders(options, buildCsrfHeader(token))
  );
}

export async function listDirectoriaAuditLogs(
  params: { action?: string; performedBy?: string; targetType?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number } = {},
  options?: HttpRequestOptions
): Promise<ListOpsAuditLogsResponse> {
  const query = buildQuery({
    action: params.action,
    performed_by: params.performedBy,
    target_type: params.targetType,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    page: params.page,
    limit: params.limit,
  });
  return get<ListOpsAuditLogsResponse>(`/api/admin/diretoria/audit-logs${query}`, options);
}

/**
 * POST /api/notifications/register-token
 * Auth: user session (called from iOS app).
 */
export async function registerDeviceToken(
  fcmToken: string,
  options?: HttpRequestOptions
): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/notifications/register-token", { fcmToken, platform: "ios" }, options);
}
