export type Direction = {
  x: number;
  y: number;
  z: number;
}

export type Position = {
  x: number;
  y: number;
  z: number;
};

export type Player = {
  id: string;
  position: Position;
  theta: number;
  grounded: boolean;
  animation: string;
};

export type GameState = {
  players: Player[];
};
