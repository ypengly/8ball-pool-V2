import { ShotInput } from '../physics/Cue';

export interface ServerBallDTO {
  id: number;
  number: number;
  type: string;
  x: number;
  y: number;
  pocketed: boolean;
}

export interface ServerStateUpdate {
  balls: ServerBallDTO[];
  currentPlayer: number;
  tableOpen: boolean;
  gameOver: boolean;
  winner?: number;
  foulReasons?: string[];
  tick: number;
}

type Listener = (state: ServerStateUpdate) => void;
type ErrorListener = (code: string, message: string) => void;

// NetworkClient is the online-multiplayer counterpart to the local
// GameSession: it does NOT run physics itself. It sends shot intent to the
// server and renders whatever STATE_UPDATE comes back — matching "the
// client must never decide who won, whether a ball was pocketed, whose turn
// it is" from the design doc. Wiring this into TableScene (an "online mode"
// alongside today's local/AI mode) is tracked as a next step in PHASES.md;
// this class is complete and usable on its own already.
export class NetworkClient {
  private socket: WebSocket | null = null;
  private stateListeners: Listener[] = [];
  private errorListeners: ErrorListener[] = [];
  private reconnectAttempts = 0;
  private roomId: string;
  private playerIndex: number;
  private serverUrl: string;
  private manuallyClosed = false;

  constructor(serverUrl: string, roomId: string, playerIndex: number) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.playerIndex = playerIndex;
  }

  connect(): void {
    this.manuallyClosed = false;
    const url = `${this.serverUrl}/ws/game/${this.roomId}?player=${this.playerIndex}`;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      const env = JSON.parse(event.data);
      if (env.type === 'STATE_UPDATE') {
        this.stateListeners.forEach((l) => l(env.data as ServerStateUpdate));
      } else if (env.type === 'ERROR') {
        this.errorListeners.forEach((l) => l(env.data.code, env.data.message));
      }
    };

    this.socket.onclose = () => {
      if (this.manuallyClosed) return;
      // Exponential backoff reconnection, capped at 10s — covers brief
      // network blips without hammering the server on a real outage.
      const delay = Math.min(10000, 500 * 2 ** this.reconnectAttempts);
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), delay);
    };

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
    };
  }

  sendShot(input: ShotInput): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'SHOT', data: { shot: input } }));
  }

  onStateUpdate(listener: Listener): void {
    this.stateListeners.push(listener);
  }

  onError(listener: ErrorListener): void {
    this.errorListeners.push(listener);
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.socket?.close();
  }
}
