import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './SectionState.css';

/**
 * The shared "this section has nothing to show" block.
 *
 * Every section used to decide for itself, and mostly decided to say nothing:
 * a failed sheet left About with a heading, an empty image box and no
 * paragraph, which reads as a half-built page rather than as a problem worth
 * retrying. One component means an unreachable sheet looks and reads the same
 * wherever it happens, and always offers the way out.
 *
 * `tone` is "error" when something went wrong and "empty" when the sheet
 * answered and simply had no rows — the difference matters, because only the
 * first is worth retrying and only the second is the committee's to fix.
 */
export const SectionMessage = ({ tone = 'empty', title, text, onRetry }) => {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <div className={`sec-state is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="sec-state-icon" aria-hidden="true">{tone === 'error' ? '!' : '—'}</span>
      <p className="sec-state-title">{title || (tone === 'error' ? t.sectionErrorTitle : t.sectionEmptyTitle)}</p>
      <p className="sec-state-text">{text || (tone === 'error' ? t.sectionErrorText : t.sectionEmptyText)}</p>
      {onRetry && (
        <button type="button" className="sec-state-retry" onClick={onRetry}>{t.tryAgain}</button>
      )}
    </div>
  );
};

/**
 * Stops one broken section from taking the page down with it.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * so a single bad row in one section left the visitor with a blank white page
 * — no header, no other section, nothing to click. Wrapping each section keeps
 * the failure the size of the section.
 *
 * A class because that is still the only way to catch a render error; there is
 * no hook equivalent.
 */
export class SectionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Kept for whoever opens the console; there is no error reporting service.
    console.error(`The "${this.props.label || 'page'}" section failed to render:`, error, info);
  }

  reset() {
    this.setState({ failed: false });
    if (this.props.onReset) this.props.onReset();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <section className="sec-state-wrap">
        <SectionMessage tone="error" onRetry={this.reset} />
      </section>
    );
  }
}

export default SectionMessage;
