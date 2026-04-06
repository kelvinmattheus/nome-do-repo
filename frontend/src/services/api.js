import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json'
  },
  // Necessário para enviar/receber cookies HttpOnly em requisições cross-origin (dev)
  withCredentials: true
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
        window.location.href = '/';
      }
      return Promise.reject(error);
    }

    // Erro de rede (sem resposta do servidor): injeta mensagem no formato padrão
    // para que os handlers existentes (error?.response?.data?.message) a exibam.
    if (!error.response) {
      error.response = {
        data: { message: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' }
      };
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
