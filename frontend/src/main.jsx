import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={ptBR}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1877f2',
          colorInfo: '#1877f2',
          borderRadius: 16,
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '0 18px 42px rgba(24, 119, 242, 0.12)'
        },
        components: {
          Layout: { siderBg: '#0e2242', headerBg: '#ffffff' },
          Menu: { darkItemBg: '#0e2242', darkItemSelectedBg: '#1877f2' },
          Card: { borderRadiusLG: 20 },
          Table: { borderRadiusLG: 18 },
          Button: { borderRadius: 14 }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
