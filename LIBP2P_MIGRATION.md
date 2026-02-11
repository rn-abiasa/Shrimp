# Laporan Migrasi & Perbaikan P2P (Libp2p)

Dokumen ini merangkum seluruh proses migrasi sistem Peer-to-Peer (P2P) dari implementasi WebSocket manual ke library standar industri **Libp2p**, beserta kendala teknis yang dihadapi dan solusinya.

## 1. Latar Belakang Masalah

Sistem P2P lama menggunakan WebSocket kustom (`ws`) yang memiliki kelemahan:

- **Koneksi Tidak Stabil**: Sering terjadi pemutusan koneksi sepihak.
- **Sinkronisasi Gagal**: Error "Incoming chain must be valid" karena race condition saat broadcast blok.
- **Tidak Ada Discovery Otomatis**: Harus input IP manual setiap kali restart.
- **Identitas Berubah-ubah**: Peer ID berganti setiap restart, membuat daftar teman (peer list) tidak berguna.

## 2. Implementasi Libp2p

Kami memutuskan untuk migrasi ke **Libp2p**, stack networking modular yang digunakan oleh IPFS dan Ethereum 2.0.

### Fitur Baru:

- **Modular Transport**: Mendukung TCP dan WebSocket secara bersamaan.
- **Enkripsi**: Menggunakan protokol **Noise** handshake (aman by default).
- **Multiplexing**: Menggunakan **Yamux** (banyak stream dalam satu koneksi).
- **Auto-Discovery**: Menggunakan **mDNS** untuk menemukan peer di jaringan lokal (LAN) secara otomatis.

## 3. Kendala & Solusi Teknis

Selama proses migrasi, kami menghadapi beberapa error kritis yang disebabkan oleh pergeseran versi library Libp2p (dari v0.x ke v1.x, dan v3.x ke Modern Stack).

### Masalah 1: "Invalid CID version 24" (Identitas Rusak)

**Gejala**: Node gagal start dengan error CID saat mencoba membaca file `peer-id.json`.
**Penyebab**: Format penyimpanan identitas salah. File JSON hanya berisi String ID publik (`Qm...`), padahal Libp2p membutuhkan Object lengkap dengan **Private Key**.
**Solusi**:

- Mengubah logika penyimpanan menggunakan format **Protobuf** (standar binary Libp2p).
- Encoding/decoding menggunakan Base64 agar aman disimpan di file teks.
- **PENTING**: File `peer-id-*.json` kini berisi Private Key dan **WAJIB RAHASIA**.

### Masalah 2: "multiaddrs[0].getComponents is not a function" (Manual Dial)

**Gejala**: Gagal melakukan koneksi manual via GUI.
**Penyebab**: Fungsi `node.dial()` di Libp2p versi terbaru sangat strict. Ia mengharapkan objek `Multiaddr`, bukan string biasa. Input string manual tidak otomatis diparsing.
**Solusi**:

- Menggunakan library `@multiformats/multiaddr` untuk validasi dan parsing input string user menjadi objek Multiaddr sebelum dikirim ke `dial()`.
- Menambahkan sanitasi input (`trim()`) untuk membuang spasi tidak sengaja.

### Masalah 3: "EncryptionFailedError: At least one protocol must be specified"

**Gejala**: Node bisa start, tapi **gagal total** saat mencoba handshake dengan peer lain (putus seketika).
**Penyebab**: **Versi Library Mismatch & Perubahan API**.

- Library inti `libp2p` terinstall versi `3.x` (Legacy).
- Modul enkripsi `@libp2p/noise` terinstall versi `1.x` (Modern).
- Di Libp2p v3, nama properti konfigurasi berubah dari `connectionEncryption` (seperti di dokumentasi lama) menjadi **`connectionEncrypters`**.
- Akibatnya, modul Noise "tidak terdaftar", dan node tidak punya protokol enkripsi sama sekali.
  **Solusi**:
- Mendiagnosa dengan script simulasi (`debug_libp2p.js`).
- Mengganti nama konfigurasi di `src/p2p/bundle.js` menjadi `connectionEncrypters`.

### Masalah 4: GUI Tidak Menampilkan Peer (0 Connected)

**Gejala**: Node sudah "Connected" di terminal, tapi di GUI tertulis "0 Peers".
**Penyebab**: API `/net-peers` masih membaca variabel lama `p2pServer.sockets` (array WebSocket lama), padahal Libp2p menyimpan list koneksi di objek internal `node.getConnections()`.
**Solusi**:

- Membuat _getter_ baru `p2pServer.peers` yang mengambil data langsung dari Libp2p Connection Manager.
- Memperbaiki endpoint API untuk mengembalikan data dari _getter_ baru tersebut.

## 4. Hasil Akhir

Sistem P2P sekarang berjalan **Stabil dan Otomatis**.

| Fitur         | Status       | Keterangan                                                   |
| :------------ | :----------- | :----------------------------------------------------------- |
| **Koneksi**   | ✅ Stabil    | Menggunakan TCP & WebSocket (Port 5001 & 5002)               |
| **Discovery** | ✅ Otomatis  | Node saling menemukan di jaringan WiFi (mDNS) dalam <2 detik |
| **Identitas** | ✅ Persisten | Peer ID tidak berubah meski di-restart                       |
| **Sync**      | ✅ Cepat     | Sinkronisasi blok otomatis saat terkoneksi                   |
| **GUI**       | ✅ Akurat    | Menampilkan jumlah peer dan status koneksi real-time         |

### Cara Menggunakan

1. **Auto-Connect**: Cukup nyalakan 2 node di jaringan WiFi yang sama. Tunggu 5 detik. Selesai.
2. **Manual Connect**: Copy alamat peer dari terminal (`/ip4/.../p2p/Qm...`), paste di GUI node lain -> Link Peer.
