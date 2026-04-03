import { useEffect, useRef } from 'react';
import { parseJwt, storeCredential } from '../auth.js';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login({ onLogin }) {
  const btnRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return;

    // The GIS script loads async — poll until window.google is ready.
    let intervalId = setInterval(tryInit, 100);
    tryInit();

    function tryInit() {
      if (!window.google?.accounts?.id) return;
      clearInterval(intervalId);

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => {
          // Store the raw JWT so api.js can attach it to every request.
          storeCredential(response.credential);
          const payload = parseJwt(response.credential);
          onLogin({
            sub:     payload.sub,
            name:    payload.name,
            email:   payload.email,
            picture: payload.picture,
          });
        },
      });

      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_black',
          size:  'large',
          text:  'signin_with',
          shape: 'rectangular',
          width: 280,
        });
      }
    }

    return () => clearInterval(intervalId);
  }, [onLogin]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">WrkPlnr</div>
        <p className="login-tagline">Track every rep. Own every PR.</p>

        {CLIENT_ID ? (
          <div ref={btnRef} className="login-btn-wrap" />
        ) : (
          <div className="login-warning">
            <strong>Configuration required</strong>
            <p>
              Set <code>VITE_GOOGLE_CLIENT_ID</code> in your <code>.env</code> file
              or as a GitHub Actions secret to enable Google sign-in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
