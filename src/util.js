import os from "os";
import { spawn } from "child_process";

export const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
};

export const copyToClipboard = (text) => {
  return new Promise((resolve, reject) => {
    const proc = spawn("pbcopy");
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pbcopy exited with code ${code}`));
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
};
