/**
 * src/components/ErrorBoundary.tsx
 * Global React error boundary — catches any unhandled render errors
 * and shows a clean recovery UI instead of a blank crash screen.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme/colors';

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // In production, you would log to a crash analytics service here
    console.error('[CloudPilot ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = __DEV__;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.iconBox}>
            <Text style={styles.icon}>⚠️</Text>
          </View>

          <Text style={styles.title}>CloudPilot encountered an error</Text>
          <Text style={styles.subtitle}>
            Something unexpected happened. Your data is safe.
          </Text>

          <TouchableOpacity style={styles.retryBtn} onPress={this.handleReset}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>

          {isDev && this.state.error ? (
            <View style={styles.devBox}>
              <Text style={styles.devTitle}>Developer Details</Text>
              <Text style={styles.devText}>{this.state.error.toString()}</Text>
              {this.state.errorInfo?.componentStack ? (
                <Text style={styles.devStack} numberOfLines={20}>
                  {this.state.errorInfo.componentStack}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

export default ErrorBoundary;

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  content:    {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl,
  },
  iconBox:    {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  icon:       { fontSize: 36 },
  title:      {
    fontSize: 20, fontWeight: '800', color: Colors.textPrimary,
    textAlign: 'center', marginBottom: 10,
  },
  subtitle:   {
    fontSize: 14, color: Colors.textMuted, textAlign: 'center',
    lineHeight: 20, marginBottom: Spacing.lg,
  },
  retryBtn:   {
    backgroundColor: Colors.cyanDark, paddingVertical: 14,
    paddingHorizontal: 36, borderRadius: Radius.md, marginBottom: Spacing.lg,
  },
  retryText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  devBox:     {
    width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.bgCardBorder,
  },
  devTitle:   { color: Colors.orange, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  devText:    { color: Colors.red, fontSize: 11, fontFamily: 'monospace', marginBottom: 8 },
  devStack:   { color: Colors.textMuted, fontSize: 9, fontFamily: 'monospace' },
});
