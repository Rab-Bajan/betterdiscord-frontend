import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('A #root elem hiányzik az index.html-ből.');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
