import React, { useEffect } from "react";
import { useSpring, useTransform, motion } from "framer-motion";

export interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}) => {
  const spring = useSpring(0, {
    mass: 0.6,
    stiffness: 75,
    damping: 15,
  });

  const display = useTransform(spring, (latest) => {
    return `${prefix}${latest.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={`font-mono tabular-nums ${className}`}>{display}</motion.span>;
};
