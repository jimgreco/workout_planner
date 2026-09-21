import { useId } from 'react';

export default function Logo({ variant = 'full', tone = 'auto', className = '', title = 'Rep, Mix, Burn', ...props }) {
  const titleId = useId();
  const isMarkOnly = variant === 'mark';
  const classes = [
    'repmixburn-logo',
    isMarkOnly ? 'repmixburn-logo-mark' : 'repmixburn-logo-full',
    `repmixburn-logo-tone-${tone}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox={isMarkOnly ? '0 0 64 64' : '0 0 320 72'}
      role={title ? 'img' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title id={titleId}>{title}</title>}
      <g transform={isMarkOnly ? undefined : 'translate(4 4)'}>
        <path
          className="repmixburn-logo-flame-main"
          d="M34.4 3.5c7.6 8.4 17.1 17.1 17.1 30.8 0 15.1-10.8 26.2-25.1 26.2C14.9 60.5 6 52.1 6 40.8c0-8 3.8-14.3 11.5-21.5-.2 6.8 2.9 10.9 7.1 14.3-.9-11.1 2.1-21.7 9.8-30.1Z"
        />
        <path
          className="repmixburn-logo-flame-side"
          d="M17.5 19.3c-.2 6.8 2.9 10.9 7.1 14.3-.6-8.6 1-17 5.4-24.2-10.7 8.2-18.4 17.2-18.4 31 0 9.9 6.7 18.4 17.6 20C15.9 59.3 6 51.3 6 40.8c0-8 3.8-14.3 11.5-21.5Z"
        />
        <path
          className="repmixburn-logo-flame-highlight"
          d="M38.8 14.6c4.3 5.6 7.6 11.8 7.6 20.1 0 3.9-.9 7.5-2.6 10.6 4.9-4.1 7.7-9.9 7.7-16.5 0-9.8-7.3-18-17.1-25.3 1.4 4.1 2.5 7.9 4.4 11.1Z"
        />
        <path
          className="repmixburn-logo-letter"
          d="M22 18H37C45 18 49 22 48 29C47 34 44 37 39 38L47 53H37L30 39H28L26 53H17L22 18ZM30 25L29 32H35C38 32 40 31 40 28C40 26 38 25 35 25H30Z"
        />
      </g>
      {!isMarkOnly && (
        <g className="repmixburn-logo-wordmark">
          <text className="repmixburn-logo-word" x="78" y="34" dominantBaseline="middle">
            Rep, Mix, Burn
          </text>
          <text className="repmixburn-logo-subtitle" x="80" y="54" dominantBaseline="middle">
            Strength Training
          </text>
        </g>
      )}
    </svg>
  );
}
