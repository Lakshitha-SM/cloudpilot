/**
 * src/config/env.ts
 * CloudPilot Centralized Environment & API Configuration
 * 
 * Standalone Internet Application Configuration:
 * - Single source of truth: EXPO_PUBLIC_API_URL
 * - Fallback to official public CloudPilot backend HTTPS endpoint
 * - Zero local IP addresses (no 10.x, 172.x, 192.168.x, 127.0.0.1, localhost) in production
 */

// Deployed HTTPS CloudPilot production backend URL
export const PRODUCTION_BACKEND_URL = 'https://cloudpilot-backend-o8ei.onrender.com';

export function isLegacyLocalIp(url: string): boolean {
  return /10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+|localhost|127\.0\.0\.1|10\.0\.2\.2/.test(url);
}

export function cleanApiUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  url = url.replace(/\/+$/, '');
  if (!url.endsWith('/api')) {
    url = `${url}/api`;
  }
  return url;
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl && envUrl.length > 0 && (!isLegacyLocalIp(envUrl) || __DEV__)) {
    return cleanApiUrl(envUrl);
  }
  // Production standalone default
  return cleanApiUrl(PRODUCTION_BACKEND_URL);
}

export function getHostBaseUrl(): string {
  const apiUrl = getApiBaseUrl();
  return apiUrl.replace(/\/api\/?$/, '');
}

export const APP_CONFIG = {
  appName: 'CloudPilot',
  version: '1.0.0',
  buildNumber: 1,
  apiTimeoutMs: 15000,
  features: {
    awsLiveSupport: true,
    cloudWatchEnabled: true,
    randomForestPrediction: true,
    ragKnowledgeBase: true,
    reasoningAgent: true,
    aprdaEngine: true,
    dailyRewards: true,
    cloudLab: true,
    challenges: true,
  },
};
