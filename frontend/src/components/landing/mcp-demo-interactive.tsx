"use client";

import { useState } from "react";
import { MCP_EXAMPLE_COUNT, McpDemoContent } from "./mcp-demo-content";
import { useDemoAutoplay } from "./use-demo-autoplay";

export default function McpDemoInteractive() {
  const [selected, setSelected] = useState(0);
  // Autoplay steps through each example prompt in turn.
  const { ref, active } = useDemoAutoplay(() => setSelected((i) => (i + 1) % MCP_EXAMPLE_COUNT), { interval: 3800 });
  return <McpDemoContent ref={ref} selected={selected} onSelect={setSelected} announce={!active} />;
}
