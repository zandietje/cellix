# Marketplace APIs Reference

## Overview

Cellix connects to Shopee and Lazada Open Platforms to fetch ecommerce data for analysis.

## Authentication

Both platforms use OAuth 2.0 for authentication.

### OAuth Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │────▶│ Cellix  │────▶│Platform │
└─────────┘     │ Backend │     │  OAuth  │
                └────┬────┘     └────┬────┘
                     │               │
                     │◀──────────────┤
                     │ Authorization │
                     │    Code       │
                     │               │
                     ├───────────────▶
                     │ Exchange Code │
                     │ for Tokens    │
                     │               │
                     │◀──────────────┤
                     │ access_token  │
                     │ refresh_token │
                     │               │
```

### Token Storage

```typescript
// Store tokens encrypted in Supabase
interface PlatformConnection {
  user_id: string;
  platform: 'shopee' | 'lazada';
  shop_id: string;
  shop_name: string;
  access_token: string;   // Encrypted
  refresh_token: string;  // Encrypted
  token_expires_at: Date;
}
```

## Shopee Open Platform

### API Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://partner.shopeemobile.com` |
| Sandbox | `https://partner.test-stable.shopeemobile.com` |

### Authentication Setup

```typescript
// apps/backend/src/services/platforms/shopee/auth.ts

import crypto from 'crypto';

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID!;
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY!;

function generateSignature(
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken?: string,
  shopId?: string
): string {
  const baseString = accessToken && shopId
    ? `${partnerId}${path}${timestamp}${accessToken}${shopId}`
    : `${partnerId}${path}${timestamp}`;

  return crypto
    .createHmac('sha256', SHOPEE_PARTNER_KEY)
    .update(baseString)
    .digest('hex');
}

async function getAuthUrl(redirectUri: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/shop/auth_partner';
  const sign = generateSignature(SHOPEE_PARTNER_ID, path, timestamp);

  return `https://partner.shopeemobile.com${path}?partner_id=${SHOPEE_PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUri)}`;
}
```

### Key Endpoints

#### Get Shop Info
```typescript
// GET /api/v2/shop/get_shop_info
interface ShopInfo {
  shop_id: number;
  shop_name: string;
  region: string;
  status: string;
}
```

#### Get Order List
```typescript
// GET /api/v2/order/get_order_list
interface OrderListParams {
  time_range_field: 'create_time' | 'update_time';
  time_from: number;  // Unix timestamp
  time_to: number;
  page_size: number;  // Max 100
  cursor?: string;
  order_status?: 'UNPAID' | 'READY_TO_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
}

interface Order {
  order_sn: string;
  order_status: string;
  create_time: number;
  update_time: number;
  total_amount: number;
  currency: string;
  items: OrderItem[];
}
```

#### Get Campaign Performance
```typescript
// GET /api/v2/ads/get_campaigns
interface Campaign {
  campaign_id: number;
  campaign_name: string;
  campaign_type: 'discovery_ads' | 'search_ads' | 'shop_ads';
  status: string;
  daily_budget: number;
  total_budget: number;
}

// GET /api/v2/ads/get_performance
interface CampaignPerformance {
  campaign_id: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  conversions: number;
  gmv: number;
  roas: number;
}
```

### Shopee Connector Implementation

```typescript
// apps/backend/src/services/platforms/shopee/client.ts

import { ShopeeAuth } from './auth';

export class ShopeeClient {
  constructor(
    private auth: ShopeeAuth,
    private shopId: string
  ) {}

  async getOrders(params: OrderListParams): Promise<Order[]> {
    const response = await this.request('/api/v2/order/get_order_list', {
      method: 'GET',
      params,
    });
    return response.order_list;
  }

  async getCampaignPerformance(
    campaignIds: number[],
    startDate: Date,
    endDate: Date
  ): Promise<CampaignPerformance[]> {
    const response = await this.request('/api/v2/ads/get_performance', {
      method: 'GET',
      params: {
        campaign_ids: campaignIds.join(','),
        start_time: Math.floor(startDate.getTime() / 1000),
        end_time: Math.floor(endDate.getTime() / 1000),
      },
    });
    return response.performance_list;
  }

  private async request(path: string, options: RequestOptions) {
    const timestamp = Math.floor(Date.now() / 1000);
    const accessToken = await this.auth.getAccessToken();
    const sign = generateSignature(
      SHOPEE_PARTNER_ID,
      path,
      timestamp,
      accessToken,
      this.shopId
    );

    const url = new URL(path, SHOPEE_BASE_URL);
    url.searchParams.set('partner_id', SHOPEE_PARTNER_ID);
    url.searchParams.set('timestamp', timestamp.toString());
    url.searchParams.set('sign', sign);
    url.searchParams.set('shop_id', this.shopId);
    url.searchParams.set('access_token', accessToken);

    // Add other params
    for (const [key, value] of Object.entries(options.params || {})) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, { method: options.method });
    const data = await response.json();

    if (data.error) {
      throw new ShopeeApiError(data.error, data.message);
    }

    return data.response;
  }
}
```

## Lazada Open Platform

### API Base URLs

| Environment | Region | URL |
|-------------|--------|-----|
| Production | SG | `https://api.lazada.sg/rest` |
| Production | MY | `https://api.lazada.com.my/rest` |
| Production | TH | `https://api.lazada.co.th/rest` |
| Production | PH | `https://api.lazada.com.ph/rest` |
| Production | VN | `https://api.lazada.vn/rest` |
| Production | ID | `https://api.lazada.co.id/rest` |

### Authentication Setup

```typescript
// apps/backend/src/services/platforms/lazada/auth.ts

import crypto from 'crypto';

const LAZADA_APP_KEY = process.env.LAZADA_APP_KEY!;
const LAZADA_APP_SECRET = process.env.LAZADA_APP_SECRET!;

function generateSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const concatenated = sortedKeys.map(k => `${k}${params[k]}`).join('');

  return crypto
    .createHmac('sha256', LAZADA_APP_SECRET)
    .update(concatenated)
    .digest('hex')
    .toUpperCase();
}

async function getAuthUrl(redirectUri: string): Promise<string> {
  return `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${LAZADA_APP_KEY}`;
}
```

### Key Endpoints

#### Get Seller Info
```typescript
// GET /seller/get
interface SellerInfo {
  seller_id: string;
  name: string;
  email: string;
  short_code: string;
  cb: boolean; // Cross-border seller
}
```

#### Get Orders
```typescript
// GET /orders/get
interface OrderParams {
  created_after?: string;  // ISO 8601
  created_before?: string;
  status?: 'pending' | 'shipped' | 'delivered' | 'canceled';
  limit?: number;  // Max 100
  offset?: number;
}

interface LazadaOrder {
  order_id: string;
  order_number: string;
  created_at: string;
  updated_at: string;
  status: string;
  price: string;
  items_count: number;
}
```

#### Get Campaign Performance (Sponsored Solutions)
```typescript
// GET /sponsored/campaign/list
interface SponsoredCampaign {
  campaign_id: string;
  campaign_name: string;
  campaign_type: 'sponsored_discovery' | 'sponsored_search' | 'sponsored_affiliate';
  status: string;
  budget: number;
  start_date: string;
  end_date: string;
}

// GET /sponsored/report/campaign
interface CampaignReport {
  campaign_id: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  orders: number;
  gmv: number;
  roas: number;
}
```

### Lazada Connector Implementation

```typescript
// apps/backend/src/services/platforms/lazada/client.ts

export class LazadaClient {
  constructor(
    private auth: LazadaAuth,
    private region: LazadaRegion
  ) {}

  async getOrders(params: OrderParams): Promise<LazadaOrder[]> {
    const response = await this.request('/orders/get', params);
    return response.data.orders;
  }

  async getCampaignReport(
    campaignIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<CampaignReport[]> {
    const response = await this.request('/sponsored/report/campaign', {
      campaign_ids: JSON.stringify(campaignIds),
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    });
    return response.data;
  }

  private async request(apiPath: string, params: Record<string, string> = {}) {
    const accessToken = await this.auth.getAccessToken();
    const timestamp = new Date().toISOString();

    const signParams = {
      app_key: LAZADA_APP_KEY,
      timestamp,
      access_token: accessToken,
      sign_method: 'sha256',
      ...params,
    };

    const sign = generateSignature(signParams);

    const url = new URL(apiPath, this.getBaseUrl());
    for (const [key, value] of Object.entries(signParams)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('sign', sign);

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== '0') {
      throw new LazadaApiError(data.code, data.message);
    }

    return data;
  }

  private getBaseUrl(): string {
    const baseUrls: Record<LazadaRegion, string> = {
      SG: 'https://api.lazada.sg/rest',
      MY: 'https://api.lazada.com.my/rest',
      TH: 'https://api.lazada.co.th/rest',
      PH: 'https://api.lazada.com.ph/rest',
      VN: 'https://api.lazada.vn/rest',
      ID: 'https://api.lazada.co.id/rest',
    };
    return baseUrls[this.region];
  }
}
```

## Data Normalization

Normalize data from both platforms to a common format:

```typescript
// packages/shared/src/types/normalized.ts

interface NormalizedOrder {
  platform: 'shopee' | 'lazada';
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: number;
  currency: string;
  items: NormalizedOrderItem[];
  raw: unknown; // Original API response
}

interface NormalizedCampaignMetrics {
  platform: 'shopee' | 'lazada';
  campaignId: string;
  campaignName: string;
  campaignType: string;
  dateRange: { start: Date; end: Date };
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  gmv: number;
  roas: number;
}

// Normalizers
function normalizeShopeeOrder(order: ShopeeOrder): NormalizedOrder {
  return {
    platform: 'shopee',
    orderId: order.order_sn,
    orderNumber: order.order_sn,
    status: mapShopeeStatus(order.order_status),
    createdAt: new Date(order.create_time * 1000),
    updatedAt: new Date(order.update_time * 1000),
    totalAmount: order.total_amount,
    currency: order.currency,
    items: order.items.map(normalizeShopeeOrderItem),
    raw: order,
  };
}

function normalizeLazadaOrder(order: LazadaOrder): NormalizedOrder {
  return {
    platform: 'lazada',
    orderId: order.order_id,
    orderNumber: order.order_number,
    status: mapLazadaStatus(order.status),
    createdAt: new Date(order.created_at),
    updatedAt: new Date(order.updated_at),
    totalAmount: parseFloat(order.price),
    currency: 'LOCAL', // Lazada uses local currency
    items: [], // Fetch separately
    raw: order,
  };
}
```

## Rate Limits

| Platform | Limit | Window |
|----------|-------|--------|
| Shopee | 1000 req | per minute |
| Lazada | 50 req | per second |

Implement rate limiting:

```typescript
import { RateLimiter } from 'limiter';

const shopeeLimiter = new RateLimiter({
  tokensPerInterval: 1000,
  interval: 'minute',
});

const lazadaLimiter = new RateLimiter({
  tokensPerInterval: 50,
  interval: 'second',
});

async function rateLimitedRequest(
  platform: 'shopee' | 'lazada',
  requestFn: () => Promise<unknown>
) {
  const limiter = platform === 'shopee' ? shopeeLimiter : lazadaLimiter;
  await limiter.removeTokens(1);
  return requestFn();
}
```

## Error Handling

```typescript
class PlatformApiError extends Error {
  constructor(
    public platform: 'shopee' | 'lazada',
    public code: string,
    public message: string,
    public retryable: boolean
  ) {
    super(`${platform} API Error: ${code} - ${message}`);
  }
}

// Retry logic for transient errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (error instanceof PlatformApiError && !error.retryable) {
        throw error;
      }
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }

  throw lastError!;
}
```
