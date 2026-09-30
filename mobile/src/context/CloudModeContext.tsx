/**
 * CloudModeContext.tsx
 * Manages Cloud Environment Mode (Simulation vs AWS Read-Only)
 * and Connection Status (Online / Connecting / Offline) across the mobile app.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkBackendHealth, getActiveApiUrl } from '../api/client';

export type CloudMode = 'simulation' | 'aws_live';
export type ConnectionState = 'online' | 'connecting' | 'offline';

export interface VirtualResource {
  id: string;
  name: string;
  instanceType: string;
  vcpu: number;
  memoryGb: number;
  networkGbps: number;
  io: 'Low' | 'Medium' | 'High';
  currentUtilization: number;
  availabilityZone: string;
  costPerHour: number;
  status: 'running' | 'idle' | 'stopped';
}

export const SIMULATION_RESOURCES: VirtualResource[] = [
  {
    id: 'VM-01',
    name: 'Sandbox-Web-01',
    instanceType: 't3.micro',
    vcpu: 2,
    memoryGb: 1.0,
    networkGbps: 0.5,
    io: 'Low',
    currentUtilization: 34.2,
    availabilityZone: 'us-east-1a',
    costPerHour: 0.0104,
    status: 'running',
  },
  {
    id: 'VM-02',
    name: 'Sandbox-API-02',
    instanceType: 't3.small',
    vcpu: 2,
    memoryGb: 2.0,
    networkGbps: 1.0,
    io: 'Medium',
    currentUtilization: 48.7,
    availabilityZone: 'us-east-1a',
    costPerHour: 0.0208,
    status: 'running',
  },
  {
    id: 'VM-03',
    name: 'Sandbox-Worker-03',
    instanceType: 't3.medium',
    vcpu: 2,
    memoryGb: 4.0,
    networkGbps: 1.2,
    io: 'High',
    currentUtilization: 62.1,
    availabilityZone: 'us-east-1b',
    costPerHour: 0.0416,
    status: 'running',
  },
  {
    id: 'VM-04',
    name: 'Sandbox-Analytics-04',
    instanceType: 't3.large',
    vcpu: 2,
    memoryGb: 8.0,
    networkGbps: 2.0,
    io: 'High',
    currentUtilization: 29.5,
    availabilityZone: 'us-east-1c',
    costPerHour: 0.0832,
    status: 'running',
  },
  {
    id: 'VM-05',
    name: 'Sandbox-Standby-05',
    instanceType: 't3.micro',
    vcpu: 2,
    memoryGb: 1.0,
    networkGbps: 0.5,
    io: 'Low',
    currentUtilization: 5.0,
    availabilityZone: 'us-east-1a',
    costPerHour: 0.0104,
    status: 'idle',
  },
];

interface CloudModeContextType {
  mode: CloudMode;
  isSimulation: boolean;
  isAwsLive: boolean;
  connectionState: ConnectionState;
  latencyMs: number | null;
  lastChecked: Date | null;
  reconnectToast: boolean;
  dismissToast: () => void;
  setMode: (mode: CloudMode) => Promise<void>;
  switchModeWithPrompt: (target: CloudMode, onConfirmed?: () => void) => void;
  refreshHealth: () => Promise<boolean>;
  simulationResources: VirtualResource[];
}

const CloudModeContext = createContext<CloudModeContextType>({} as any);

const STORAGE_KEY_MODE = '@cloudpilot:env_mode';

export const CloudModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<CloudMode>('simulation');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [reconnectToast, setReconnectToast] = useState(false);
  const prevConnRef = useRef<ConnectionState>('connecting');

  // Load saved mode
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY_MODE);
        if (saved === 'simulation' || saved === 'aws_live') {
          setModeState(saved);
        }
      } catch {}
    })();
  }, []);

  const refreshHealth = useCallback(async (): Promise<boolean> => {
    setConnectionState((prev) => (prev === 'offline' ? 'connecting' : prev));
    const result = await checkBackendHealth();
    setLatencyMs(result.latencyMs);
    setLastChecked(new Date());

    const nextState: ConnectionState = result.online ? 'online' : 'offline';
    if (prevConnRef.current === 'offline' && nextState === 'online') {
      setReconnectToast(true);
      setTimeout(() => setReconnectToast(false), 4500);
    }
    prevConnRef.current = nextState;
    setConnectionState(nextState);
    return result.online;
  }, []);

  // Periodic health check
  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 15000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  const setMode = async (newMode: CloudMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_MODE, newMode);
    } catch {}
  };

  const switchModeWithPrompt = (target: CloudMode, onConfirmed?: () => void) => {
    if (target === mode) return;

    if (target === 'aws_live') {
      Alert.alert(
        'Connect to live AWS resources?',
        'CloudPilot communicates with EC2 and CloudWatch in strictly READ_ONLY / DRY_RUN mode.\n\nNo instances will be created, stopped, or modified.',
        [
          { text: 'Stay in Simulation', style: 'cancel' },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              setMode('aws_live');
              onConfirmed?.();
            },
          },
        ]
      );
    } else {
      setMode('simulation');
      onConfirmed?.();
    }
  };

  const dismissToast = () => setReconnectToast(false);

  return (
    <CloudModeContext.Provider
      value={{
        mode,
        isSimulation: mode === 'simulation',
        isAwsLive: mode === 'aws_live',
        connectionState,
        latencyMs,
        lastChecked,
        reconnectToast,
        dismissToast,
        setMode,
        switchModeWithPrompt,
        refreshHealth,
        simulationResources: SIMULATION_RESOURCES,
      }}
    >
      {children}
    </CloudModeContext.Provider>
  );
};

export const useCloudMode = () => useContext(CloudModeContext);
