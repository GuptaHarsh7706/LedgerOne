import confetti from "canvas-confetti";

export function triggerApprovalConfetti() {
  const count = 120;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ["#6366f1", "#10b981", "#ffffff"],
  });
  fire(0.2, {
    spread: 60,
    colors: ["#4f46e5", "#38bdf8", "#10b981"],
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ["#6366f1", "#10b981", "#f59e0b"],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    colors: ["#10b981", "#6366f1"],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    colors: ["#ffffff", "#6366f1"],
  });
}

export default triggerApprovalConfetti;
