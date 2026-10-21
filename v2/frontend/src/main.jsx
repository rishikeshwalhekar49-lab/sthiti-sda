import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import './styles/v2.css';
import App from './App.jsx';
import { registerServiceWorker } from './pwa.js';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
registerServiceWorker();
