import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error?: Error }
> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error)
      this.setState({ error: undefined });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state">
        <h2>화면을 표시하는 중 오류가 발생했습니다</h2>
        <pre className="prompt-code">{this.state.error.message}</pre>
        <button className="accent" onClick={() => this.setState({ error: undefined })}>
          다시 시도
        </button>
      </div>
    );
  }
}
