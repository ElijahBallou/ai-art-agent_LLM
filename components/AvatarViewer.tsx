"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useAnimations, useFBX } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type MouthCue = {
  start: number;
  end: number;
  value: string;
};

type LipSyncData = {
  metadata?: {
    soundFile?: string;
    duration?: number;
  };
  mouthCues: MouthCue[];
};

type AvatarViewerProps = {
  active: boolean;
  command: "idle" | "activate" | "goodbye";
  audioUrl?: string | null;
  lipSync?: LipSyncData | null;
  onExitComplete?: () => void;
};

type CameraDirectorProps = {
  shouldZoom: boolean;
};

function CameraDirector({ shouldZoom }: CameraDirectorProps) {
  const { camera } = useThree();

  const widePosition = useMemo(() => new THREE.Vector3(0.4, 1.55, 8.2), []);
  const closePosition = useMemo(() => new THREE.Vector3(1.15, 1.9, 4.9), []);

  const wideLookAt = useMemo(() => new THREE.Vector3(0.35, 1.35, 0), []);
  const closeLookAt = useMemo(() => new THREE.Vector3(0.45, 1.95, 0), []);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const targetPosition = shouldZoom ? closePosition : widePosition;
    const targetLookAt = shouldZoom ? closeLookAt : wideLookAt;
    const targetFov = shouldZoom ? 21 : 24;

    camera.position.lerp(targetPosition, delta * 2.2);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, delta * 2.2);
    camera.lookAt(targetLookAt);
    camera.updateProjectionMatrix();
  });

  return null;
}

function AvatarModel({
  active,
  command,
  audioUrl,
  lipSync,
  onReadyForCloseUp,
  onGoodbyeStart,
  onExitComplete,
}: {
  active: boolean;
  command: "idle" | "activate" | "goodbye";
  audioUrl?: string | null;
  lipSync?: LipSyncData | null;
  onReadyForCloseUp: () => void;
  onGoodbyeStart: () => void;
  onExitComplete: () => void;
}) {
  const avatar = useFBX("/models/MyAvatar.fbx");
  const walking = useFBX("/animations/Walking01.fbx");
  const idle = useFBX("/animations/Idle.fbx");
  const talking = useFBX("/animations/Talking.fbx");
  const waving = useFBX("/animations/Waving.fbx");

  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef<
    "enter" | "turn" | "waveIn" | "idle" | "talking" | "goodbyeWave" | "exitTurn" | "exit"
  >("enter");

  const idleStartedRef = useRef(false);
  const introWaveCompletedRef = useRef(false);
  const exitCompletedRef = useRef(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actionsRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentMouth, setCurrentMouth] = useState("X");
  const [audioReady, setAudioReady] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [activationNonce, setActivationNonce] = useState(0);
  const [goodbyeNonce, setGoodbyeNonce] = useState(0);

  const lastHandledActivationRef = useRef(0);
  const lastHandledGoodbyeRef = useRef(0);

  useEffect(() => {
    avatar.traverse((child: any) => {
      if (!child.isMesh || !child.material) return;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material: any) => {
        if ("metalness" in material) material.metalness = 0.05;
        if ("roughness" in material) material.roughness = 0.92;
        if ("envMapIntensity" in material) material.envMapIntensity = 0.3;
        material.needsUpdate = true;
      });
    });
  }, [avatar]);

  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audio.preload = "auto";

    const handleCanPlay = () => {
      setAudioReady(true);
    };

    const handleError = (event: Event) => {
      console.error("Audio failed to load", event);
    };

    const handleEnded = () => {
      setCurrentMouth("X");
      applyMouthShape("X");

      if (phaseRef.current === "talking") {
        actionsRef.current?.Talking?.fadeOut(0.25);
        actionsRef.current?.Idle?.reset();
        actionsRef.current?.Idle?.fadeIn(0.25);
        actionsRef.current?.Idle?.play();
        phaseRef.current = "idle";
      }
    };

    setAudioReady(false);

    audio.addEventListener("canplaythrough", handleCanPlay);
    audio.addEventListener("error", handleError);
    audio.addEventListener("ended", handleEnded);

    audioRef.current = audio;
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener("canplaythrough", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    const unlockAudio = async () => {
      if (!audioRef.current || audioUnlocked) return;

      try {
        audioRef.current.muted = true;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.muted = false;
        setAudioUnlocked(true);
      } catch (error) {
        console.error("Audio unlock failed", error);
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, [audioUnlocked]);

  const clips = useMemo(() => {
    const nextClips: THREE.AnimationClip[] = [];

    if (walking.animations[0]) {
      const walkClip = walking.animations[0].clone();
      walkClip.name = "Walk";
      nextClips.push(walkClip);
    }

    if (idle.animations[0]) {
      const idleClip = idle.animations[0].clone();
      idleClip.name = "Idle";
      nextClips.push(idleClip);
    }

    if (talking.animations[0]) {
      const talkingClip = talking.animations[0].clone();
      talkingClip.name = "Talking";
      nextClips.push(talkingClip);
    }

    if (waving.animations[0]) {
      const wavingClip = waving.animations[0].clone();
      wavingClip.name = "Waving";
      nextClips.push(wavingClip);
    }

    return nextClips;
  }, [walking, idle, talking, waving]);

  const { actions } = useAnimations(clips, avatar);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  function clearPendingTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function getWaveDuration() {
    const waveAction = actionsRef.current?.Waving;
    if (!waveAction?.getClip) return 1200;
    return Math.max(900, waveAction.getClip().duration * 1000);
  }

  function playWaveThen(nextPhase: "idle" | "exitTurn", afterWave?: () => void) {
    clearPendingTimeout();

    actionsRef.current?.Walk?.fadeOut(0.2);
    actionsRef.current?.Idle?.fadeOut(0.2);
    actionsRef.current?.Talking?.fadeOut(0.2);

    const waveAction = actionsRef.current?.Waving;
    if (waveAction) {
      waveAction.reset();
      waveAction.setLoop(THREE.LoopOnce, 1);
      waveAction.clampWhenFinished = true;
      waveAction.fadeIn(0.2);
      waveAction.play();
    }

    timeoutRef.current = setTimeout(() => {
      phaseRef.current = nextPhase;
      afterWave?.();

      if (nextPhase === "idle") {
        actionsRef.current?.Idle?.reset();
        actionsRef.current?.Idle?.fadeIn(0.25);
        actionsRef.current?.Idle?.play();
      }
    }, getWaveDuration());
  }

  function getActiveMouthShape(time: number, cues: MouthCue[]) {
    const cue = cues.find((item) => time >= item.start && time <= item.end);
    return cue ? cue.value : "X";
  }

  function applyMouthShape(shape: string) {
    const mouthMap: Record<string, string[]> = {
      A: ["viseme_A", "A", "Mouth_A"],
      B: ["viseme_B", "B", "Mouth_B"],
      C: ["viseme_C", "C", "Mouth_C"],
      D: ["viseme_D", "D", "Mouth_D"],
      E: ["viseme_E", "E", "Mouth_E"],
      F: ["viseme_F", "F", "Mouth_F"],
      G: ["viseme_G", "G", "Mouth_G"],
      H: ["viseme_H", "H", "Mouth_H"],
      X: ["viseme_X", "X", "Mouth_X", "viseme_idle", "Idle"],
    };

    avatar.traverse((child: any) => {
      if (!child.isMesh) return;
      if (!child.morphTargetDictionary || !child.morphTargetInfluences) return;

      const dict = child.morphTargetDictionary;
      const influences = child.morphTargetInfluences;

      Object.keys(dict).forEach((key) => {
        influences[dict[key]] = 0;
      });

      const candidateNames = mouthMap[shape] || mouthMap.X;

      candidateNames.forEach((name) => {
        if (dict[name] !== undefined) {
          influences[dict[name]] = 1;
        }
      });
    });
  }

  async function playDynamicAudio() {
    if (!audioRef.current || !audioReady) return;

    try {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch (error) {
      console.error("Audio playback failed", error);
    }
  }

  useEffect(() => {
    if (!groupRef.current || !actions) return;

    const group = groupRef.current;

    clearPendingTimeout();
    exitCompletedRef.current = false;
    introWaveCompletedRef.current = false;
    idleStartedRef.current = false;
    lastHandledActivationRef.current = 0;
    lastHandledGoodbyeRef.current = 0;

    group.position.set(-5, -0.2, 0);
    group.rotation.y = Math.PI / 2;

    phaseRef.current = "enter";

    actions.Walk?.reset();
    actions.Walk?.setLoop(THREE.LoopRepeat, Infinity);
    actions.Walk?.fadeIn(0.35);
    actions.Walk?.play();

    actions.Idle?.reset();
    actions.Idle?.setLoop(THREE.LoopRepeat, Infinity);

    actions.Talking?.reset();
    actions.Talking?.setLoop(THREE.LoopRepeat, Infinity);

    actions.Waving?.reset();
    actions.Waving?.setLoop(THREE.LoopOnce, 1);
    if (actions.Waving) {
      actions.Waving.clampWhenFinished = true;
    }

    return () => {
      clearPendingTimeout();
      actions.Walk?.stop();
      actions.Idle?.stop();
      actions.Talking?.stop();
      actions.Waving?.stop();
    };
  }, [actions, active]);

  useEffect(() => {
    if (command === "activate") {
      setActivationNonce((prev) => prev + 1);
    }
  }, [command, audioUrl]);

  useEffect(() => {
    if (command === "goodbye") {
      setGoodbyeNonce((prev) => prev + 1);
    }
  }, [command]);

  useFrame((_, delta) => {
    if (!groupRef.current || !actions || !active) return;

    const group = groupRef.current;
    const stopX = 0.35;
    const turnStartX = 0.2;
    const forwardRotationY = 0;
    const exitRotationY = -Math.PI / 2;

    if (phaseRef.current === "enter") {
      group.position.x += delta * 1.2;

      if (group.position.x >= turnStartX) {
        phaseRef.current = "turn";
      }
    }

    if (phaseRef.current === "turn") {
      if (group.position.x < stopX) {
        group.position.x += delta * 1.2;
      }

      group.rotation.y = THREE.MathUtils.lerp(
        group.rotation.y,
        forwardRotationY,
        delta * 1.45
      );

      const closeEnoughX = Math.abs(group.position.x - stopX) < 0.05;
      const closeEnoughRot =
        Math.abs(group.rotation.y - forwardRotationY) < 0.04;

      if (closeEnoughX && closeEnoughRot) {
        group.position.x = stopX;
        group.rotation.y = forwardRotationY;
        phaseRef.current = "waveIn";

        if (!introWaveCompletedRef.current) {
          introWaveCompletedRef.current = true;
          playWaveThen("idle", () => {
            onReadyForCloseUp();
          });
        }
      }
    }

    if (phaseRef.current === "idle" && !idleStartedRef.current) {
      idleStartedRef.current = true;
      actions.Walk?.fadeOut(0.45);
      actions.Idle?.reset();
      actions.Idle?.fadeIn(0.45);
      actions.Idle?.play();
    }

    if (
      phaseRef.current === "idle" &&
      command === "activate" &&
      activationNonce > 0 &&
      activationNonce !== lastHandledActivationRef.current &&
      audioUrl &&
      lipSync?.mouthCues?.length
    ) {
      lastHandledActivationRef.current = activationNonce;
      phaseRef.current = "talking";

      actions.Idle?.fadeOut(0.25);
      actions.Talking?.reset();
      actions.Talking?.fadeIn(0.25);
      actions.Talking?.play();

      playDynamicAudio();
    }

    if (
      (phaseRef.current === "idle" || phaseRef.current === "talking") &&
      command === "goodbye" &&
      goodbyeNonce > 0 &&
      goodbyeNonce !== lastHandledGoodbyeRef.current
    ) {
      lastHandledGoodbyeRef.current = goodbyeNonce;

      audioRef.current?.pause();
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }

      setCurrentMouth("X");
      applyMouthShape("X");

      onGoodbyeStart();
      phaseRef.current = "goodbyeWave";

      playWaveThen("exitTurn");
    }

    if (phaseRef.current === "exitTurn") {
      group.rotation.y = THREE.MathUtils.lerp(
        group.rotation.y,
        exitRotationY,
        delta * 1.7
      );

      const closeEnoughRot = Math.abs(group.rotation.y - exitRotationY) < 0.05;

      if (closeEnoughRot) {
        group.rotation.y = exitRotationY;
        phaseRef.current = "exit";

        actions.Idle?.fadeOut(0.2);
        actions.Waving?.fadeOut(0.2);
        actions.Walk?.reset();
        actions.Walk?.fadeIn(0.2);
        actions.Walk?.play();
      }
    }

    if (phaseRef.current === "exit") {
      group.position.x -= delta * 1.3;

      if (group.position.x <= -5.2 && !exitCompletedRef.current) {
        exitCompletedRef.current = true;
        onExitComplete();
      }
    }

    if (audioRef.current && lipSync?.mouthCues?.length) {
      const time = audioRef.current.currentTime;
      const mouth = getActiveMouthShape(time, lipSync.mouthCues);

      if (mouth !== currentMouth) {
        setCurrentMouth(mouth);
        applyMouthShape(mouth);
      }
    }
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      <primitive object={avatar} scale={0.015} />
    </group>
  );
}

export default function AvatarViewer({
  active,
  command,
  audioUrl,
  lipSync,
  onExitComplete,
}: AvatarViewerProps) {
  const [zoomedIn, setZoomedIn] = useState(false);

  useEffect(() => {
    if (!active) {
      setZoomedIn(false);
    }
  }, [active]);

  return (
    <div className="avatarStage">
      <Canvas
        camera={{ position: [0.4, 1.55, 8.2], fov: 24 }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.78,
        }}
      >
        <ambientLight intensity={0.22} />
        <directionalLight position={[3, 5, 3]} intensity={0.75} />
        <directionalLight position={[-2, 3, 2]} intensity={0.18} />

        <Suspense fallback={null}>
          <CameraDirector shouldZoom={zoomedIn} />
          <AvatarModel
            active={active}
            command={command}
            audioUrl={audioUrl}
            lipSync={lipSync}
            onReadyForCloseUp={() => {
              setZoomedIn(true);
            }}
            onGoodbyeStart={() => {
              setZoomedIn(false);
            }}
            onExitComplete={() => {
              setZoomedIn(false);
              onExitComplete?.();
            }}
          />
          <Environment preset="studio" />
        </Suspense>
      </Canvas>
    </div>
  );
}