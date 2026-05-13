# GrafKom_Prosedural_Modelling

Demo visual untuk prosedural noise hingga terrain 3D. Semua noise ditulis dari nol (tanpa library noise pihak ketiga), dan visual 3D menggunakan Three.js lokal agar bisa jalan offline.

## Fitur

- Pipeline bertahap: noise 1D → value noise 2D → Perlin → FBM → terrain.
- Step-by-step slider + deskripsi parameter per langkah.
- 3D terrain interaktif (orbit) di langkah terakhir.
- Parameter FBM: `octaves`, `gain`, `lacunarity` + tombol reset.
- Sky gradient, water plane, shading, dan efek visual dasar.

## Struktur Folder

```
GrafKom_Prosedural_Modelling/
├─ index.html
├─ css/
│  └─ styles.css
├─ js/
│  └─ main.js
├─ vendor/
│  └─ three/
│     ├─ OrbitControls.js
│     └─ three.module.js
└─ README.md
```

## Cara Menjalankan

Disarankan pakai server lokal (bukan file://) agar module ES berjalan normal.

Opsi 1 (VS Code Live Server):

1. Klik kanan `index.html` → Open with Live Server.
2. Buka browser dan gunakan slider langkah.

Opsi 2 (Python server):

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Cara Pakai

- Geser slider **Langkah** (0–7) untuk melihat tiap tahap.
- **Langkah 7** menampilkan terrain 3D.
- Gunakan slider parameter FBM untuk mengubah bentuk terrain.
- Klik **Reset Params** untuk kembali ke default.

## Catatan Offline

Three.js sudah disimpan lokal di `vendor/three/`. Pastikan file ini ada:

- `vendor/three/three.module.js`
- `vendor/three/OrbitControls.js`

Jika 3D tidak muncul, pastikan menjalankan lewat server lokal dan bukan file langsung.
