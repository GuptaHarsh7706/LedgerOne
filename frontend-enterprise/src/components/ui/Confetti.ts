import confetti from "canvas-confetti";

export function triggerApprovalConfetti() {
  if (typeof window === "undefined") return;

  const count = 180;
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
    colors: ["#6366F1", "#818CF8", "#22C55E"],
  });
  fire(0.2, {
    spread: 60,
    colors: ["#22C55E", "#10B981", "#38BDF8"],
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ["#6366F1", "#F59E0B", "#FFFFFF"],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    colors: ["#22C55E", "#818CF8"],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    colors: ["#6366F1", "#22C55E"],
  });
}
