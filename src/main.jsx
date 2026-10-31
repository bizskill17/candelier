import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './index.css';

// Scrolling the mouse wheel over a focused quantity field must not change its value.
document.addEventListener('wheel', (e) => {
  const el = document.activeElement;
  if (el && el.type === 'number' && e.target === el) el.blur();
}, { passive: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={(typeof window !== 'undefined' && window.CANDELIER?.basename) || '/'}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
