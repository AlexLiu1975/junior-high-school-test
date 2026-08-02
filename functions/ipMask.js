import { isIP } from "node:net";

const UNKNOWN_IP = "無法判定";

function firstForwardedIp(rawIp) {
  if (typeof rawIp !== "string") return null;
  const first = rawIp.split(",", 1)[0].trim();
  return first || null;
}

export function maskIp(rawIp) {
  const ip = firstForwardedIp(rawIp);
  if (!ip) return UNKNOWN_IP;

  if (isIP(ip) === 4) return `${ip.split(".").slice(0, 3).join(".")}.xxx`;
  if (isIP(ip) === 6) {
    const mappedIpv4 = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) {
      return `${mappedIpv4[1]}${mappedIpv4[2].split(".").slice(0, 3).join(".")}.xxx`;
    }
    const prefix = ip.split(":").filter(Boolean).slice(0, 3).join(":");
    return prefix ? `${prefix}:…` : UNKNOWN_IP;
  }

  return UNKNOWN_IP;
}
