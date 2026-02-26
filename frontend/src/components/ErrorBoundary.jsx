import { Component } from 'react';

/**
 * Catches React render errors in the tree and shows a fallback UI.
 * Prevents the whole app from unmounting on a single component error.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    if (typeof window !== 'undefined' && typeof window.__reportError === 'function') {
      try {
        window.__reportError({ error, errorInfo });
      } catch (e) {
        console.warn('Error in __reportError:', e);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      if (Fallback) return <Fallback error={this.state.error} />;
      return (
        <div className="error-boundary-fallback" role="alert">
          <h2>Something went wrong</h2>
          <p>We’ve recorded the error. Try refreshing the page.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
