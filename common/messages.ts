import { Direction, GameState } from "./types";

export enum ClientMessageType {
  SetDirection,
  SetTheta,
  Jump,
}

export enum ServerMessageType {
  StateUpdate,
}

export type ClientMessage = SetDirectionMessage | SetThetaMessage | JumpMessage;

export type SetDirectionMessage = {
  type: ClientMessageType.SetDirection;
  direction: Direction;
};

export type SetThetaMessage = {
  type: ClientMessageType.SetTheta;
  theta: number;
}

export type JumpMessage = {
  type: ClientMessageType.Jump;
};

export type ServerMessage = StateUpdateMessage;

export type StateUpdateMessage = {
  type: ServerMessageType.StateUpdate;
  state: GameState;
  ts: number;
};
