"use client";

import { useEffect, useRef, useState } from "react";

export function ArtifactStlPreview({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let dispose = () => {};
    void (async () => {
      try {
        // 项目已有 three 运行时；当前项目没有安装其类型声明。
        // @ts-expect-error three has no type declarations in this project
        const THREE = await import("three");
        // @ts-expect-error three examples have no type declarations in this project
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        // @ts-expect-error three examples have no type declarations in this project
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const response = await fetch(src, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 20 * 1024 * 1024) throw new Error("模型超过 20 MiB 预览上限，请下载查看。");
        if (controller.signal.aborted || !container.current) return;
        const node = container.current;
        const geometry = new STLLoader().parse(buffer);
        geometry.computeBoundingBox();
        const size = new THREE.Vector3(); geometry.boundingBox.getSize(size);
        const extent = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(extent) || extent <= 0) { geometry.dispose(); throw new Error(); }
        geometry.center();
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, extent / 1000, extent * 100);
        camera.position.set(extent * 1.5, extent * 1.1, extent * 1.5);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        node.appendChild(renderer.domElement);
        const material = new THREE.MeshStandardMaterial({ color: 0x999fa8, metalness: 0.15, roughness: 0.65 });
        scene.add(new THREE.Mesh(geometry, material));
        scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2));
        const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(1, 2, 3); scene.add(light);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        const resize = () => { const width = node.clientWidth; const height = node.clientHeight; if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); };
        const observer = new ResizeObserver(resize); observer.observe(node); resize();
        let frame = 0;
        const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
        dispose = () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove(); };
        setReady(true);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error && err.message.includes("上限") ? err.message : "模型预览失败，请下载原文件查看。"); }
    })();
    return () => { controller.abort(); dispose(); };
  }, [src]);

  return <div className="result-model-preview">{error && <p role="status">{error}</p>}{!ready && !error && <p className="run-score-note" role="status">正在加载三维模型…</p>}<div ref={container} className="result-model-canvas" aria-label="三维模型预览" />{ready && <p className="run-score-note">拖动旋转，滚轮缩放。</p>}</div>;
}
