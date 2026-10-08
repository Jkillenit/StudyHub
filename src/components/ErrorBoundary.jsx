import { Component } from "react";

/** Keeps one broken view from blanking the whole window; resets when `resetKey` changes. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="sh-error-boundary">
        <div className="sh-section-label">Something went wrong</div>
        <p className="sh-error-boundary-text">
          This view hit an error. Your data is saved locally. {String(this.state.error?.message || "")}
        </p>
        <div className="sh-empty-actions">
          <button className="sh-btn-ghost" onClick={() => this.setState({ error: null })}>
            TRY AGAIN
          </button>
          {this.props.onReset ? (
            <button
              className="sh-btn-ghost sh-btn-green"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              BACK TO HUB
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}
