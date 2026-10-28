"use client";

import { useState } from "react";
import { McpDemoContent } from "./mcp-demo-content";

export default function McpDemoInteractive() {
  const [selected, setSelected] = useState(0);
  return <McpDemoContent selected={selected} onSelect={setSelected} />;
}
