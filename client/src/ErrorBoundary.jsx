import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page">
        <h2>{this.props.title || "This page failed to render"}</h2>
        <p className="err">{this.state.err.message || "Render failed"}</p>
        <button className="btn" onClick={() => this.setState({ err: null })}>{this.props.retry || "Retry"}</button>
      </div>
    );
  }
}
