# Panduan Smart Contract ShrimpChain 🦐

Selamat datang di fitur terbaru ShrimpChain! Dokumen ini akan membantu Anda memahami apa itu Smart Contract di ShrimpChain dan bagaimana cara membuatnya dengan mudah.

## 🤔 Apa itu Smart Contract di ShrimpChain?

Bayangkan Smart Contract sebagai **"Robot Otomatis"** yang hidup di dalam blockchain.

- **Dia punya Memori (State):** Bisa menyimpan data (seperti saldo, nama, atau angka).
- **Dia punya Aturan (Code):** Bisa melakukan tugas tertentu jika Anda memintanya (seperti "tambah angka" atau "ubah nama").
- **Dia Hidup Selamanya:** Sekali Anda menyebarkannya (deploy) ke blockchain, dia akan ada di sana dan bisa diakses oleh siapa saja (sesuai aturan yang Anda buat).

Di ShrimpChain, Smart Contract ditulis menggunakan **JavaScript** biasa. Jika Anda bisa menulis Class JavaScript sederhana, Anda bisa membuat Smart Contract!

---

## 🛠️ Cara Membuat Smart Contract (Langkah demi Langkah)

### 1. Tulis Kode Kontrak Anda

Kontrak adalah sebuah `class` JavaScript yang harus memiliki nama `SmartContract`.

Contoh sederhana: **Mesin Penghitung (Counter)**

```javascript
class SmartContract {
  // 1. Inisialisasi (Dipanggil sekali saat pertama kali dibuat)
  init() {
    this.state.count = 0; // Memori untuk menyimpan angka
    this.state.owner = this.sender; // Menyimpan siapa pembuat kontrak ini
  }

  // 2. Fungsi (Bisa dipanggil oleh user)
  increment(number) {
    this.state.count += number; // Menambah angka ke memori
    console.log("Angka sekarang:", this.state.count);
  }

  // Fungsi lain...
  reset() {
    if (this.sender === this.state.owner) {
      // Hanya pemilik yang bisa reset
      this.state.count = 0;
    }
  }
}
```

**Fitur Khusus:**

- `this.state`: Tempat penyimpanan data kontrak. Apapun yang disimpan di sini akan "abadi" di blockchain.
- `this.sender`: Alamat dompet orang yang memanggil fungsi ini.

### 2. Deploy (Sebarkan) ke Blockchain

Untuk "menghidupkan" kontrak Anda, Anda perlu mengirimnya ke blockchain. Kami sudah menyediakan script otomatis untuk ini.

**Caranya:**

1. Pastikan server blockchain berjalan:
   ```bash
   npm run dev
   ```
2. Jalankan script deploy (Anda bisa mengedit isi kontrak di file ini):
   ```bash
   node scripts/deploy-contract.js
   ```

Script ini akan:

- Mengirim kode Anda ke jaringan.
- Memberikan Anda **Alamat Kontrak** (misal: `abc123...`). Simpan alamat ini untuk berinteraksi nanti!

### 3. Berinteraksi dengan Kontrak

Setelah kontrak hidup, Anda bisa "berbicara" dengannya dengan memanggil fungsi-fungsinya.

**Contoh Panggilan (via Script/Kode):**

```javascript
// Mengirim perintah ke jaringan
const transaction = Transaction.callContract({
  senderWallet: myWallet,
  contractAddress: "ALAMAT_KONTRAK_ANDA", // Alamat dari langkah deploy
  func: "increment", // Nama fungsi yang mau dipanggil
  args: [5], // Argumen (tambah 5)
  fee: 10n,
});
```

---

## 📊 Melihat Data Kontrak (Storage)

Anda bisa melihat isi memori (state) kontrak Anda kapan saja melalui API browser:

Buka di browser:
`http://localhost:3001/smart-contract/storage/ALAMAT_KONTRAK`

Anda akan melihat JSON seperti:

```json
{
  "count": 5,
  "owner": "04a..."
}
```

---

## 🚀 Ringkasan

1. **Tulis** class JavaScript dengan `init()` dan fungsi lain.
2. **Deploy** menggunakan `scripts/deploy-contract.js`.
3. **Panggil** fungsi menggunakan transaksi tipe `CALL_CONTRACT`.
4. **Cek** hasilnya lewat API storage.

Selamat berkarya dengan ShrimpChain Smart Contracts! 🦐
