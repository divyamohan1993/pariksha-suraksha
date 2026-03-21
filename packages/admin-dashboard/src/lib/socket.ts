import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./auth";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      auth: {
        token: getAccessToken(),
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });
  }

  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getAccessToken() };
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinExamRoom(examId: string): void {
  const s = getSocket();
  s.emit("join:exam", { examId });
}

export function leaveExamRoom(examId: string): void {
  const s = getSocket();
  s.emit("leave:exam", { examId });
}

export function subscribeToMatrixProgress(
  examId: string,
  callback: (data: { progress: number; generatedPapers: number; totalPapers: number }) => void
): () => void {
  const s = getSocket();
  const event = `matrix:progress:${examId}`;
  s.on(event, callback);
  return () => {
    s.off(event, callback);
  };
}

export function subscribeToEncryptionProgress(
  examId: string,
  callback: (data: {
    step: string;
    progress: number;
    detail: string;
    txHash?: string;
  }) => void
): () => void {
  const s = getSocket();
  const event = `encryption:progress:${examId}`;
  s.on(event, callback);
  return () => {
    s.off(event, callback);
  };
}

export function subscribeToMonitor(
  examId: string,
  callback: (data: unknown) => void
): () => void {
  const s = getSocket();
  const event = `monitor:update:${examId}`;
  s.on(event, callback);
  return () => {
    s.off(event, callback);
  };
}

export function subscribeToAlerts(
  examId: string,
  callback: (alert: { id: string; type: string; message: string; centerId?: string; timestamp: string }) => void
): () => void {
  const s = getSocket();
  const event = `alert:${examId}`;
  s.on(event, callback);
  return () => {
    s.off(event, callback);
  };
}

export function subscribeToCollusionProgress(
  examId: string,
  callback: (data: { progress: number; centersAnalyzed: number; totalCenters: number }) => void
): () => void {
  const s = getSocket();
  const event = `collusion:progress:${examId}`;
  s.on(event, callback);
  return () => {
    s.off(event, callback);
  };
}
