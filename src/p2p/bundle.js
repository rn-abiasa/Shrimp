import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { gossipsub } from "@libp2p/gossipsub";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";

export async function createNode({ listenAddrs, bootstrapPeers = [] }) {
  const peerDiscovery = [
    mdns({
      interval: 20e3,
    }),
  ];

  if (bootstrapPeers.length > 0) {
    peerDiscovery.push(
      bootstrap({
        list: bootstrapPeers,
      }),
    );
  }

  const node = await createLibp2p({
    addresses: {
      listen: listenAddrs,
    },
    transports: [tcp(), webSockets()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: false,
      }),
    },
    connectionManager: {
      autoDial: true,
    },
  });

  return node;
}
