import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default withBotId(nextConfig);
