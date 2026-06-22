import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 可选的 fallback 标题 */
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 开发环境输出到控制台，生产环境静默
    if (import.meta.env?.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-red-50 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <h2 className="text-base font-semibold text-ink mb-2">
              {this.props.title || '页面渲染出错'}
            </h2>
            <p className="text-sm text-muted mb-4 leading-relaxed">
              {this.state.error?.message?.slice(0, 120) || '发生了未知错误'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
