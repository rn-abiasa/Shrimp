# Joining the ShrimpChain Network

## Bootstrap Problem

When joining a P2P network, new nodes need to know at least one active node to connect to. If the primary seed node is offline, new nodes cannot discover the network.

## Solutions

### Option 1: Multiple Bootstrap Nodes (Recommended) ⭐

Configure your node with **multiple seed addresses** separated by commas:

```bash
# Connect to multiple bootstrap nodes
PEERS=ws://localhost:5001,ws://localhost:5002,ws://localhost:5003 npm run dev

# Production example
PEERS=ws://seed1.shrimpchain.io:5001,ws://seed2.shrimpchain.io:5001,ws://seed3.shrimpchain.io:5001 npm run dev
```

**How it works:**

- Your node will try to connect to all peers in the list
- If one seed is down, others will work
- Once connected, you'll receive the full peer list via peer gossiping
- Your node will auto-connect to discovered peers

### Option 2: Connect to Any Active Node

If you know any active node address, you can connect to it:

```bash
# Connect to a community node
PEERS=ws://community-node.example.com:5001 npm run dev
```

### Option 3: Fallback Bootstrap Peers

The code includes fallback bootstrap peers that are used when no peers are configured. Update `src/config.js`:

```javascript
export const FALLBACK_BOOTSTRAP_PEERS = [
  "ws://seed1.shrimpchain.io:5001",
  "ws://seed2.shrimpchain.io:5001",
  "ws://seed3.shrimpchain.io:5001",
];
```

Then simply run:

```bash
npm run dev
```

The node will automatically use fallback peers if no `PEERS` env variable is set.

### Option 4: Ask the Community

Join the ShrimpChain community channels:

- Discord: [link]
- Telegram: [link]
- GitHub Discussions: [link]

Ask for active node addresses and connect using Option 1 or 2.

## Network Resilience

### Peer Gossiping

Once connected to any node, your node will:

1. Receive a list of all known peers
2. Automatically connect to discovered peers
3. Share your peer list with others
4. Persist peer list to `peers.json`

**Result:** Even if the seed node goes offline, the network continues operating!

### Seed Node Restart

When a seed node restarts:

1. It loads peers from `peers.json`
2. Connects to known peers
3. Receives the latest chain from peers
4. Syncs to the longest valid chain

**Result:** Seed nodes automatically recover and sync!

## Testing Locally

### Start a 3-Node Network

```bash
# Terminal 1 - Seed Node
npm run dev

# Terminal 2 - Node2
P2P_PORT=5002 HTTP_PORT=3002 PEERS=ws://localhost:5001 npm run dev

# Terminal 3 - Node3
P2P_PORT=5003 HTTP_PORT=3003 PEERS=ws://localhost:5001 npm run dev
```

### Test Seed Failure

```bash
# Kill seed node (Ctrl+C in Terminal 1)

# Create transaction on Node2
curl -X POST http://localhost:3002/transact \
  -H "Content-Type: application/json" \
  -d '{"recipient":"test","amount":100,"fee":1}'

# Verify Node3 receives it (check logs)
```

### Test New Node Joining (Seed Dead)

```bash
# Start Node4 with multiple bootstrap addresses
P2P_PORT=5004 HTTP_PORT=3004 PEERS=ws://localhost:5001,ws://localhost:5002,ws://localhost:5003 npm run dev

# Node4 will connect to Node2 and Node3 (seed is dead)
# Node4 will receive full chain and peer list
```

## Production Deployment

### 1. Setup Multiple Seed Nodes

Deploy 3-5 seed nodes on different servers/regions:

- `seed1.shrimpchain.io` (US East)
- `seed2.shrimpchain.io` (EU West)
- `seed3.shrimpchain.io` (Asia Pacific)

### 2. Update Fallback Peers

Edit `src/config.js`:

```javascript
export const FALLBACK_BOOTSTRAP_PEERS = [
  "ws://seed1.shrimpchain.io:5001",
  "ws://seed2.shrimpchain.io:5001",
  "ws://seed3.shrimpchain.io:5001",
];
```

### 3. Document Bootstrap Addresses

In your README or website, provide:

```markdown
## Joining the Network

Connect to ShrimpChain using:

PEERS=ws://seed1.shrimpchain.io:5001,ws://seed2.shrimpchain.io:5001,ws://seed3.shrimpchain.io:5001 npm run dev
```

### 4. Community Nodes

Encourage community members to:

1. Run public nodes
2. Share their node addresses
3. Add their nodes to a community list

## Troubleshooting

### "No peers configured and no fallback peers available"

**Solution:** Provide at least one peer address:

```bash
PEERS=ws://any-active-node:5001 npm run dev
```

### "Connection failed to peer"

**Possible causes:**

- Peer is offline
- Firewall blocking connection
- Wrong address/port

**Solution:** Try multiple peers:

```bash
PEERS=ws://peer1:5001,ws://peer2:5001,ws://peer3:5001 npm run dev
```

### "No peers connected"

**Check:**

1. Are you behind a firewall?
2. Is P2P port (5001) accessible?
3. Are bootstrap nodes online?

**Solution:**

- Open P2P port in firewall
- Use multiple bootstrap addresses
- Ask community for active nodes

## Advanced: DNS Seeds (Future)

For large-scale networks, consider DNS-based peer discovery:

```javascript
// Resolve DNS to get list of seed IPs
const seeds = await dns.resolve4("seed.shrimpchain.io");
// Returns: ['1.2.3.4', '5.6.7.8', '9.10.11.12']
```

This allows updating seed nodes without code changes.

## Summary

**Best Practice for New Nodes:**

```bash
# Use multiple bootstrap addresses
PEERS=ws://seed1:5001,ws://seed2:5001,ws://seed3:5001 npm run dev
```

**Best Practice for Production:**

1. Deploy 3-5 seed nodes
2. Update `FALLBACK_BOOTSTRAP_PEERS` in code
3. Document bootstrap addresses
4. Encourage community nodes

**Network Resilience:**

- ✅ Peer gossiping ensures network discovery
- ✅ Nodes stay connected even if seed dies
- ✅ New nodes can join via any active node
- ✅ Automatic chain sync on restart
