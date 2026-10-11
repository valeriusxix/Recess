import * as React from "react";
import "./sonar-grid.css";

const cn = (...classes) => classes.filter(Boolean).join(" ");

const MAX_DPR = 2;
const MAX_BITMAP = 4096;
const TAU = Math.PI * 2;
const DEFAULT_PING_AREA = [0.15, 0.2, 0.85, 0.8];

const SonarGrid = React.forwardRef(function SonarGrid(
  {
    spacing = 26,
    dotRadius = 1.4,
    baseOpacity = 0.28,
    color,
    pingEvery = 2.4,
    speed = 260,
    ringWidth = 90,
    amplitude = 2.2,
    interactive = true,
    maxRings = 6,
    seedPing = true,
    pingArea = DEFAULT_PING_AREA,
    className,
    children,
    ...rest
  },
  ref,
) {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const ringsRef = React.useRef([]);
  const refreshRef = React.useRef(() => {});

  const opts = React.useRef({
    spacing,
    dotRadius,
    baseOpacity,
    pingEvery,
    speed,
    ringWidth,
    amplitude,
    interactive,
    maxRings,
    seedPing,
    pingArea,
  });

  opts.current = {
    spacing,
    dotRadius,
    baseOpacity,
    pingEvery,
    speed,
    ringWidth,
    amplitude,
    interactive,
    maxRings,
    seedPing,
    pingArea,
  };

  const setHost = React.useCallback(
    (node) => {
      hostRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let raf = 0;
    let timer = 0;
    let visible = true;
    let seeded = false;
    let stroke = "";
    let nextPing = performance.now() + opts.current.pingEvery * 1000;
    let bitmapW = 0;
    let bitmapH = 0;
    let dpr = 1;
    let staticCanvas = null;
    let staticKey = "";

    const readColor = () => {
      stroke = getComputedStyle(canvas).color;
    };

    const gridMetrics = (o) => {
      const safeSpacing = Math.max(4, o.spacing);
      const cols = Math.ceil(width / safeSpacing) + 1;
      const rows = Math.ceil(height / safeSpacing) + 1;
      return {
        safeSpacing,
        cols,
        rows,
        offsetX: (width - (cols - 1) * safeSpacing) / 2,
        offsetY: (height - (rows - 1) * safeSpacing) / 2,
      };
    };

    const ensureStatic = () => {
      const o = opts.current;
      const key = [bitmapW, bitmapH, o.spacing, o.dotRadius, o.baseOpacity, stroke].join("|");
      if (staticKey === key && staticCanvas) return;
      staticKey = key;
      if (!staticCanvas) staticCanvas = document.createElement("canvas");
      staticCanvas.width = bitmapW;
      staticCanvas.height = bitmapH;
      const staticCtx = staticCanvas.getContext("2d");
      if (!staticCtx) return;
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticCtx.clearRect(0, 0, width, height);
      staticCtx.fillStyle = stroke;
      staticCtx.globalAlpha = o.baseOpacity;
      staticCtx.beginPath();
      const { safeSpacing, cols, rows, offsetX, offsetY } = gridMetrics(o);
      const radius = Math.max(0.5, o.dotRadius);
      for (let i = 0; i < cols; i += 1) {
        const cx = offsetX + i * safeSpacing;
        for (let j = 0; j < rows; j += 1) {
          const cy = offsetY + j * safeSpacing;
          staticCtx.moveTo(cx + radius, cy);
          staticCtx.arc(cx, cy, radius, 0, TAU);
        }
      }
      staticCtx.fill();
    };

    const addRing = (x, y, born) => {
      readColor();
      const rings = ringsRef.current;
      rings.push({ x, y, born });
      while (rings.length > opts.current.maxRings) {
        rings.shift();
      }
    };

    const draw = (now) => {
      const o = opts.current;
      const lifetime = (Math.hypot(width, height) + o.ringWidth) / o.speed;
      ringsRef.current = ringsRef.current.filter((ring) => (now - ring.born) / 1000 < lifetime);

      const live = ringsRef.current.map((ring) => {
        const age = (now - ring.born) / 1000;
        const radius = age * o.speed;
        return {
          x: ring.x,
          y: ring.y,
          radius,
          reach: radius + o.ringWidth,
          fade: 1 - age / lifetime,
        };
      });

      ensureStatic();
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, width, height);
      if (live.length === 0) return;

      const { safeSpacing, cols, rows, offsetX, offsetY } = gridMetrics(o);
      ctx.fillStyle = stroke;
      for (let i = 0; i < cols; i += 1) {
        const cx = offsetX + i * safeSpacing;
        for (let j = 0; j < rows; j += 1) {
          const cy = offsetY + j * safeSpacing;
          let energy = 0;

          for (const ring of live) {
            if (Math.abs(cx - ring.x) > ring.reach || Math.abs(cy - ring.y) > ring.reach) continue;
            const dist = Math.abs(Math.hypot(cx - ring.x, cy - ring.y) - ring.radius);
            if (dist >= o.ringWidth) continue;
            const t = 1 - dist / o.ringWidth;
            const k = t * t * (3 - 2 * t) * ring.fade;
            if (k > energy) energy = k;
          }

          if (energy < 0.01) continue;
          const hotRadius = o.dotRadius * (1 + o.amplitude * energy);
          if (!(hotRadius > 0)) continue;
          ctx.globalAlpha = o.baseOpacity + (1 - o.baseOpacity) * energy;
          ctx.beginPath();
          ctx.arc(cx, cy, hotRadius, 0, TAU);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextW = Math.max(1, Math.round(rect.width));
      const nextH = Math.max(1, Math.round(rect.height));
      if (!Number.isFinite(nextW) || !Number.isFinite(nextH)) return;
      const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextBitmapW = Math.min(MAX_BITMAP, Math.round(nextW * nextDpr));
      const nextBitmapH = Math.min(MAX_BITMAP, Math.round(nextH * nextDpr));
      const sizeChanged = nextBitmapW !== bitmapW || nextBitmapH !== bitmapH;
      width = nextW;
      height = nextH;
      dpr = nextBitmapW / nextW;
      if (!sizeChanged) return;
      bitmapW = nextBitmapW;
      bitmapH = nextBitmapH;
      staticKey = "";
      canvas.width = bitmapW;
      canvas.height = bitmapH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!seeded) {
        seeded = true;
        const [x0, y0, x1, y1] = opts.current.pingArea;
        if (opts.current.seedPing && !reduceMotion.matches) {
          addRing(width * (x0 + (x1 - x0) * 0.68), height * (y0 + (y1 - y0) * 0.34), performance.now() - 500);
        }
      }

      draw(performance.now());
    };

    const scheduleIdle = (delay) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => tick(performance.now()), Math.max(16, delay));
    };

    const tick = (now) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (reduceMotion.matches) {
        ringsRef.current = [];
        draw(now);
        return;
      }

      const o = opts.current;
      if (o.pingEvery > 0 && now >= nextPing) {
        const [x0, y0, x1, y1] = o.pingArea;
        addRing(width * (x0 + Math.random() * (x1 - x0)), height * (y0 + Math.random() * (y1 - y0)), now);
        nextPing = now + o.pingEvery * 1000;
      }

      draw(now);
      if (ringsRef.current.length > 0) {
        raf = requestAnimationFrame(tick);
      } else if (o.pingEvery > 0) {
        scheduleIdle(nextPing - now);
      }
    };

    const wake = () => {
      if (!raf) {
        window.clearTimeout(timer);
        raf = requestAnimationFrame(tick);
      }
    };

    refreshRef.current = () => {
      readColor();
      nextPing = Math.min(nextPing, performance.now() + opts.current.pingEvery * 1000);
      wake();
    };

    const onDown = (event) => {
      if (!opts.current.interactive || reduceMotion.matches) return;
      const rect = host.getBoundingClientRect();
      addRing(event.clientX - rect.left, event.clientY - rect.top, performance.now());
      wake();
    };

    const onVisibility = () => {
      if (!document.hidden) wake();
    };

    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) wake();
      },
      { threshold: 0 },
    );
    const mo = new MutationObserver(() => refreshRef.current());

    readColor();
    resize();
    ro.observe(host);
    io.observe(host);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    host.addEventListener("pointerdown", onDown);
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotion.addEventListener("change", wake);
    wake();

    return () => {
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      host.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener("change", wake);
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      refreshRef.current = () => {};
    };
  }, []);

  React.useEffect(() => {
    refreshRef.current();
  }, [spacing, dotRadius, baseOpacity, color, pingEvery, speed, ringWidth, amplitude, interactive, maxRings, pingArea]);

  return (
    <div
      ref={setHost}
      data-slot="sonar-grid"
      className={cn("sonar-grid", interactive && "sonar-grid-interactive", className)}
      {...rest}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="sonar-grid-canvas"
        style={color ? { color } : undefined}
      />
      {children}
    </div>
  );
});

export { SonarGrid };
export default SonarGrid;
