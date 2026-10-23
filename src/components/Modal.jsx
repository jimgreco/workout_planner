import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, footer, className = '' }) {
  const dialogRef = useRef(null);
  useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const background = [...document.body.children]
      .filter((element) => !element.contains(dialog))
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of background) element.inert = true;
    (dialog.querySelector('[data-modal-autofocus]') || dialog.querySelector(focusableSelector) || dialog).focus();
    return () => {
      for (const { element, inert } of background) element.inert = inert;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...dialogRef.current.querySelectorAll(focusableSelector)]
      .filter((element) => !element.hidden && !element.closest('[hidden]'));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first) { event.preventDefault(); dialogRef.current.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`.trim()} ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>, document.body,
  );
}
