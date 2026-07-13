"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

type Props = React.ComponentProps<typeof ResponsiveContainer>;

export function DeferredResponsiveContainer({ children, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize((current) =>
          current?.width === rect.width && current.height === rect.height
            ? current
            : { width: rect.width, height: rect.height },
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="responsive-chart">
      {size && (
        <ResponsiveContainer {...rest} width={size.width} height={size.height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}
