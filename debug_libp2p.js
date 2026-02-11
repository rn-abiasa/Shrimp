import { createNode } from "./src/p2p/bundle.js";
import { multiaddr } from "@multiformats/multiaddr";
import { createEd25519PeerId } from "@libp2p/peer-id-factory";

async function test() {
  console.log("🛠 Testing Libp2p Configuration...");

  try {
    // Create Peer Identities
    const id1 = await createEd25519PeerId();
    const id2 = await createEd25519PeerId();

    // Create Node 1 (Port 10001)
    const node1 = await createNode({
      listenAddrs: ["/ip4/127.0.0.1/tcp/10001"],
      peerId: id1,
    });

    // Create Node 2 (Port 10002)
    const node2 = await createNode({
      listenAddrs: ["/ip4/127.0.0.1/tcp/10002"],
      peerId: id2,
    });

    await node1.start();
    await node2.start();

    console.log("✅ Both nodes started.");
    console.log(
      "Node 1 Multiaddrs:",
      node1.getMultiaddrs().map((m) => m.toString()),
    );
    console.log(
      "Node 2 Multiaddrs:",
      node2.getMultiaddrs().map((m) => m.toString()),
    );

    // Try to dial Node 2 from Node 1
    const targetAddr = node2.getMultiaddrs()[0];
    console.log(`\n🔄 Dialing Node 2 (${targetAddr}) from Node 1...`);

    const stream = await node1.dial(targetAddr);
    console.log("✅ DIAL SUCCESS! Connection established.");

    // Clean up
    await node1.stop();
    await node2.stop();
    console.log("Nodes stopped. Configuration seems VALID.");
    process.exit(0);
  } catch (e) {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  }
}

test();
