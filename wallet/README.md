# ShrimpChain Web Wallet

A modern, lightweight web wallet for ShrimpChain that runs entirely in your browser. No blockchain download required!

## Features

✨ **Light Client** - No need to download the full blockchain  
🔐 **Secure** - Private keys never leave your browser  
📱 **Responsive** - Works on desktop and mobile  
🎨 **Modern UI** - Beautiful interface with TailwindCSS  
💾 **Mnemonic Backup** - 12-word phrase for wallet recovery

## How to Use

### 1. Start the ShrimpChain Node

Make sure your ShrimpChain node is running:

```bash
cd /Users/abiasa/Projects/shrimpchain
npm start
```

The node should be running on `http://localhost:3001`

### 2. Open the Wallet

Simply open `index.html` in your browser:

```bash
open wallet/index.html
```

Or drag and drop the file into your browser.

### 3. Create or Import Wallet

**Create New Wallet:**

- Click "Create New Wallet"
- Save your 12-word mnemonic phrase securely
- Check the confirmation box
- Click "Create Wallet"

**Import Existing Wallet:**

- Click "Import Wallet"
- Enter your 12-word mnemonic phrase
- Click "Import Wallet"

### 4. Send Transactions

- Enter recipient address
- Enter amount to send
- Adjust fee if needed (default 1 SHRIMP)
- Click "Send Transaction"

## Security Notes

⚠️ **IMPORTANT:**

- Your mnemonic phrase is the ONLY way to recover your wallet
- Never share your mnemonic with anyone
- Store it in a secure location (not on your computer)
- This wallet stores keys in browser localStorage (for educational purposes)
- For production use, consider hardware wallets

## How It Works

### Light Client Architecture

```
┌─────────────────┐         ┌─────────────────┐
│  Web Wallet     │  HTTP   │   Full Node     │
│  (Browser)      │ ◄─────► │   (API Server)  │
│                 │         │                 │
│ - Generate Keys │         │ - Full Chain    │
│ - Sign TX       │         │ - Validate TX   │
│ - Query Balance │         │ - Mine Blocks   │
└─────────────────┘         └─────────────────┘
```

### Client-Side Operations

- ✅ Mnemonic generation (BIP39)
- ✅ Keypair derivation (secp256k1)
- ✅ Transaction signing (ECDSA)
- ✅ Private key storage (localStorage)

### Server Operations

- ✅ Balance queries
- ✅ Nonce queries
- ✅ Transaction broadcasting
- ✅ Block mining

## Technical Stack

- **HTML5** - Structure
- **TailwindCSS** - Styling
- **Vanilla JavaScript** - Logic
- **elliptic.js** - Cryptographic signing
- **bip39.js** - Mnemonic generation
- **crypto-js** - Hashing

## API Endpoints Used

- `GET /balance?address=...` - Query balance
- `GET /nonce?address=...` - Query account nonce
- `POST /transact` - Submit signed transaction

## Troubleshooting

**"Error connecting to node"**

- Make sure the node is running on port 3001
- Check that CORS is enabled on the API server

**"Transaction failed"**

- Check you have sufficient balance
- Verify the recipient address is correct
- Make sure the fee is not negative

**"Invalid mnemonic phrase"**

- Check for typos in your mnemonic
- Ensure all 12 words are correct
- Words should be separated by spaces

## Development

To modify the wallet:

1. Edit `index.html` for UI changes
2. Edit `wallet.js` for logic changes
3. Refresh browser to see changes

No build step required!

## License

MIT
