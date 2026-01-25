// Yjs connection management
import { getLogger } from "../logger";

const logger = getLogger("yjs-connection");

export enum ConnectionStatus {
    Disconnected = "disconnected",
    Connecting = "connecting",
    Connected = "connected",
    Error = "error",
}

export interface ConnectionState {
    status: ConnectionStatus;
    error?: Error;
}

// Connection state listeners
const listeners = new Set<(state: ConnectionState) => void>();

let currentState: ConnectionState = {
    status: ConnectionStatus.Disconnected,
};

function updateState(newState: Partial<ConnectionState>) {
    currentState = { ...currentState, ...newState };
    notifyListeners();
}

function notifyListeners() {
    listeners.forEach(listener => listener(currentState));
}

export function onConnectionChange(listener: (state: ConnectionState) => void): () => void {
    listeners.add(listener);
    listener(currentState);
    return () => listeners.delete(listener);
}

// Called from YjsClient
export function setConnectionStatus(status: ConnectionStatus, error?: Error) {
    logger.info(`Connection status changed: ${status}`, error);
    updateState({ status, error });
}
