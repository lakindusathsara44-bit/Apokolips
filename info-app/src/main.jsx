import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './InfoApp.jsx';
import '../../style.css';
import './styles.css';

const root = document.getElementById('info-root');
if (!root) throw new Error('Apokolips profile root was not found.');

class InfoErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('Apokolips profile error:', error);
  }
  render() {
    if (this.state.failed) {
      return <main className="info-error">
        <p>APOKOLIPS / PROFILE</p>
        <h1>The profile could not be loaded.</h1>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
        <a href="./index.html">Return to homepage ↗</a>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(root).render(<InfoErrorBoundary><App /></InfoErrorBoundary>);
