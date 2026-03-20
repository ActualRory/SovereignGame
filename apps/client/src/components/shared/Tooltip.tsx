import { useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 200 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = useCallback((e: React.MouseEvent) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top - 8;
      setPos({ x, y });
      setVisible(true);
    }, delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  const tooltipStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    transform: 'translate(-50%, -100%)',
  };

  // If tooltip would overflow left/right, adjust
  // This is handled by max-width in CSS + translate centering

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseMove={show}
        onMouseLeave={hide}
        style={{ display: 'inline' }}
      >
        {children}
      </span>
      {visible && createPortal(
        <div className="tooltip-portal" style={tooltipStyle}>
          <div className="tooltip-content">
            {content}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
