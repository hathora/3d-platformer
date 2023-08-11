import { HathoraClient, HathoraConnection } from "@hathora/client-sdk";

import { ClientMessage, ServerMessage } from "../../common/messages";

export type UpdateListener = (update: ServerMessage) => void;

// A class representing a connection to our server room
export class RoomConnection {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private connection: HathoraConnection | undefined;
  private listeners: UpdateListener[] = [];

  public constructor(private client: HathoraClient, public token: string, public roomId: string) {}

  public async connect() {
    this.connection = await this.client.newConnection(this.roomId);
    this.connection.onMessage((msg) => this.handleMessage(msg));
    this.connection.onClose((err) => this.handleClose(err));
    await this.connection.connect(this.token);
  }

  public addListener(listener: UpdateListener) {
    this.listeners.push(listener);
  }

  public sendMessage(msg: ClientMessage) {
    this.connection?.write(this.encoder.encode(JSON.stringify(msg)));
  }

  public disconnect() {
    this.connection?.disconnect();
    this.listeners = [];
  }

  private handleMessage(data: ArrayBuffer) {
    const msg: ServerMessage = JSON.parse(this.decoder.decode(data));
    this.listeners.forEach((listener) => listener(msg));
  }

  private handleClose(err: { code: number; reason: string }) {
    console.error("close", err);
  }
}
