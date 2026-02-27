import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrimeReactProvider } from 'primereact/api';
import { SocketProvider } from './context/SocketContext.tsx';



createRoot(document.getElementById('root')!).render(
  <SocketProvider>
    <PrimeReactProvider>
      <App />
    </PrimeReactProvider>
  </SocketProvider>
)
