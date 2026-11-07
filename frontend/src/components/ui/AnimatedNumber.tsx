"use client";

import React, { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({
  value,
  format,
  className = "",
}: AnimatedNumberProps) {
  const spring = useSpring(0, { mass: 0.8, stiffness: 65, damping: 14 });
  const display = useTransform(spring, (current) => {
    if (format) return format(current);
    return Math.round(current).toLocaleString();
  });

  const [currentDisplay, setCurrentDisplay] = useState(
    format ? format(0) : "0"
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return display.on("change", (latest) => {
      setCurrentDisplay(latest);
    });
  }, [display]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {currentDisplay}
    </span>
  );
}

export default AnimatedNumber;
