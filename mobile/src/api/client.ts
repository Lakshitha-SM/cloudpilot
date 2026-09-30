/**
 * CloudPilot Mobile — Centralized Standalone API Client
 * src/api/client.ts
 *
 * ALL API calls must go through this file.
 * Single axios instance. Production uses the canonical deployed HTTPS backend.
 * Zero reliance on local developer IP addresses, Wi-Fi match, or AsyncStorage overrides in production.
 */
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getHostBaseUrl, isLegacyLocalIp, cleanApiUrl } from '../config/env';

// ─── Canonical Base URL ───────────────────────────────────────────────────────

let _activeBaseUrl = getApiBaseUrl();
let _lastSuccessfulRequest: Date | null = null;

// Flush any stale legacy stored IPs from development
(async () => {
  try {
    const saved = await AsyncStorage.getItem('@cloudpilot:custom_api_url');
    if (saved) {
      if (isLegacyLocalIp(saved) || !__DEV__) {
        // Purge legacy IP
        await AsyncStorage.removeItem('@cloudpilot:custom_api_url');
        _activeBaseUrl = getApiBaseUrl();
      } else {
        _activeBaseUrl = cleanApiUrl(saved);
      }
    }
  } catch {}
})();

/** Always returns the current active API base URL (e.g. https://.../api) */
export function getActiveApiUrl(): string {
  return _activeBaseUrl;
}

/** Always returns the host root URL without /api */
export function getActiveHostUrl(): string {
  return _activeBaseUrl.replace(/\/api\/?$/, '');
}

/** Returns the exact health endpoint for the current or target host */
export function getHealthEndpointUrl(targetUrl?: string): string {
  const host = (targetUrl || getActiveHostUrl()).replace(/\/+$/, '').replace(/\/api\/?$/, '');
  return `${host}/api/health`;
}

export function getLastSuccessfulRequest(): Date | null {
  return _lastSuccessfulRequest;
}

export async function setActiveApiUrl(raw: string): Promise<void> {
  // Only allow overriding if in development or explicitly setting a valid remote HTTPS URL
  if (!isLegacyLocalIp(raw) || __DEV__) {
    const normalized = cleanApiUrl(raw);
    _activeBaseUrl = normalized;
    try {
      await AsyncStorage.setItem('@cloudpilot:custom_api_url', normalized);
    } catch {}
  }
}

// ─── Axios Instance ───────────────────────────────────────────────────────────

const client: AxiosInstance = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — sets baseURL and attaches auth token
client.interceptors.request.use(async (config) => {
  config.baseURL = _activeBaseUrl;
  try {
    const token = await AsyncStorage.getItem('@cloudpilot:token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}

  if (__DEV__) {
    console.log(`[CloudPilot API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  }
  return config;
});

// Response interceptor — tracks last success
client.interceptors.response.use(
  (response) => {
    _lastSuccessfulRequest = new Date();
    return response;
  },
  (error: AxiosError) => {
    if (__DEV__) {
      console.warn(`[CloudPilot API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}: ${error.message}`);
    }
    return Promise.reject(error);
  }
);

// ─── Production Error Normalizer ─────────────────────────────────────────────

export interface CloudPilotError {
  userMessage: string;
  technicalDetail: string;
  status?: number;
  canRetry: boolean;
}

export function normalizeError(e: unknown): CloudPilotError {
  const err = e as AxiosError;
  if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return {
      userMessage: 'CloudPilot server took too long to respond.',
      technicalDetail: 'Request timed out after 15s.',
      canRetry: true,
    };
  }
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') {
    return {
      userMessage: 'CloudPilot server is temporarily unavailable.',
      technicalDetail: 'Network connection failed. Verify internet access.',
      canRetry: true,
    };
  }
  const status = err?.response?.status;
  if (status === 404) {
    return {
      userMessage: 'The requested CloudPilot service is temporarily unavailable.',
      technicalDetail: `HTTP 404 — ${err.config?.url}`,
      status: 404,
      canRetry: false,
    };
  }
  if (status === 401 || status === 403) {
    return {
      userMessage: 'Authentication required. Please sign in again.',
      technicalDetail: `HTTP ${status}`,
      status,
      canRetry: false,
    };
  }
  if (status && status >= 500) {
    return {
      userMessage: 'CloudPilot server encountered an error. Please try again.',
      technicalDetail: `HTTP ${status}`,
      status,
      canRetry: true,
    };
  }
  return {
    userMessage: 'CloudPilot server is temporarily unavailable.',
    technicalDetail: err?.message || 'Unknown network error',
    canRetry: true,
  };
}

// ─── Health & Connectivity Diagnostic ─────────────────────────────────────────

export type HealthStatusCategory = 'CONNECTED' | 'TIMEOUT' | 'HTTP_ERROR' | 'UNREACHABLE';

export interface HealthCheckResult {
  online: boolean;
  category: HealthStatusCategory;
  latencyMs: number;
  data?: any;
  error?: string;
  hostUrl: string;
  healthUrl: string;
  checkedAt: Date;
}

export async function checkBackendHealth(targetHost?: string): Promise<HealthCheckResult> {
  const hostUrl = targetHost ? targetHost.replace(/\/+$/, '').replace(/\/api\/?$/, '') : getActiveHostUrl();
  const healthUrl = `${hostUrl}/api/health`;
  const start = Date.now();

  try {
    const res = await axios.get(healthUrl, {
      timeout: 8000,
      headers: { 'Accept': 'application/json' },
    });
    const latency = Date.now() - start;
    _lastSuccessfulRequest = new Date();
    return {
      online: true,
      category: 'CONNECTED',
      latencyMs: latency,
      data: res.data,
      hostUrl,
      healthUrl,
      checkedAt: new Date(),
    };
  } catch (e: any) {
    const latency = Date.now() - start;
    let category: HealthStatusCategory = 'UNREACHABLE';
    let errMsg = 'CloudPilot server is temporarily unavailable.';

    if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
      category = 'TIMEOUT';
      errMsg = 'Connection timed out. Retrying...';
    } else if (e.response?.status) {
      category = 'HTTP_ERROR';
      errMsg = `Server returned status ${e.response.status}.`;
    }

    return {
      online: false,
      category,
      latencyMs: latency,
      error: errMsg,
      hostUrl,
      healthUrl,
      checkedAt: new Date(),
    };
  }
}

// ─── Auth APIs ────────────────────────────────────────────────────────────────

export const authApi = {
  signup: (email: string, password: string) =>
    client.post('/mobile/auth/signup', { email, password }),
  login: (email: string, password: string) =>
    client.post('/mobile/auth/login', { email, password }),
};

// ─── System / Health APIs ─────────────────────────────────────────────────────

export const systemApi = {
  health:        () => client.get('/health'),
  version:       () => client.get('/version'),
  systemStatus:  () => client.get('/system/status'),
  modelMetadata: () => client.get('/model/metadata'),
  dbSummary:     () => client.get('/db/summary'),
  awsStatus:     () => client.get('/aws/status'),
  awsInstances:  () => client.get('/aws/instances'),
  awsMetrics:    (id: string) => client.get(`/aws/metrics/${id}`),
};

// ─── Workload APIs ────────────────────────────────────────────────────────────

export const workloadApi = {
  generate: (scenario = 'normal', step = 0) =>
    client.get('/workload/generate', { params: { scenario, step } }),
};

// ─── Agent APIs (all POST) ────────────────────────────────────────────────────

export const DEFAULT_WORKLOAD = {
  scenario: 'normal',
  current_cpu: 35.0,
  current_memory: 42.0,
  current_io: 0.8,
  current_network: 0.4,
  request_rate: 500.0,
  active_users: 200,
  workload_type: 'E-Commerce',
  workload_type_code: 1,
  workload_intensity: 'Normal',
  required_cpu: 30.0,
  required_mem: 4.0,
  required_io: 'Medium',
  required_net: 0.5,
  previous_cpu: 30.0,
  rolling_cpu_mean: 33.0,
  rolling_cpu_std: 3.5,
  rolling_memory_mean: 40.0,
  traffic_growth: 0.05,
  hour: new Date().getHours(),
  day: new Date().getDay(),
  mode: 'sim',
};

export const agentApi = {
  runMapping:    (payload = DEFAULT_WORKLOAD) => client.post('/agents/mapping',    payload),
  runPrediction: (payload = DEFAULT_WORKLOAD) => client.post('/agents/prediction', payload),
  runRag:        (payload = DEFAULT_WORKLOAD) => client.post('/agents/rag',        payload),
  runReasoning:  (payload = DEFAULT_WORKLOAD) => client.post('/agents/reasoning',  payload),
  runAprda:      (payload = DEFAULT_WORKLOAD) => client.post('/agents/aprda',      payload),
  runPipeline:   (payload = DEFAULT_WORKLOAD) => client.post('/pipeline',          payload),
};

// ─── Database / History APIs ──────────────────────────────────────────────────

export const historyApi = {
  allocations:    (limit = 20) => client.get('/db/allocations',     { params: { limit } }),
  aprdaDecisions: (limit = 20) => client.get('/db/aprda_decisions', { params: { limit } }),
};

// ─── Mobile (Rewards / Credits) APIs ─────────────────────────────────────────

export const mobileApi = {
  profile:        (userId: number) => client.get(`/mobile/profile/${userId}`),
  dailyCheckin:   (userId: number) => client.post(`/mobile/rewards/checkin?user_id=${userId}`),
  spinStatus:     (userId: number) => client.get(`/mobile/rewards/spin/status?user_id=${userId}`),
  dailySpin:      (userId: number) => client.post(`/mobile/rewards/spin?user_id=${userId}`),
  history:        (userId: number) => client.get(`/mobile/history/${userId}`),
  challenges:     (userId: number) => client.get(`/mobile/challenges?user_id=${userId}`),
  claimChallenge: (userId: number, challengeId: string) => client.post(`/mobile/challenges/claim?user_id=${userId}&challenge_id=${challengeId}`),
  runLab:         (userId: number, labId: string) => client.post('/mobile/labs/run', { user_id: userId, lab_id: labId }),
};

export default client;
