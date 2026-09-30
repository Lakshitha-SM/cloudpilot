/**
 * AppNavigator.tsx — Master Application Navigator
 */
import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  LayoutDashboard, Server, GitBranch, Gift, User 
} from 'lucide-react-native';

// Screen imports
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import AuthScreen from '../screens/AuthScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ResourcesScreen from '../screens/ResourcesScreen';
import PipelineScreen from '../screens/PipelineScreen';
import RewardsScreen from '../screens/RewardsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ResourceDetailScreen from '../screens/ResourceDetailScreen';
import ResourceMappingScreen from '../screens/ResourceMappingScreen';
import APRDADecisionScreen from '../screens/APRDADecisionScreen';
import RAGScreen from '../screens/RAGScreen';
import CloudLabScreen from '../screens/CloudLabScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import SystemStatusScreen from '../screens/SystemStatusScreen';
import HistoryScreen from '../screens/HistoryScreen';
import PredictionScreen from '../screens/PredictionScreen';
import ReasoningScreen from '../screens/ReasoningScreen';
import DeveloperSettingsScreen from '../screens/DeveloperSettingsScreen';
import { Colors } from '../theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: '#070b14',
          borderTopColor: '#172554',
          borderTopWidth: 1,
          height: 60 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.4,
          shadowRadius: 6,
        },
        tabBarActiveTintColor: Colors.cyan,
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={20} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Resources" 
        component={ResourcesScreen}
        options={{
          tabBarLabel: 'Resources',
          tabBarIcon: ({ color, size }) => (
            <Server size={20} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Pipeline" 
        component={PipelineScreen}
        options={{
          tabBarLabel: 'Pipeline',
          tabBarIcon: ({ color, size }) => (
            <GitBranch size={20} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Rewards" 
        component={RewardsScreen}
        options={{
          tabBarLabel: 'Rewards',
          tabBarIcon: ({ color, size }) => (
            <Gift size={20} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User size={20} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#070b14' },
        animation: 'fade_from_bottom',
      }}
      initialRouteName="Splash"
    >
      {/* Auth & Onboarding Flow */}
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />

      {/* Main Tab Bar Host (accessible as both 'Main' and 'MainTabs') */}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="MainTabs" component={MainTabs} />

      {/* Deep Sub-screens & Features */}
      <Stack.Screen name="ResourceDetail" component={ResourceDetailScreen} />
      <Stack.Screen name="ResourceMapping" component={ResourceMappingScreen} />
      <Stack.Screen name="APRDADecision" component={APRDADecisionScreen} />
      <Stack.Screen name="RAG" component={RAGScreen} />
      <Stack.Screen name="CloudLab" component={CloudLabScreen} />
      <Stack.Screen name="Challenges" component={ChallengesScreen} />
      <Stack.Screen name="SystemStatus" component={SystemStatusScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Prediction" component={PredictionScreen} />
      <Stack.Screen name="Reasoning" component={ReasoningScreen} />
      <Stack.Screen name="DeveloperSettings" component={DeveloperSettingsScreen} />
    </Stack.Navigator>
  );
}
