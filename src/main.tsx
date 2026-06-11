import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import Home from './App.tsx';
import './index.css';
import 'uplot/dist/uPlot.min.css';
import 'react-toastify/dist/ReactToastify.css';

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1>Convex 后端未启动</h1>
        <p>请先运行 `npm run dev:backend`，生成 VITE_CONVEX_URL 后再打开前端。</p>
      </main>
    </React.StrictMode>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ConvexProvider client={convex}>
        <Home />
      </ConvexProvider>
    </React.StrictMode>,
  );
}
