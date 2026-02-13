# Panduan Fitur DEX ShrimpChain

Dokumen ini menjelaskan cara kerja bursa desentralisasi (DEX) di ShrimpChain, mulai dari pembuatan token hingga insentif bagi para pengguna.

---

## 1. Pembuatan Token (Token Creation)

Token di ShrimpChain adalah **Smart Contract**. Untuk membuat token baru:

- **Deploy Kontrak**: Pengembang mengunggah kode kontrak token yang mendefinisikan nama, simbol, dan jumlah pasokan awal (_initial supply_).
- **Kepemilikan**: Setelah sukses di-deploy, pembuat kontrak akan memiliki seluruh pasokan awal token tersebut di alamat wallet mereka.

## 2. Menambah Likuiditas (Add Liquidity)

Agar token bisa diperjualbelikan, harus ada **Liquidity Pool** (kolam likuiditas).

- **Pool Contract**: Sebuah kontrak khusus (AMM Pool) dibuat untuk memasangkan koin utama (SHRIMP) dengan Token baru tersebut.
- **Penyetoran**: Pembuat pasar (Liquidity Provider) menyetorkan sejumlah koin SHRIMP dan sejumlah Token ke dalam alamat kontrak Pool dengan rasio harga tertentu (misal: 1.000 SHRIMP : 1.000 Token).
- **Sync Reserves**: Pool akan mencatat jumlah cadangan ini untuk menentukan harga awal menggunakan rumus matematika $x \times y = k$.

## 3. Jual Bli Token (Trading)

DEX ShrimpChain menggunakan model **Automated Market Maker (AMM)**, di mana harga ditentukan secara otomatis oleh algoritma, bukan oleh buku pesanan (order book).

### A. Beli Token (Swap SHRIMP ke Token)

1. Pengguna mengirim koin **SHRIMP** ke alamat kontrak Pool.
2. Kontrak Pool menghitung berapa banyak Token yang harus diberikan berdasarkan rumus $x \times y = k$.
3. Kontrak Pool otomatis mengirimkan Token ke dompet pengguna.

### B. Jual Token (Swap Token ke SHRIMP)

1. Pengguna mengirimkan **Token** ke alamat kontrak Pool menggunakan fungsi `transfer`.
2. Pengguna kemudian memanggil fungsi `sell` pada kontrak Pool.
3. Kontrak Pool menghitung berapa banyak SHRIMP yang keluar dan mengirimkannya ke dompet pengguna.

## 4. Insentif Setiap Pihak

Ekosistem ini dirancang agar saling menguntungkan:

| Pihak                  | Peran            | Insentif / Keuntungan                                                                                                                                   |
| :--------------------- | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trader**             | Penukar koin     | Bisa mendapatkan token baru secara instan tanpa perlu pihak ketiga (perantara), dengan harga yang transparan.                                           |
| **Liquidity Provider** | Penyedia modal   | Mendapatkan **biaya transaksi (Fee 0.3%)** dari setiap aktivitas swap yang dilakukan oleh trader. Modal mereka tumbuh seiring banyaknya volume trading. |
| **Miner / Node**       | Penjaga jaringan | Mendapatkan **Gas Fee** (biaya transaksi jaringan) dari setiap pemanggilan fungsi Smart Contract (`create` atau `call`).                                |
| **Developer**          | Pembuat proyek   | Bisa menciptakan ekosistem ekonomi baru untuk aplikasi atau komunitas mereka di atas jaringan ShrimpChain.                                              |

---

> [!TIP]
> **Apa itu $x \times y = k$?**
> Ini adalah rumus "Constant Product". Jika seseorang membeli banyak token (mengambil token dari pool), maka harga token tersebut akan naik secara otomatis karena jumlah token di kolam berkurang, menjaga nilai perkalian keduanya tetap sama.
