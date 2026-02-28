import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

type SocketContextType = {
  supervisedSocket: Socket | null;
  unsupervisedSocket: Socket | null;
  initializeSockets: () => void;
};

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export function SocketProvider({ children }: { children: ReactNode }) {
  const [supervisedSocket, setSupervisedSocket] = useState<Socket | null>(null);
  const [unsupervisedSocket, setUnsupervisedSocket] = useState<Socket | null>(null);

  const initializeSockets = useCallback(() => {
    setSupervisedSocket((currentSocket) => {
      if (currentSocket) {
        return currentSocket;
      }

      return io(`${SOCKET_BASE_URL}/supervised`);
    });

    setUnsupervisedSocket((currentSocket) => {
      if (currentSocket) {
        return currentSocket;
      }

      return io(`${SOCKET_BASE_URL}/unsupervised`);
    });
  }, []);

  useEffect(() => {
    return () => {
      supervisedSocket?.disconnect();
      unsupervisedSocket?.disconnect();
    };
  }, [supervisedSocket, unsupervisedSocket]);

  const value = useMemo(
    () => ({
      supervisedSocket,
      unsupervisedSocket,
      initializeSockets,
    }),
    [supervisedSocket, unsupervisedSocket, initializeSockets],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSockets() {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useSockets must be used inside SocketProvider.");
  }

  return context;
}
