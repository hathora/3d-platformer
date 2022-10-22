import './style.css';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { AnimationAction, AnimationMixer } from 'three';
import { HathoraClient } from "@hathora/client-sdk";
import { RoomConnection } from "./connection";
import { InterpolationBuffer } from "interpolation-buffer";
import { Direction, GameState, Player } from "../../common/types";
import { ClientMessageType } from "../../common/messages";

// Instantiate an object which represents our client
const client = new HathoraClient(process.env.APP_ID as string, process.env.COORDINATOR_HOST);

const scene = new THREE.Scene()

const light = new THREE.PointLight()
light.position.set(0.8, 1.4, 1.0)
scene.add(light)

const ambientLight = new THREE.AmbientLight()
scene.add(ambientLight)

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
)
camera.position.set(2, 7, 2)

const renderer = new THREE.WebGLRenderer()
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

let animMixer: AnimationMixer | null = null;
const animationClips: Map<string, THREE.AnimationClip> = new Map;
let rootPlayerModel: THREE.Group = new THREE.Group();
let currentPlayerModel: THREE.Object3D;
let connection: RoomConnection;
let currentUserId: string;
let stateBuffer: InterpolationBuffer<GameState>;

//const material = new THREE.MeshNormalMaterial()

type PlayerEntity = {
  model: THREE.Object3D,
  animMixer: AnimationMixer,
  animActions: Map<string, AnimationAction>,
  currentAnimAction: AnimationAction | undefined
};

function loadAnimation(url: string) {
  return new Promise<THREE.AnimationClip>((resolve, reject) => {
    fbxLoader.load(
      url,
      (object) => {
        resolve((object as THREE.Object3D).animations[0]);
      },
      undefined,
      reject
    )
  });
}

const fbxLoader = new FBXLoader()
fbxLoader.load(
    '/models/player/Idle.fbx',
    async (object) => {
        // object.traverse(function (child) {
        //     if ((child as THREE.Mesh).isMesh) {
        //         // (child as THREE.Mesh).material = material
        //         if ((child as THREE.Mesh).material) {
        //             ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).transparent = false
        //         }
        //     }
        // })
        // object.scale.set(.01, .01, .01)
        object.scale.set(0.005, 0.005, 0.005);

        object.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        rootPlayerModel = object;

        animMixer = new THREE.AnimationMixer(object);

        const anims = await Promise.all([
          loadAnimation('/models/player/unskinned/Fast Run.fbx'),
          loadAnimation('/models/player/unskinned/Fall A Loop.fbx')
        ]);

        animationClips.set('idle', (object as THREE.Object3D).animations[0]);
        animationClips.set('run', anims[0]);
        animationClips.set('jump', anims[1]);

        // Create floor
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('/textures/Ground037_1K_Color.jpg');

        // Enable repeating on our grass texture
        groundTexture.repeat.set(5, 5);
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;

        // Create a box for the ground and apply our texture
        const geometry = new THREE.BoxGeometry(40, 1, 40);
        const material = new THREE.MeshBasicMaterial({
          map: groundTexture
        });
        const ground = new THREE.Mesh(geometry, material);
        ground.castShadow = true;
        ground.receiveShadow = true;
        scene.add(ground);

        getToken().then(async (token) => {
          // Once we have a token, we can get our roomId
          const roomId = await getRoomId(token);

          // With a roomId, we can establish a connection to the room on server
          connection = new RoomConnection(client, token, roomId);
          await connection.connect();

          // Save the current user's ID, so we know who to follow with the camera
          const currentUser = HathoraClient.getUserFromToken(token);
          currentUserId = currentUser.id;

          // Begin linear interpolation for player positions
          connection.addListener(({ state, ts }) => {
            // Start enqueuing state updates
            if (stateBuffer === undefined) {
              stateBuffer = new InterpolationBuffer(state, 50, lerp);
            }
            else {
              stateBuffer.enqueue(state, [], ts);
            }
          });

          init();
        });
    },
    () => {
        // console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
    },
    (error) => {
        console.log(error)
    }
)

window.addEventListener('resize', onWindowResize, false)
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  render()
}

const clock = new THREE.Clock();

function animate() {

  render()


  if (animMixer !== null) {
    animMixer.update(clock.getDelta());

    // if (isKeysDown(['w', 's', 'a', 'd'])) {
    //   const nextAnim = animations.get('run');

    //   if (currentAnimation !== animations.get('run')) {
    //     // currentAnimation?.fadeOut(0.3);
    //     nextAnim?.play();
    //     currentAnimation?.stop();
    //     currentAnimation?.reset();

    //     // nextAnim?.fadeIn(0.3);
        
    //     currentAnimation = nextAnim;
    //   }
    // }
    // else {
    //   const nextAnim = animations.get('idle');

    //   if (currentAnimation !== animations.get('idle')) {
    //     // currentAnimation?.fadeOut(0.3);
    //     nextAnim?.play();
    //     currentAnimation?.stop();
    //     currentAnimation?.reset();

    //     // nextAnim?.fadeIn(0.3);
        
    //     currentAnimation = nextAnim;
    //   }
    // }
  }

}

function loopAnim(player: PlayerEntity | undefined, animKey: string) {
  if (!player) {
    return;
  }

  const nextAnim = player.animActions.get(animKey);

  player.animMixer.update(clock.getDelta());

  if (player.currentAnimAction !== nextAnim) {
    nextAnim?.play();
    player.currentAnimAction?.stop();
    player.currentAnimAction?.reset();

    player.currentAnimAction = nextAnim;
  }
}

function render() {
  renderer.render(scene, camera);
}

let playerEntities: Map<string, PlayerEntity> = new Map();

function syncModels() {
  // If the stateBuffer hasn't been defined, skip this update tick
  if (stateBuffer === undefined) {
    return;
  }

  // Get current interpolated state from buffer
  const { state } = stateBuffer.getInterpolatedState(Date.now());
  const {players} = state;

  players.forEach((player) => {
    // If the player exists, update their position
    if (playerEntities.has(player.id)) {
      const entity = playerEntities.get(player.id);

      entity?.model.position.set(player.position.x, player.position.y, player.position.z);
      entity?.model.rotation.set(
        0,
        player.rotation,
        0
      );

      // Handle animation syncing
      if (player.grounded) {
        if (player.isMoving) {
          loopAnim(entity, 'run');
        }
        else {
          loopAnim(entity, 'idle');
        }
      }
      else {
        loopAnim(entity, 'jump');
      }
    }
    // If they don't, spawn them
    else {
      const playerModel = SkeletonUtils.clone(rootPlayerModel);

      scene.add(playerModel);

      const playerAnimMixer = new THREE.AnimationMixer(playerModel);

      let playerActions: Map<string, AnimationAction> = new Map();

      animationClips.forEach((animClip, animKey) => {
        const action = playerAnimMixer.clipAction(animClip);
        playerActions.set(animKey, action);
      });

      const entity: PlayerEntity = {
        model: playerModel,
        animMixer: playerAnimMixer,
        animActions: playerActions,
        currentAnimAction: playerActions.get('idle') || undefined
      };

      playerEntities.set(player.id, entity);

      // If this player is belongs to the connected client, save a reference to it
      if (player.id === currentUserId) {
        currentPlayerModel = playerModel;
      }
    }
  });
}

// https://www.youtube.com/watch?v=UuNPHOJ_V5o
function thirdPersonCamera(delta: number) {
  // If we don't yet have a current player model set, return out
  if (!currentPlayerModel) {
    return;
  }

  const idealOffset = new THREE.Vector3(0, 2, -2);
  const idealLookat = new THREE.Vector3(0, 0, 2);

  idealOffset.applyQuaternion(currentPlayerModel.quaternion);
  idealOffset.add(currentPlayerModel.position);
  idealLookat.applyQuaternion(currentPlayerModel.quaternion);
  idealLookat.add(currentPlayerModel.position);

  const t = 1 - Math.pow(0.001, delta);

  camera.position.lerp(idealOffset, t);
  camera.lookAt(currentPlayerModel.position.lerp(idealLookat, t));
}

const keys: Set<string> = new Set();

function bindKeyboardEvents() {
  function keyboardDown(e: KeyboardEvent) {
    keys.add(e.key.toLowerCase());
  }

  function keyboardUp(e: KeyboardEvent) {
    keys.delete(e.key.toLowerCase());
  }

  window.addEventListener('keydown', keyboardDown);
  window.addEventListener('keyup', keyboardUp);
}

let prevDirection: Direction = {
  x: 0,
  y: 0,
  z: 0
};

function sendKeyboardInput() {
  let direction: Direction = {
    x: 0,
    y: 0,
    z: 0
  };

  if (keys.has('w')) {
    direction.z = 1;
  }
  else if (keys.has('s')) {
    direction.z = -1;
  }

  if (keys.has('a')) {
    direction.x = 1;
  }
  else if (keys.has('d')) {
    direction.x = -1;
  }

  if (keys.has(' ')) {
    connection.sendMessage({ type: ClientMessageType.Jump });
  }

  if (direction.x !== prevDirection.x || direction.y !== prevDirection.y || direction.z !== prevDirection.z) {
    prevDirection = direction;
    connection.sendMessage({ type: ClientMessageType.SetDirection, direction });
  }
}

let lastTime: number = Date.now();
let timeElapsed: number = 0;

function updateGame() {
  let deltaTime = 0;
  const currentTime = Date.now();
  deltaTime = ((currentTime - lastTime) / 1000);
  lastTime = currentTime;
  timeElapsed += deltaTime;

  // Send keyboard input to the server
  sendKeyboardInput();

  // Handle spawning and repositioning
  syncModels();

  // Camera following
  thirdPersonCamera(timeElapsed);

  // Handle model animation
  animate();

  // Rinse and repeat!
  requestAnimationFrame(updateGame);
}

function init() {
  // Bind keyboard event listeners
  bindKeyboardEvents();

  // Kick of update loop
  updateGame();
}

// The getToken function first checks sessionStorage to see if there is an existing token, and if there is returns it. If not, it logs the user into a new session and updates the sessionStorage key.
async function getToken(): Promise<string> {
  const maybeToken = sessionStorage.getItem("3d-platformer-token");
  if (maybeToken !== null) {
    return maybeToken;
  }

  const token = await client.loginAnonymous();
  sessionStorage.setItem("3d-platformer-token", token);
  return token;
}

// getRoomId will first check if the location's pathname contains the roomId, and will return it if it does, otherwise it will request one from the HathoraClient instance we defined earlier.
async function getRoomId(token: string): Promise<string> {
  if (location.pathname.length > 1) {
    return location.pathname.split("/").pop()!;
  }
  
  const roomId = await client.create(token, new Uint8Array());
  history.pushState({}, "", `/${roomId}`);
  return roomId;
}

function lerp(from: GameState, to: GameState, pctElapsed: number): GameState {
  return {
    players: to.players.map((toPlayer) => {
      const fromPlayer = from.players.find((p) => p.id === toPlayer.id);
      return fromPlayer !== undefined ? lerpPlayer(fromPlayer, toPlayer, pctElapsed) : toPlayer;
    })
  };
}

function lerpPlayer(from: Player, to: Player, pctElapsed: number): Player {
  return {
    id: to.id,
    position: {
      x: from.position.x + (to.position.x - from.position.x) * pctElapsed,
      y: from.position.y + (to.position.y - from.position.y) * pctElapsed,
      z: from.position.z + (to.position.z - from.position.z) * pctElapsed,
    },
    rotation: from.rotation + (to.rotation - from.rotation) * pctElapsed,
    isMoving: to.isMoving,
    grounded: to.grounded
  };
}